"""Replay campus recordings; mutate answers only for validation and failure cases."""

import asyncio
import copy
import json
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest

from errors import APIError
from pipeline import timeline as module
from pipeline.ingest import IngestedVideo
from pipeline.timeline import (
    GeminiTimelineClient, TimelineError, TimelineServiceError, TimelineValidationError,
    draft_timeline, estimated_cost, parse_timeline, total_spend,
)
from scripts.timeline_live import edit_distance, recording_text, room_matches, turn_sequence


RECORDINGS = Path(__file__).parent / "recordings"
GOOD_RECORDING = RECORDINGS / "route2-take1-1080p-2fps.json"
GOOD_DURATION = 37.54
ROUTE1_TRUTH = "right,stairs_up,u_turn,stairs_up,right,left"
LIVE_CASES = [
    (f"route{route}-take{take}-1080p-{fps}fps.json", duration,
     ROUTE1_TRUTH if route == 1 else "right", "215" if route == 1 else "113", distance)
    for route, take, duration, distances in [
        (1, 1, 44.26, (1, 0, 1)), (1, 2, 43.76, (1, 0, 0)),
        (2, 1, 37.54, (0, 0, 0)), (2, 2, 38.25, (0, 0, 0)),
    ]
    for fps, distance in zip((1, 2, 4), distances, strict=True)
]


def event(kind="walk", start=0, end=6, confidence=0.9, note=""):
    return dict(type=kind, startSec=start, endSec=end, confidence=confidence, note=note)


def answer(events=None, **changes):
    recorded = json.loads(GOOD_RECORDING.read_text())
    if events is not None:
        recorded["events"] = events
    return json.dumps(recorded | changes)


class FakeClient:
    def __init__(self, *responses):
        self.responses = iter(responses)
        self.calls = []

    async def generate(self, video, **kwargs):
        self.calls.append((video, kwargs))
        response = next(self.responses)
        if isinstance(response, Exception):
            raise response
        return response


@pytest.fixture
def video(tmp_path):
    path = tmp_path / "stripped.mov"
    path.write_bytes(b"fake metadata-free video; never uploaded")
    return IngestedVideo(path, GOOD_DURATION, "b" * 64)


def run(video, data_dir, client, **kwargs):
    return asyncio.run(draft_timeline(
        video, client=client, data_dir=data_dir, cap=kwargs.pop("cap", Decimal(14)), **kwargs,
    ))


def ledger(data_dir):
    return [json.loads(line) for line in (data_dir / "spend.jsonl").read_text().splitlines()]


def test_parse_good_answer_and_schema_order():
    parsed = parse_timeline(answer(), GOOD_DURATION)
    assert parsed.startFloor == "unknown"
    assert parsed.endRoom == "113"
    assert turn_sequence(parsed) == ["right"]
    assert list(module.TIMELINE_SCHEMA["properties"]) == ["startFloor", "endRoom", "motionLog", "events"]
    assert parse_timeline(answer(endRoom=None), GOOD_DURATION).endRoom is None


@pytest.mark.parametrize(("events", "message"), [
    ([event(start=3, end=4), event(start=1, end=2)], "out of order"),
    ([event(start=2, end=2)], "positive length"),
    ([event(start=3, end=2)], "positive length"),
    ([event(end=7.01)], "outside the video duration"),
    ([event(start=6, end=7)], "outside the video duration"),
    ([event(start=0, end=3), event(start=2.49, end=6)], "overlap"),
    ([event(start=0, end=3), event(start=2.8, end=2.9)], "overlap"),
])
def test_temporal_validation(events, message):
    with pytest.raises(TimelineValidationError, match=message):
        parse_timeline(answer(events), 6)


@pytest.mark.parametrize("events", [
    [event(start=-0.1)], [event(confidence=1.01)], [event(confidence=-0.1)],
    [event(kind="elevator")], [event(end=float("nan"))], [event(end=float("inf"))],
    [event(start="0")], [dict(type="walk", startSec=0, endSec=1, confidence=0.9)],
    [event() | {"extra": True}],
])
def test_schema_rejects_invalid_values(events):
    with pytest.raises(TimelineValidationError, match="schema"):
        parse_timeline(answer(events), 6)


