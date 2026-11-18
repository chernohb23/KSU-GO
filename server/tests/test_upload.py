from time import monotonic

import pytest

from video_helpers import header_only_movie, movie_bytes, upload, wait_for_draft


def test_upload_returns_processing_and_runs_every_stage(client, monkeypatch):
    import mock_pipeline

    monkeypatch.setattr(mock_pipeline, "STAGE_SECONDS", 0.15)
    response = upload(
        client, buildingId="b-library", destination="Room 310",
        startFloor="G", destinationFloor="3",
    )
    assert response.status_code == 202
    pending = response.json()
    assert pending["status"] == "processing"
    assert pending["progress"] == {"stage": "ingest", "pct": 0}
    assert pending["steps"] == []

    start = monotonic()
    assert client.get("/api/health").json() == {"ok": True, "pipelineMode": "mock"}
    assert monotonic() - start < 0.5
    start = monotonic()
    assert client.get(f"/api/routes/{pending['id']}").json()["status"] == "processing"
    assert monotonic() - start < 0.5

    draft, stages = wait_for_draft(client, pending["id"])
    assert stages == ["ingest", "timeline", "geometry", "assemble", "verify"]
    assert draft["id"] != "route-draft-flawed"
    assert draft["progress"] is None
    assert draft["buildingId"] == "b-library"
    assert draft["destination"] == draft["steps"][-1]["label"] == "Room 310"
    assert (draft["startFloor"], draft["destinationFloor"]) == ("G", "3")
    assert draft["stats"]["videoSec"] == 1
    assert draft["stats"]["costUsd"] == 0
    assert any(check["level"] == "fail" and check["stepId"] == "s12" for check in draft["checks"])


def test_upload_requires_video_and_form_fields(client):
    response = client.post("/api/routes", data={"buildingId": "b-engineering"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


@pytest.mark.parametrize("unknown_duration", [0, 0xFFFFFFFF])
def test_fragmented_upload_uses_duration_from_all_fragments(client, monkeypatch, unknown_duration):
    import mock_pipeline

    monkeypatch.setattr(mock_pipeline, "STAGE_SECONDS", 0.02)
    response = upload(
        client, video=movie_bytes(seconds=180, fragments=2, unknown_duration=unknown_duration),
    )
    assert response.status_code == 202
    draft, _ = wait_for_draft(client, response.json()["id"])
    assert draft["stats"]["videoSec"] == 180


def test_fragmented_video_is_rejected_when_total_duration_exceeds_three_minutes(client):
    response = upload(client, video=movie_bytes(seconds=181, fragments=2))
    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "video_rejected", "message": "The video is longer than 3 minutes.",
    }


def test_longer_audio_track_counts_towards_the_video_duration_limit(client):
    response = upload(client, video=movie_bytes(seconds=179, fragments=2, audio_seconds=181))
    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "video_rejected", "message": "The video is longer than 3 minutes.",
    }


def test_flat_video_with_fragmented_audio_is_accepted(client, monkeypatch):
    import mock_pipeline

    monkeypatch.setattr(mock_pipeline, "STAGE_SECONDS", 0.02)
    response = upload(client, video=movie_bytes(seconds=1, audio_seconds=5))
    assert response.status_code == 202
    draft, _ = wait_for_draft(client, response.json()["id"])
    assert draft["stats"]["videoSec"] == 5


def test_upload_with_malformed_multipart_uses_contract_error(client):
    response = client.post(
        "/api/routes", content=b"not multipart", headers={"Content-Type": "multipart/form-data"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_upload_rejects_unknown_event(client):
    response = upload(client, eventId="missing")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize("content", [
    b"not a video",
    header_only_movie(),
    movie_bytes(handler=b"soun"),
    movie_bytes(chunk_offset=0),
    movie_bytes(chunk_offset=0, fragments=2),
    movie_bytes()[:-1],
    movie_bytes(seconds=181),
], ids=[
    "unreadable", "header-only", "audio-only", "invalid-chunk-offset",
    "invalid-fragment-offset", "truncated", "longer-than-three-minutes",
])
def test_rejected_video_returns_contract_error(client, content):
    response = upload(client, video=content)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "video_rejected"


def test_rejects_video_larger_than_upload_limit(client, monkeypatch):
    import video

    content = movie_bytes()
    monkeypatch.setattr(video, "MAX_VIDEO_BYTES", len(content) - 1)
    response = upload(client, video=content)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "video_rejected"


def test_budget_rejects_upload_before_creating_route(client, data_dir):
    data_dir.mkdir()
    (data_dir / "spend.jsonl").write_text('{"costUsd": 13.9}\n{"costUsd": 0.1}\n')
    response = upload(client)
    assert response.status_code == 402
    assert response.json()["error"]["code"] == "budget_exceeded"
    assert not (data_dir / "state.json").exists()


def test_processing_route_becomes_failed_on_restart(make_client):
    with make_client() as client:
        started = upload(client)
        assert started.status_code == 202
        route_id = started.json()["id"]
    with make_client() as client:
        route = client.get(f"/api/routes/{route_id}").json()
        assert route["status"] == "failed"
        assert route["progress"] is None
        assert route["error"] == "The server restarted. Upload the video again."
    with make_client() as client:
        assert client.get(f"/api/routes/{route_id}").json() == route
