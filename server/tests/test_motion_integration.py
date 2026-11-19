"""Exercise the worker and PUT/confirm persistence with fake timelines and motion."""

import json

import pytest
from fastapi.testclient import TestClient

from main import create_app
from pipeline import run
from pipeline.motion import MotionError
from test_live_pipeline import FakeClient, live_client
from test_motion import rotation_trace
from video_helpers import movie_bytes, upload, wait_for_draft


def answer(*events):
    return json.dumps(dict(startFloor="1", endRoom=None, motionLog=["forward"] * 6, events=[
        dict(type=kind, startSec=start, endSec=end, confidence=0.9, note="")
        for kind, start, end in events
    ]))


def motion_checks(route):
    return [c for c in route["checks"] if c["id"] in {"turn_motion_mismatch", "turn_from_motion"}]


@pytest.mark.parametrize("failure", [MotionError("decoder detail"), FileNotFoundError("private video path")])
def test_worker_motion_failure_still_produces_draft(data_dir, monkeypatch, caplog, failure):
    fake = FakeClient(answer(("walk", 0, 4), ("turn_right", 4, 6), ("walk", 6, 12)))

    def fail(video):
        assert video.is_file()  # Ingested video survives through the timeline stage.
        assert len(fake.calls) == 1  # Measurement happens after timeline validation.
        raise failure

    monkeypatch.setattr(run, "measure_video", fail)
    with live_client(data_dir, monkeypatch, fake) as client:
        pending = upload(client, video=movie_bytes(seconds=12), destinationFloor="1")
        draft, _ = wait_for_draft(client, pending.json()["id"])
        assert draft["status"] == "draft" and not motion_checks(draft)
        assert any(s["type"] == "turn" for s in draft["steps"])
        state = json.loads((data_dir / "state.json").read_text())
        assert state["uploads"][draft["id"]]["motion"] is None
    assert "continuing without it" in caplog.text
    assert str(failure) not in caplog.text


def test_put_rechecks_saved_midpoint_without_video_and_after_restart(data_dir, monkeypatch):
    fake = FakeClient(answer(("walk", 0, 4), ("turn_right", 4, 6), ("walk", 6, 12)))

    def measure(video):
        assert video.is_file() and video.parent == data_dir / "videos"
        assert len(fake.calls) == 1
        return rotation_trace(degrees=-90)

    monkeypatch.setattr(run, "measure_video", measure)
    with live_client(data_dir, monkeypatch, fake) as client:
        draft, _ = wait_for_draft(client, upload(client, video=movie_bytes(seconds=12), destinationFloor="1").json()["id"])
        assert [c["id"] for c in motion_checks(draft)] == ["turn_motion_mismatch"]
        assert "left" in motion_checks(draft)[0]["message"]
        turn = next(s for s in draft["steps"] if s["type"] == "turn")
        assert turn["tSec"] == 4
        private = json.loads((data_dir / "state.json").read_text())["uploads"][draft["id"]]["motion"]
        assert private["turn_midpoints"] == {turn["id"]: 5.0}
        assert len(private["rotation_per_second"]) == 12
        assert "motion" not in draft
        url = f"/api/routes/{draft['id']}"
        steps = draft["steps"]
        for video in (data_dir / "videos").iterdir():
            video.unlink()
        turn["tSec"] = 100  # A client timestamp cannot replace the saved midpoint.
        updated = client.put(f"{url}/steps", json={"steps": steps})
        assert updated.status_code == 200
        assert motion_checks(updated.json()) == motion_checks(draft)

    def no_measure(_):
        pytest.fail("PUT/steps must not reopen or decode a video")

    monkeypatch.setattr(run, "measure_video", no_measure)
    monkeypatch.setenv("PIPELINE_MODE", "mock")
    with TestClient(create_app(data_dir=data_dir)) as client:
        updated = client.put(f"{url}/steps", json={"steps": steps})
        assert updated.status_code == 200
        assert motion_checks(updated.json()) == motion_checks(draft)
        turn["direction"] = "left"  # Re-check the current step against the saved rotation.
        updated = client.put(f"{url}/steps", json={"steps": steps})
        assert updated.status_code == 200 and not motion_checks(updated.json())
        turn["direction"] = "right"
        turn["source"] = "organizer"  # Approving unchanged is also final.
        updated = client.put(f"{url}/steps", json={"steps": steps})
        assert updated.status_code == 200 and not motion_checks(updated.json())
        assert client.post(f"{url}/confirm").status_code == 200


@pytest.mark.parametrize("approve_first", [False, True])
def test_organizer_can_approve_or_delete_inserted_turn_without_reinsertion(data_dir, monkeypatch, approve_first):
    fake = FakeClient(answer(("walk", 0, 12)))
    monkeypatch.setattr(run, "measure_video", lambda _: rotation_trace(degrees=-90))
    with live_client(data_dir, monkeypatch, fake) as client:
        draft, _ = wait_for_draft(client, upload(client, video=movie_bytes(seconds=12), destinationFloor="1").json()["id"])
        assert [c["id"] for c in motion_checks(draft)] == ["turn_from_motion"]
        url = f"/api/routes/{draft['id']}"
        steps = draft["steps"]
        turn = next(s for s in steps if s["type"] == "turn")
        if approve_first:
            turn["source"] = "organizer"
            approved = client.put(f"{url}/steps", json={"steps": steps})
            assert approved.status_code == 200 and not motion_checks(approved.json())
            assert not any(c["id"] == "low_confidence" for c in approved.json()["checks"])
        steps = [s for s in steps if s["id"] != turn["id"]]
        deleted = client.put(f"{url}/steps", json={"steps": steps})
        assert deleted.status_code == 200 and not motion_checks(deleted.json())
        assert not any(s["type"] == "turn" for s in deleted.json()["steps"])
        for video in (data_dir / "videos").iterdir():
            video.unlink()

    monkeypatch.setenv("PIPELINE_MODE", "mock")
    with TestClient(create_app(data_dir=data_dir)) as client:
        repeated = client.put(f"{url}/steps", json={"steps": steps})
        assert repeated.status_code == 200 and not motion_checks(repeated.json())
        assert not any(s["type"] == "turn" for s in repeated.json()["steps"])
        assert client.post(f"{url}/confirm").status_code == 200