@pytest.mark.parametrize("raw", ["not json", answer(motionLog=[]), answer(motionLog=["walk"] * 3)])
def test_invalid_json_or_motion_log(raw):
    with pytest.raises(TimelineValidationError):
        parse_timeline(raw, 6)


def test_motion_log_includes_final_partial_interval():
    parsed = parse_timeline(answer(), GOOD_DURATION)
    assert len(parsed.motionLog) == 19
    assert module.validation_warnings(parsed, GOOD_DURATION) == ()


@pytest.mark.parametrize("motion_log", [["forward"], ["still"] * 4, ["on_stairs"] * 22])
def test_motion_log_length_mismatch_is_preserved_with_warning(video, data_dir, motion_log):
    client = FakeClient(answer(motionLog=motion_log))
    result = run(video, data_dir, client)
    assert result.timeline.motionLog == motion_log
    assert result.warnings == (
        f"Motion log has {len(motion_log)} {'entry' if len(motion_log) == 1 else 'entries'}; expected 19 for 37.54 seconds. Kept as returned.",
    )
    assert len(client.calls) == len(ledger(data_dir)) == 1
    cached = run(video, data_dir, FakeClient())
    assert cached.warnings == result.warnings
    assert cached.timeline.motionLog == motion_log


@pytest.mark.parametrize("overrun", [0.01, 0.5, 1.0])
def test_end_overrun_up_to_one_second_is_clamped(overrun):
    parsed = parse_timeline(answer([event(end=6 + overrun)]), 6)
    assert parsed.events[0].endSec == 6


def test_end_clamp_and_small_overlap_still_leave_positive_nonoverlapping_events():
    parsed = parse_timeline(answer([event(end=5), event("door", 4.5, 7)]), 6)
    assert [(e.startSec, e.endSec) for e in parsed.events] == [(0, 5), (5, 6)]


@pytest.mark.parametrize("overlap", [0.1, 0.5])
def test_trim_small_overlap(overlap):
    parsed = parse_timeline(answer([event(end=3), event("turn_left", 3 - overlap, 6)]), 6)
    assert parsed.events[1].startSec == 3
    assert parsed.events[1].endSec == 6


def test_fill_leading_middle_and_trailing_gaps():
    parsed = parse_timeline(answer([event("turn_right", 1, 2), event("door", 4, 5)]), 6)
    assert [(e.type, e.startSec, e.endSec) for e in parsed.events] == [
        ("walk", 0, 1), ("turn_right", 1, 2), ("walk", 2, 4), ("door", 4, 5), ("walk", 5, 6),
    ]
    assert all(e.confidence == 0 and "review" in e.note for e in parsed.events if e.type == "walk")
    assert parse_timeline(answer([]), 6).events[0].endSec == 6


@pytest.mark.parametrize("failure", [TimeoutError(), TimelineServiceError(503), TimelineServiceError(429), answer([event(end=GOOD_DURATION + 1.01)])])
def test_retry_once_then_succeed(video, data_dir, failure):
    client = FakeClient(failure, answer())
    result = run(video, data_dir, client)
    assert len(client.calls) == 2
    assert result.timeline.endRoom == "113"
    assert result.cost_usd == 2 * estimated_cost(GOOD_DURATION, 2)
    assert [entry["outcome"] for entry in ledger(data_dir)] == ["failed", "validated"]
    assert client.calls[0][1] == dict(fps=2, prompt=module.TIMELINE_PROMPT, schema=module.TIMELINE_SCHEMA)


