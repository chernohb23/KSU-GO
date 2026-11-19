import json
from decimal import Decimal
from threading import Event
from time import monotonic, sleep

import pytest
from fastapi.testclient import TestClient

from conftest import FIXTURES_DIR
from main import create_app
from models import Route
from pipeline.ingest import IngestedVideo
from pipeline.timeline import TimelineServiceError, estimated_cost
from store import Store
from video_helpers import movie_bytes, upload, wait_for_draft


ANSWER = json.dumps(dict(startFloor="unknown", endRoom=None, motionLog=["forward"], events=[
    dict(type="walk", startSec=0, endSec=1, confidence=0.9, note="hallway"),
]))


class FakeClient:
    def __init__(self, response=ANSWER):
        self.response = response
        self.calls = []

    async def generate(self, video, **kwargs):
        self.calls.append((video, kwargs))
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def live_client(data_dir, monkeypatch, fake, *, cap="14"):
    monkeypatch.setenv("PIPELINE_MODE", "live")
    monkeypatch.setenv("BUDGET_CAP_USD", cap)
    return TestClient(create_app(data_dir=data_dir, timeline_client_factory=lambda: fake))


def terminal_route(client, route_id):
    deadline = monotonic() + 4
    while monotonic() < deadline:
        route = client.get(f"/api/routes/{route_id}").json()
        if route["status"] != "processing":
            return route
        sleep(0.01)
    pytest.fail("Worker left route processing")


def test_live_upload_stages_steps_stats_and_cache_hit(data_dir, monkeypatch):
    fake = FakeClient()
    stages = []
    original = Store.update_upload

    def track(self, route, **kwargs):
        if route.progress:
            stages.append(route.progress.stage)
        return original(self, route, **kwargs)

    monkeypatch.setattr(Store, "update_upload", track)
    with live_client(data_dir, monkeypatch, fake) as client:
        pending = upload(client, destinationFloor="1")
        assert pending.status_code == 202 and pending.json()["status"] == "processing"
        draft, _ = wait_for_draft(client, pending.json()["id"])
        assert stages == ["timeline", "assemble", "verify"]
        assert draft["steps"][0]["type"] == draft["steps"][-1]["type"] == "door"
        assert draft["steps"][-1]["label"] == "Room 204"
        assert draft["checks"] and not any(c["level"] == "fail" for c in draft["checks"])
        assert draft["corridorWidthM"] == 2.0 and draft["ceilingHeightM"] == 2.7
        assert draft["stats"]["videoSec"] == 1 and draft["stats"]["processingSec"] > 0
        assert draft["stats"]["costUsd"] == float(estimated_cost(1, 2))
        assert len(fake.calls) == 1 and fake.calls[0][1]["fps"] == 2
        assert isinstance(fake.calls[0][0], IngestedVideo)
        assert fake.calls[0][0].path.parent == data_dir / "videos"
        ledger = (data_dir / "spend.jsonl").read_bytes()
        assert not list((data_dir / "uploads").iterdir())

    # Cache reuse must bypass even the factory, SDK imports and credential reads.
    def no_factory():
        pytest.fail("Cache hit constructed a client")

    with TestClient(create_app(data_dir=data_dir, timeline_client_factory=no_factory)) as client:
        hit, _ = wait_for_draft(client, upload(client, destinationFloor="1").json()["id"])
        assert hit["stats"]["costUsd"] == 0
        assert hit["steps"] == draft["steps"]
        assert (data_dir / "spend.jsonl").read_bytes() == ledger


def test_timeline_failure_is_readable_and_never_leaks_details(data_dir, monkeypatch, caplog):
    fake = FakeClient(TimelineServiceError(400))
    with live_client(data_dir, monkeypatch, fake) as client:
        route = terminal_route(client, upload(client).json()["id"])
        assert route["status"] == "failed" and route["progress"] is None
        assert route["error"] == "The AI couldn't read the video. Please try again."
        assert len(fake.calls) == 1
        assert "Traceback" not in caplog.text


@pytest.mark.parametrize("motion_entries", [1, 2, 3])
def test_motion_log_length_diagnostics_are_logged_only_for_fresh_and_cached_runs(
    data_dir, monkeypatch, caplog, motion_entries,
):
    answer = json.loads(ANSWER)
    answer["motionLog"] = ["forward"] * motion_entries
    fake = FakeClient(json.dumps(answer))
    with live_client(data_dir, monkeypatch, fake) as client:
        for cached in (False, True):
            caplog.clear()
            pending = upload(client, video=movie_bytes(seconds=4), destinationFloor="1")
            draft, _ = wait_for_draft(client, pending.json()["id"])
            assert draft["stats"]["costUsd"] == (0 if cached else float(estimated_cost(4, 2)))
            diagnostics = [record for record in caplog.records
                           if record.name == "pipeline.run" and record.levelname == "WARNING"]
            assert len(diagnostics) == (0 if motion_entries == 2 else 1)
            if diagnostics:
                assert draft["id"] in diagnostics[0].getMessage()
                assert f"Motion log has {motion_entries}" in diagnostics[0].getMessage()
                assert "expected 2 for 4 seconds" in diagnostics[0].getMessage()
            assert [check["id"] for check in draft["checks"]] == ["leg_length_range"]
            updated = client.put(f"/api/routes/{draft['id']}/steps", json={"steps": draft["steps"]})
            assert updated.status_code == 200 and updated.json()["checks"] == draft["checks"]
        assert len(fake.calls) == 1


