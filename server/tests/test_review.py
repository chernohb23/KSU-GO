import json
from shutil import copytree

import pytest

from conftest import FIXTURES_DIR
from video_helpers import upload, wait_for_draft


FIXTURE = "/api/routes/route-placeholder-draft"


def without_short_walk(route):
    return [step for step in route["steps"] if step["id"] != "s12"]


def test_draft_edits_keep_checks_for_untouched_steps(client):
    steps = client.get(FIXTURE).json()["steps"]
    next(step for step in steps if step["id"] == "s9")["source"] = "organizer"
    updated = client.put(f"{FIXTURE}/steps", json={"steps": steps})
    assert updated.status_code == 200
    assert {(check["id"], check["stepId"]) for check in updated.json()["checks"]} == {
        ("low_confidence", "s3"), ("leg_length_range", "s12"),
    }

    without_turn = [step for step in steps if step["id"] != "s3"]
    updated = client.put(f"{FIXTURE}/steps", json={"steps": without_turn})
    assert updated.status_code == 200
    assert [check["id"] for check in updated.json()["checks"]] == ["leg_length_range"]


def test_draft_edits_recompute_short_walk_failures(client):
    steps = without_short_walk(client.get(FIXTURE).json())
    walk = next(step for step in steps if step["id"] == "s2")
    walk["lengthM"] = 0.5
    steps.insert(2, dict(walk, id="new-walk", lengthM=0.49, source="organizer"))
    updated = client.put(f"{FIXTURE}/steps", json={"steps": steps})
    assert updated.status_code == 200
    assert [check["stepId"] for check in updated.json()["checks"] if check["level"] == "fail"] == [
        "new-walk",
    ]

    steps.pop(2)
    updated = client.put(f"{FIXTURE}/steps", json={"steps": steps})
    assert updated.status_code == 200
    assert all(check["level"] != "fail" for check in updated.json()["checks"])


@pytest.mark.parametrize("change", [
    lambda steps: [],
    lambda steps: steps[1:],
    lambda steps: steps[:-1],
    lambda steps: [*steps[:-1], dict(steps[-1], label="Room 205")],
    lambda steps: [steps[0], *steps],
    lambda steps: [steps[0], dict(steps[1], lengthM="8"), *steps[2:]],
], ids=["empty", "missing-entrance", "missing-exit", "wrong-label", "duplicate-ids", "wrong-type"])
def test_invalid_steps_leave_draft_unchanged(client, change):
    original = client.get(FIXTURE).json()
    response = client.put(f"{FIXTURE}/steps", json={"steps": change(original["steps"])})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert client.get(FIXTURE).json() == original


def test_confirmation_rejects_a_failed_check(client):
    response = client.post(f"{FIXTURE}/confirm")
    assert response.status_code == 409
    assert response.json()["error"] == {
        "code": "route_has_failed_checks",
        "message": "Fix the failed checks before confirming.",
    }
    assert client.get(FIXTURE).json()["status"] == "draft"


@pytest.mark.parametrize(("method", "suffix", "kwargs"), [
    ("PUT", "steps", {"json": {"steps": []}}),
    ("POST", "confirm", {}),
])
def test_confirmed_route_cannot_be_edited_or_confirmed_again(client, method, suffix, kwargs):
    response = client.request(method, f"/api/routes/route-sample/{suffix}", **kwargs)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "wrong_status"


def test_fixture_confirm_resets_route_and_ephemeral_event_links_on_restart(make_client):
    with make_client() as client:
        draft = client.get(FIXTURE).json()
        edited = client.put(f"{FIXTURE}/steps", json={"steps": without_short_walk(draft)})
        assert edited.status_code == 200
        confirmed = client.post(f"{FIXTURE}/confirm")
        assert confirmed.status_code == 200
        assert confirmed.json()["status"] == "confirmed"
        assert client.get("/api/events/ev-10").json()["routeId"] == draft["id"]
    with make_client() as client:
        assert client.get(FIXTURE).json() == draft
        assert client.get("/api/events/ev-10").json()["routeId"] is None


def test_uploaded_draft_edits_and_confirmed_room_links_survive_restart(
    make_client, monkeypatch, tmp_path,
):
    import mock_pipeline

    monkeypatch.setattr(mock_pipeline, "STAGE_SECONDS", 0.02)
    fixtures_dir = copytree(FIXTURES_DIR, tmp_path / "fixtures")
    seeds_path = fixtures_dir / "events.seed.json"
    seeds = json.loads(seeds_path.read_text())
    for seed in seeds:
        if seed["id"] in {"ev-02", "ev-10"}:
            seed["location"]["room"] = " 204 "
    seeds_path.write_text(json.dumps(seeds))

    with make_client(fixtures_dir) as client:
        response = upload(client, destination=" rOoM 204  ", eventId="ev-04")
        assert response.status_code == 202
        route_id = response.json()["id"]
        draft, _ = wait_for_draft(client, route_id)
        route_url = f"/api/routes/{route_id}"
        edited = client.put(f"{route_url}/steps", json={"steps": without_short_walk(draft)})
        assert edited.status_code == 200

    with make_client(fixtures_dir) as client:
        assert client.get(route_url).json() == edited.json()
        response = client.post(f"{route_url}/confirm")
        assert response.status_code == 200
        confirmed = response.json()
        assert confirmed["status"] == "confirmed"
        assert confirmed["confirmedAt"] is not None

    with make_client(fixtures_dir) as client:
        assert client.get(route_url).json() == confirmed
        events = {event["id"]: event for event in client.get("/api/events").json()}
        assert events["ev-04"]["routeId"] == route_id  # Explicit event replaces its old route.
        assert events["ev-10"]["routeId"] == route_id  # Matching room with no route.
        assert events["ev-08"]["routeId"] == "route-sample"  # Existing route stays.
        assert events["ev-02"]["routeId"] is None  # Same room number, different building.
        assert events["ev-06"]["routeId"] is None  # Same building, different room.