@pytest.mark.parametrize(("failure", "message"), [
    (TimeoutError(), "timed out"), (TimelineServiceError(500), "HTTP 500"),
    (TimelineServiceError(429), "HTTP 429"), (answer([event(end=GOOD_DURATION + 1.01)]), "outside the video duration"),
])
def test_retry_exhausted_has_clear_error(video, data_dir, failure, message):
    client = FakeClient(failure, failure)
    with pytest.raises(TimelineError, match=f"two attempts: .*{message}"):
        run(video, data_dir, client)
    assert len(client.calls) == len(ledger(data_dir)) == 2
    assert not list((data_dir / "timelines").glob("*.json"))


def test_deadline_cancels_the_entire_attempt(video, data_dir, monkeypatch):
    class WaitingClient:
        calls = 0
        cancelled = 0

        async def generate(self, *args, **kwargs):
            self.calls += 1
            try:
                await asyncio.Event().wait()
            finally:
                self.cancelled += 1

    assert module.CALL_TIMEOUT_SECONDS == 180
    monkeypatch.setattr(module, "CALL_TIMEOUT_SECONDS", 0.01)
    client = WaitingClient()
    with pytest.raises(TimelineError, match="two attempts: .*timed out"):
        run(video, data_dir, client)
    assert client.calls == client.cancelled == 2
    assert len(ledger(data_dir)) == 2


def test_nonretryable_error_stops_after_one_attempt(video, data_dir):
    client = FakeClient(TimelineServiceError(400))
    with pytest.raises(TimelineError, match="one attempt: .*HTTP 400"):
        run(video, data_dir, client)
    assert len(client.calls) == len(ledger(data_dir)) == 1


def test_zero_cap_never_calls_client(video, data_dir):
    client = FakeClient()
    with pytest.raises(APIError) as error:
        run(video, data_dir, client, cap=Decimal(0))
    assert error.value.code == "budget_exceeded"
    assert client.calls == []
    assert not data_dir.exists()


def test_budget_is_checked_again_before_retry(video, data_dir):
    client = FakeClient(TimeoutError(), answer())
    with pytest.raises(APIError, match="spend cap"):
        run(video, data_dir, client, cap=Decimal("0.001"))
    assert len(client.calls) == len(ledger(data_dir)) == 1


def test_cache_hit_never_calls_or_logs_even_when_cap_reached(video, data_dir):
    initial = run(video, data_dir, FakeClient(answer()))
    before = (data_dir / "spend.jsonl").read_bytes()
    cache = data_dir / "timelines" / f"{video.sha256}-2fps.json"
    assert json.loads(cache.read_text())["timeline"] == initial.timeline.model_dump()
    client = FakeClient()
    hit = run(video, data_dir, client, cap=Decimal(0), fps=2.0)
    assert hit.cached and hit.cost_usd == 0
    assert hit.timeline == initial.timeline and hit.raw_answer == initial.raw_answer
    assert client.calls == []
    assert (data_dir / "spend.jsonl").read_bytes() == before


def test_frame_rates_use_distinct_caches_and_scale_spend(video, data_dir):
    client = FakeClient(answer(), answer())
    run(video, data_dir, client, fps=1)
    run(video, data_dir, client, fps=2)
    assert len(client.calls) == 2
    entries = ledger(data_dir)
    assert entries[1]["costUsd"] == entries[0]["costUsd"] * 2
    assert total_spend(data_dir) == sum((Decimal(str(e["costUsd"])) for e in entries), Decimal(0))
    assert estimated_cost(86, 1) == Decimal("0.06")


def test_close_frame_rates_do_not_share_cache(video, data_dir):
    client = FakeClient(answer(), answer())
    run(video, data_dir, client, fps=1)
    run(video, data_dir, client, fps=1.0000001)
    assert len(client.calls) == 2
    assert len(list((data_dir / "timelines").glob("*.json"))) == 2