def test_zero_cap_upload_refused_before_client_or_route(data_dir, monkeypatch):
    fake = FakeClient()
    with live_client(data_dir, monkeypatch, fake, cap="0") as client:
        response = upload(client)
        assert response.status_code == 402
        assert response.json()["error"]["code"] == "budget_exceeded"
        assert "spend cap" in response.json()["error"]["message"]
    assert not fake.calls and not data_dir.exists()


def test_worker_at_zero_cap_marks_accepted_route_failed(data_dir, tmp_path, monkeypatch):
    import mock_pipeline

    fake = FakeClient()
    route = Route.model_validate_json((FIXTURES_DIR / "route.draft-flawed.json").read_bytes())
    route = route.model_copy(update={"status": "processing", "steps": [], "checks": [], "stats": None})
    store = Store(data_dir, FIXTURES_DIR)
    store.add_upload(route, None, "live")
    source, stripped = tmp_path / "source.mov", tmp_path / "stripped.mov"
    source.write_bytes(b"offline fake")
    monkeypatch.setattr(mock_pipeline, "ingest_video", lambda *_: IngestedVideo(stripped, 1, "c" * 64))
    mock_pipeline.run_pipeline(store, route, route, 1, "live", Event(), source, stripped,
                               data_dir=data_dir, cap=Decimal(0), client_factory=lambda: fake)
    failed = store.get_route(route.id)
    assert failed.status == "failed" and "spend cap is reached" in failed.error
    assert failed.progress is None and not fake.calls and not source.exists()
    assert not (data_dir / "spend.jsonl").exists()


def test_health_and_route_respond_during_blocking_fake_live_call(data_dir, monkeypatch):
    entered, release = Event(), Event()

    class SlowClient(FakeClient):
        async def generate(self, video, **kwargs):
            entered.set()
            # Deliberately blocking: proves the call runs outside the ASGI loop.
            assert release.wait(3)
            return await super().generate(video, **kwargs)

    with live_client(data_dir, monkeypatch, SlowClient()) as client:
        pending = upload(client).json()
        try:
            assert entered.wait(2)
            start = monotonic()
            assert client.get("/api/health").json() == {"ok": True, "pipelineMode": "live"}
            assert monotonic() - start < 0.5
            start = monotonic()
            route = client.get(f"/api/routes/{pending['id']}").json()
            assert monotonic() - start < 0.5
            assert route["status"] == "processing" and route["progress"]["stage"] == "timeline"
        finally:
            release.set()
        wait_for_draft(client, pending["id"])


def test_live_edit_recomputes_checks_and_confirmation_survives_mock_restart(data_dir, monkeypatch):
    with live_client(data_dir, monkeypatch, FakeClient()) as client:
        draft, _ = wait_for_draft(client, upload(client, destinationFloor="1").json()["id"])
        url = f"/api/routes/{draft['id']}"
        steps = draft["steps"]
        short = dict(steps[1], id="short", lengthM=0.2, source="organizer")
        steps.insert(2, short)
        updated = client.put(f"{url}/steps", json={"steps": steps})
        assert updated.status_code == 200
        assert any(c["id"] == "leg_length_range" and c["level"] == "fail"
                   and c["stepId"] == "short" for c in updated.json()["checks"])
        assert client.post(f"{url}/confirm").status_code == 409

    # Check mode is persisted per upload, independent of the server's next mode.
    monkeypatch.setenv("PIPELINE_MODE", "mock")
    with TestClient(create_app(data_dir=data_dir)) as client:
        steps = [step for step in steps if step["id"] != "short"]
        steps[1]["confidence"] = 0.1
        response = client.put(f"{url}/steps", json={"steps": steps})
        assert any(c["id"] == "low_confidence" for c in response.json()["checks"])
        assert not any(c["level"] == "fail" for c in response.json()["checks"])
        steps[1]["source"] = "organizer"
        response = client.put(f"{url}/steps", json={"steps": steps})
        assert not any(c["id"] == "low_confidence" for c in response.json()["checks"])
        assert client.post(f"{url}/confirm").json()["status"] == "confirmed"


def test_assembly_warnings_persist_for_live_edits(data_dir, monkeypatch):
    with live_client(data_dir, monkeypatch, FakeClient()) as client:
        draft, _ = wait_for_draft(client, upload(client).json()["id"])
        assert any(c["id"] == "stair_floors" for c in draft["checks"])
        assert any(c["id"] == "ends_on_destination_floor" for c in draft["checks"])
    with live_client(data_dir, monkeypatch, FakeClient()) as client:
        response = client.put(f"/api/routes/{draft['id']}/steps", json={"steps": draft["steps"]})
        assert response.json()["checks"] == draft["checks"]


@pytest.mark.parametrize("stage", ["assemble", "verify"])
def test_unexpected_stage_exception_fails_safely(data_dir, monkeypatch, stage, caplog):
    from pipeline import run

    def fail(*_args, **_kwargs):
        raise RuntimeError("private exception detail")

    monkeypatch.setattr(run, stage, fail)
    with live_client(data_dir, monkeypatch, FakeClient()) as client:
        route = terminal_route(client, upload(client).json()["id"])
        assert route["status"] == "failed" and route["progress"] is None
        assert "could not be processed" in route["error"]
    assert "private exception detail" not in caplog.text