def test_corrupt_cache_fails_without_call_or_new_spend(video, data_dir):
    run(video, data_dir, FakeClient(answer()))
    before = (data_dir / "spend.jsonl").read_bytes()
    (data_dir / "timelines" / f"{video.sha256}-2fps.json").write_text("{bad json")
    client = FakeClient()
    with pytest.raises(TimelineError, match="Cached timeline is invalid"):
        run(video, data_dir, client)
    assert not client.calls
    assert (data_dir / "spend.jsonl").read_bytes() == before


def test_raw_paths_are_refused(data_dir, tmp_path):
    client = FakeClient()
    with pytest.raises(TypeError, match="ingest_video"):
        run(tmp_path / "unstripped.mov", data_dir, client)
    assert not client.calls


@pytest.mark.parametrize(("fps", "cap"), [(0, Decimal(14)), (float("nan"), Decimal(14)), (1, Decimal("NaN")), (1, Decimal(-1))])
def test_invalid_settings_fail_before_call(video, data_dir, fps, cap):
    client = FakeClient()
    with pytest.raises(ValueError):
        run(video, data_dir, client, fps=fps, cap=cap)
    assert not client.calls and not data_dir.exists()


@pytest.mark.parametrize(("actual", "truth", "distance"), [
    ([], [], 0), (["right"], [], 1), ([], ["right"], 1),
    (["left"], ["right"], 1), (["right", "stairs_up"], ["stairs_up"], 1),
    (["right", "stairs_up", "u_turn_left", "stairs_up", "turn_right", "turn_left"],
     ["right", "stairs_up", "u_turn", "stairs_up", "right", "left"], 0),
    (["u_turn_right", "turn_into_room"], ["u_turn", "turn_into_room"], 0),
])
def test_edit_distance(actual, truth, distance):
    assert edit_distance(actual, truth) == distance


def test_turn_sequence_excludes_walk_doors_signs_and_pans():
    kinds = ["walk", "door", "sign", "pan", "turn_left", "turn_right", "u_turn_left", "u_turn_right", "stairs_up", "stairs_down", "turn_into_room"]
    parsed = parse_timeline(answer([event(kind, i / 2, (i + 1) / 2) for i, kind in enumerate(kinds)]), 6)
    assert turn_sequence(parsed) == ["left", "right", "u_turn", "u_turn", "stairs_up", "stairs_down", "turn_into_room"]


def test_adapter_uploads_polls_and_uses_documented_interactions_request(video, monkeypatch):
    calls = []

    async def upload(**kwargs):
        calls.append(("upload", kwargs))
        return SimpleNamespace(name="files/fake", uri="fake-upload", state=SimpleNamespace(name="PROCESSING"))

    async def get(**kwargs):
        calls.append(("get", kwargs))
        return SimpleNamespace(name="files/fake", uri="fake-upload", state="ACTIVE")

    async def create(**kwargs):
        calls.append(("create", kwargs))
        return SimpleNamespace(steps=[SimpleNamespace(type="model_output", content=[SimpleNamespace(type="text", text=answer())])])

    async def no_sleep(_seconds):
        pass

    monkeypatch.setattr(module.asyncio, "sleep", no_sleep)
    sdk = SimpleNamespace(aio=SimpleNamespace(files=SimpleNamespace(upload=upload, get=get), interactions=SimpleNamespace(create=create)))
    raw = asyncio.run(GeminiTimelineClient(sdk).generate(video, fps=2, prompt="prompt", schema=copy.deepcopy(module.TIMELINE_SCHEMA)))
    assert raw == answer()
    assert [name for name, _ in calls] == ["upload", "get", "create"]
    assert calls[0][1] == {"file": video.path, "config": {"mime_type": "video/mov"}}
    request = calls[-1][1]
    assert request == dict(
        model="gemini-4-hydrogen", input=[{
            "type": "video", "uri": "fake-upload", "mime_type": "video/mov",
            "resolution": "high", "processing": {"type": "static", "fps": 2},
        }, {"type": "text", "text": "prompt"}],
        response_format={"type": "text", "mime_type": "application/json", "schema": module.TIMELINE_SCHEMA},
        automatic_continuation=False,
    )


@pytest.mark.parametrize("code_attribute", ["status_code", "code"])
def test_adapter_translates_sdk_http_errors_without_echoing_details(video, code_attribute):
    class FakeSDKError(Exception):
        pass

    failure = FakeSDKError("private provider request details")
    setattr(failure, code_attribute, 503)

    async def upload(**kwargs):
        raise failure

    sdk = SimpleNamespace(aio=SimpleNamespace(files=SimpleNamespace(upload=upload)))
    with pytest.raises(TimelineServiceError, match=r"HTTP 503") as error:
        asyncio.run(GeminiTimelineClient(sdk).generate(video, fps=1, prompt="prompt", schema={}))
    assert "private" not in str(error.value)


def test_adapter_translates_sdk_timeout(video):
    class FakeAPITimeoutError(Exception):
        pass

    async def upload(**kwargs):
        raise FakeAPITimeoutError("private provider request details")

    sdk = SimpleNamespace(aio=SimpleNamespace(files=SimpleNamespace(upload=upload)))
    with pytest.raises(TimeoutError):
        asyncio.run(GeminiTimelineClient(sdk).generate(video, fps=1, prompt="prompt", schema={}))


@pytest.mark.parametrize("use_legacy_outputs", [False, True])
def test_adapter_returns_empty_text_for_recording_before_validation(video, use_legacy_outputs):
    async def upload(**kwargs):
        return SimpleNamespace(state="ACTIVE", uri="fake-upload")

    async def create(**kwargs):
        return SimpleNamespace(**({"outputs": []} if use_legacy_outputs else {"steps": []}))

    sdk = SimpleNamespace(aio=SimpleNamespace(files=SimpleNamespace(upload=upload), interactions=SimpleNamespace(create=create)))
    raw = asyncio.run(GeminiTimelineClient(sdk).generate(video, fps=1, prompt="prompt", schema={}))
    assert raw == ""
    with pytest.raises(TimelineValidationError, match="schema"):
        parse_timeline(raw, video.duration_seconds)


def test_recording_keeps_only_answer_and_redacts_file_references():
    raw = answer([event(note="file:///private/video.mov gs://bucket/video https://example.test/files/private")])
    cleaned = recording_text(raw)
    assert json.loads(cleaned)["events"][0]["note"] == "[file reference removed] [file reference removed] [file reference removed]"


def test_recording_remains_json_with_escaped_quotes_and_backslashes():
    raw = answer([event(note='file:///private/a\\b"quoted.mov')])
    cleaned = recording_text(raw)
    assert "file:///private" not in cleaned
    assert "quoted.mov" in json.loads(cleaned)["events"][0]["note"]


def test_live_script_missing_environment_exits_without_client(live_harness, monkeypatch, capsys):
    timeline_live, _calls = live_harness
    # Replace the environment with an empty fake; never read the actual key.
    monkeypatch.setattr(timeline_live.os, "environ", {})
    monkeypatch.setattr(timeline_live, "create_gemini_client", lambda *_: pytest.fail("Live client constructed"))
    assert timeline_live.main(["unused.mov", "--truth", "right", "--label", "test"]) == 1
    assert "must already be set" in capsys.readouterr().out


@pytest.fixture
def live_harness(tmp_path, monkeypatch):
    from scripts import timeline_live

    monkeypatch.setattr(timeline_live, "SERVER_DIR", tmp_path)
    # A fake mapping satisfies the manual command's configuration gate; no real
    # environment key or SDK is read, and the value is never passed to a service.
    monkeypatch.setattr(timeline_live.os, "environ", {
        "GEMINI_API_KEY": "unused-offline-marker", "BUDGET_CAP_USD": "14",
    })
    calls = []

    def ingest(source, stripped):
        calls.append("ingest")
        stripped.write_bytes(b"stripped fake")
        return IngestedVideo(stripped, GOOD_DURATION, "a" * 64)

    class LiveFakeClient(FakeClient):
        async def aclose(self):
            calls.append("close")

    def factory(_unused):
        calls.append("factory")
        return LiveFakeClient(answer())

    monkeypatch.setattr(timeline_live, "ingest_video", ingest)
    monkeypatch.setattr(timeline_live, "create_gemini_client", factory)
    return timeline_live, calls


@pytest.mark.parametrize("yes_flag", [False, True])
def test_live_script_ingests_then_confirms_and_saves_raw_json(live_harness, tmp_path, monkeypatch, capsys, yes_flag):
    live, calls = live_harness

    def confirm(prompt):
        assert prompt == "Proceed with paid call? [y/N] "
        assert calls == ["ingest"]
        calls.append("confirmed")
        return "y"

    monkeypatch.setattr("builtins.input", confirm if not yes_flag else lambda *_: pytest.fail("--yes prompted"))
    args = ["unstripped.mov", "--truth", "right", "--label", "route1-take1-720p", "--room", "113"]
    assert live.main(args + (["--yes"] if yes_flag else [])) == 0
    assert calls == ["ingest", *([] if yes_flag else ["confirmed"]), "factory", "close"]
    saved = tmp_path / "tests" / "recordings" / "route1-take1-720p-2fps.json"
    assert json.loads(saved.read_text()) == json.loads(answer())
    attempt = saved.with_stem(f"{saved.stem}-attempt1")
    assert json.loads(attempt.read_text()) == json.loads(answer())
    output = capsys.readouterr().out
    for expected in ["Spend so far: $0.0000", "cap: $14.0000", "Returned: right", "Truth: right", "Edit distance: 0", 'endRoom: "113"; expected: "113"', "Cost (estimate):", "total spend:"]:
        assert expected in output
    assert "unused-offline-marker" not in output


@pytest.mark.parametrize("response", ["", "n"])
def test_live_script_default_no_never_constructs_client(live_harness, tmp_path, monkeypatch, response):
    live, calls = live_harness
    monkeypatch.setattr("builtins.input", lambda *_: response)
    assert live.main(["source.mov", "--truth", "right", "--label", "cancelled"]) == 0
    assert calls == ["ingest"]
    assert not (tmp_path / "data").exists()
    assert not (tmp_path / "tests").exists()


def test_live_script_never_overwrites_recording(live_harness, tmp_path):
    live, calls = live_harness
    saved = tmp_path / "tests" / "recordings" / "existing-2fps.json"
    saved.parent.mkdir(parents=True)
    saved.write_text("original recording")
    assert live.main(["source.mov", "--truth", "right", "--label", "existing", "--yes"]) == 1
    assert calls == ["ingest"]
    assert saved.read_text() == "original recording"


@pytest.mark.parametrize("raw", [answer([event(end=GOOD_DURATION + 2)]), answer(motionLog=[]), "not valid JSON", ""])
def test_live_saves_every_invalid_answer_before_validation(live_harness, tmp_path, monkeypatch, raw):
    live, _calls = live_harness
    client = FakeClient(raw, raw)

    async def close():
        pass

    client.aclose = close
    monkeypatch.setattr(live, "create_gemini_client", lambda *_: client)
    original_parse = module.parse_timeline
    validations = []
    recordings = tmp_path / "tests" / "recordings"

    def validate(saved_raw, duration):
        validations.append(saved_raw)
        saved = recordings / f"failed-2fps-attempt{len(validations)}.json"
        assert saved.is_file(), "Paid answer was not saved before validation"
        if raw in {"not valid JSON", ""}:
            assert saved.read_text() == raw
        else:
            assert json.loads(saved.read_text()) == json.loads(raw)
        return original_parse(saved_raw, duration)

    monkeypatch.setattr(module, "parse_timeline", validate)
    assert live.main(["source.mov", "--truth", "right", "--label", "failed", "--yes"]) == 1
    assert len(validations) == len(client.calls) == 2
    assert not (recordings / "failed-2fps.json").exists()
    assert len(ledger(tmp_path / "data")) == 2


def test_failed_answer_is_retained_when_retry_succeeds(live_harness, tmp_path, monkeypatch, capsys):
    live, _calls = live_harness
    invalid = answer([event(end=GOOD_DURATION + 2)])
    client = FakeClient(invalid, answer(motionLog=["forward"]))

    async def close():
        pass

    client.aclose = close
    monkeypatch.setattr(live, "create_gemini_client", lambda *_: client)
    assert live.main(["source.mov", "--truth", "right", "--label", "retry", "--yes"]) == 0
    recordings = tmp_path / "tests" / "recordings"
    assert json.loads((recordings / "retry-2fps-attempt1.json").read_text()) == json.loads(invalid)
    assert json.loads((recordings / "retry-2fps-attempt2.json").read_text()) == json.loads(answer(motionLog=["forward"]))
    assert (recordings / "retry-2fps.json").read_bytes() == (recordings / "retry-2fps-attempt2.json").read_bytes()
    assert "Warning: Motion log has 1 entry; expected 19" in capsys.readouterr().out


def test_existing_attempt_is_protected_before_any_call(live_harness, tmp_path):
    live, calls = live_harness
    saved = tmp_path / "tests" / "recordings" / "existing-2fps-attempt1.json"
    saved.parent.mkdir(parents=True)
    saved.write_text("prior paid answer")
    assert live.main(["source.mov", "--truth", "right", "--label", "existing", "--yes"]) == 1
    assert calls == ["ingest"]
    assert saved.read_text() == "prior paid answer"


def test_recording_write_failure_does_not_trigger_another_paid_attempt(video, data_dir):
    client = FakeClient(answer(), answer())

    def cannot_save(raw, attempt):
        raise OSError("disk full")

    with pytest.raises(OSError, match="disk full"):
        run(video, data_dir, client, on_raw_answer=cannot_save)
    assert len(client.calls) == len(ledger(data_dir)) == 1


def test_replay_never_reads_keys_or_touches_client_ingest_spend_or_recordings(tmp_path, monkeypatch, capsys):
    from scripts import timeline_live as live

    raw = tmp_path / "raw.json"
    raw.write_text(answer(motionLog=["forward"]))
    monkeypatch.setattr(live, "SERVER_DIR", tmp_path)
    for name in ("create_gemini_client", "ingest_video", "total_spend", "save_recording", "draft_timeline"):
        monkeypatch.setattr(live, name, lambda *a, **k: pytest.fail("Replay touched live processing"))
    assert live.main(["--replay", str(raw), "--duration", str(GOOD_DURATION), "--truth", "right", "--room", "113"]) == 0
    assert capsys.readouterr().out == (
        "Warning: Motion log has 1 entry; expected 19 for 37.54 seconds. Kept as returned.\n"
        "Returned: right\n"
        "Truth: right\n"
        "Edit distance: 0\n"
        'endRoom: "113"; expected: "113"\n'
        'Room match: True\n'
        "Replay cost: $0.0000 (no API call)\n"
    )
    assert list(tmp_path.iterdir()) == [raw]


@pytest.mark.parametrize("raw_answer", ["bad json", answer(motionLog=[]), answer([event(end=8)])])
def test_replay_reports_validation_failure_offline(tmp_path, monkeypatch, capsys, raw_answer):
    from scripts import timeline_live as live

    raw = tmp_path / "raw.json"
    raw.write_text(raw_answer)
    monkeypatch.setattr(live, "create_gemini_client", lambda *_: pytest.fail("Replay constructed a client"))
    assert live.main(["--replay", str(raw), "--duration", "6", "--truth", "right"]) == 1
    assert "Replay failed:" in capsys.readouterr().out


@pytest.mark.parametrize("duration", [None, "0", "-1", "nan", "inf"])
def test_replay_requires_valid_duration_without_key_access(duration):
    from scripts import timeline_live as live

    args = ["--replay", "unused.json", "--truth", "right"]
    if duration is not None:
        args += ["--duration", duration]
    with pytest.raises(SystemExit) as error:
        live.main(args)
    assert error.value.code == 2


@pytest.mark.parametrize(
    ("filename", "duration", "truth", "room", "distance"), LIVE_CASES,
    ids=[case[0] for case in LIVE_CASES],
)
def test_replay_campus_recordings(filename, duration, truth, room, distance, monkeypatch, capsys):
    from scripts import timeline_live as live

    raw = (RECORDINGS / filename).read_text()
    timeline = parse_timeline(raw, duration)
    assert edit_distance(turn_sequence(timeline), truth.split(",")) == distance
    assert room_matches(timeline.endRoom, room)
    # Comparison never rewrites what Gemini actually read.
    assert timeline.endRoom == json.loads(raw)["endRoom"]
    for name in ("create_gemini_client", "ingest_video", "draft_timeline", "total_spend", "save_recording"):
        monkeypatch.setattr(live, name, lambda *a, **k: pytest.fail("Replay touched live processing"))
    assert live.main([
        "--replay", str(RECORDINGS / filename), "--duration", str(duration),
        "--truth", truth, "--room", room,
    ]) == 0
    output = capsys.readouterr().out
    assert f"Edit distance: {distance}\n" in output
    assert "Room match: True\n" in output
    assert "Replay cost: $0.0000 (no API call)\n" in output


@pytest.mark.parametrize(("observed", "expected", "matches"), [
    ("D215", "215", True), (" d 215 ", "215", True),
    ("Building D: 215", "215", True), ("D215a", "215A", True),
    ("113", "113", True), ("D215", "216", False), ("D215A", "215", False),
    (None, "215", False), ("", "215", False), ("215", None, False),
])
def test_room_matching(observed, expected, matches):
    assert room_matches(observed, expected) is matches


@pytest.mark.parametrize("existing_recording", [False, True])
def test_cli_cache_precedes_keys_budget_confirmation_and_recording(
    live_harness, tmp_path, monkeypatch, capsys, existing_recording,
):
    live, calls = live_harness
    seeded = IngestedVideo(tmp_path / "stripped.mov", GOOD_DURATION, "a" * 64)
    run(seeded, tmp_path / "data", FakeClient(answer()))
    if existing_recording:
        recording = tmp_path / "tests" / "recordings" / "cached-2fps.json"
        recording.parent.mkdir(parents=True)
        recording.write_text("existing recording")
    before = {path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}
    # Cache hits do not need a key and work even when the configured cap is zero.
    monkeypatch.setattr(live.os, "environ", {"BUDGET_CAP_USD": "0"})
    for name in ("check_budget", "total_spend", "create_gemini_client", "draft_timeline", "save_recording"):
        monkeypatch.setattr(live, name, lambda *a, **k: pytest.fail("Cache hit touched paid path"))
    monkeypatch.setattr("builtins.input", lambda *_: pytest.fail("Cache hit prompted"))
    for _ in range(2):
        assert live.main([
            "source.mov", "--truth", "right", "--label", "cached", "--room", "113",
        ]) == 0
    assert calls == ["ingest", "ingest"]
    output = capsys.readouterr().out
    assert output.count("Cache hit: True, $0\n") == 2
    assert output.count("Room match: True\n") == 2
    assert "Spend so far" not in output
    after = {path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}
    assert after == before


def test_cli_zero_cap_on_miss_stops_before_confirmation(live_harness, monkeypatch, capsys):
    live, calls = live_harness
    monkeypatch.setattr(live.os, "environ", {
        "GEMINI_API_KEY": "unused-offline-marker", "BUDGET_CAP_USD": "0",
    })
    monkeypatch.setattr("builtins.input", lambda *_: pytest.fail("Exhausted cap prompted"))
    assert live.main(["source.mov", "--truth", "right", "--label", "no-budget"]) == 1
    assert calls == ["ingest"]
    assert "budget_exceeded" in capsys.readouterr().out
