"""POST /api/events (CONTRACTS.md section 5, "Creating events")."""

import json
from shutil import copytree
from datetime import UTC, datetime, timedelta, timezone

import pytest

from conftest import FIXTURES_DIR, Clock, sign_in
from video_helpers import upload, wait_for_draft


NOW = datetime(2026, 11, 19, 17, 0, tzinfo=UTC)
EASTERN = timezone(timedelta(hours=-5))
EVENT_KEYS = {
    "id", "title", "description", "organizationId", "organizer", "partnerOrganizationId",
    "category", "tags", "startsAt", "endsAt", "location", "routeId", "capacity", "registeredCount", "status",
}


def body(**changes):
    return {
        "title": "Robot Arena Night",
        "description": "Bring a bot or borrow one of ours.",
        "organizationId": "org-robotics-club",
        "partnerOrganizationId": None,
        "category": "academic",
        "tags": ["robots"],
        "startsAt": (NOW + timedelta(hours=2)).isoformat(),
        "durationMin": 90,
        "location": {"buildingId": "b-library", "room": "310"},
        "capacity": 30,
    } | changes


def create(client, **changes):
    return client.post("/api/events", json=body(**changes))


@pytest.fixture
def clock():
    return Clock(NOW)


@pytest.fixture
def organizer(make_client, clock):
    with make_client(clock=clock) as client:
        yield client


def ids(client, event_range):
    return [event["id"] for event in client.get(f"/api/events?range={event_range}").json()]


def test_create_returns_the_event_with_server_fields(organizer):
    response = create(
        organizer, title="  Robot Arena Night ", description=" Bring a bot. ",
        location={"buildingId": "b-library", "room": " 310 "},
    )
    assert response.status_code == 201
    event = response.json()
    assert set(event) == EVENT_KEYS
    assert event["id"].startswith("ev-")
    assert event["title"] == "Robot Arena Night"
    assert event["description"] == "Bring a bot."
    assert event["organizer"] == "Robotics Club"
    assert event["location"] == {"buildingId": "b-library", "room": "310"}
    assert event["registeredCount"] == 0
    assert event["routeId"] is None
    starts_at = datetime.fromisoformat(event["startsAt"])
    assert starts_at == NOW + timedelta(hours=2)
    assert datetime.fromisoformat(event["endsAt"]) - starts_at == timedelta(minutes=90)
    assert organizer.get(f"/api/events/{event['id']}").json() == event


def test_created_event_lands_in_the_right_range_as_time_passes(organizer, clock):
    soon = create(organizer).json()["id"]
    later = create(organizer, startsAt=(NOW + timedelta(days=3)).isoformat()).json()["id"]
    assert soon in ids(organizer, "today") and soon in ids(organizer, "week")
    assert later not in ids(organizer, "today") and later in ids(organizer, "week")
    clock.advance(days=2, hours=1)  # now 23 hours before `later`
    assert later in ids(organizer, "today")
    assert soon not in ids(organizer, "week")  # ended
    week = organizer.get("/api/events?range=week").json()
    assert [e["startsAt"] for e in week] == sorted(e["startsAt"] for e in week)


def test_created_events_persist_with_exact_times_across_restarts(make_client, clock, data_dir):
    with make_client(clock=clock) as client:
        created = create(client, startsAt="2026-11-21T09:30:00-05:00").json()
        sign_in(client, "student")
        assert client.post(f"/api/events/{created['id']}/register").json()["registeredCount"] == 1
        seed_start = client.get("/api/events/ev-01").json()["startsAt"]
    clock.advance(hours=3)
    with make_client(clock=clock, as_user=None) as client:
        reloaded = client.get(f"/api/events/{created['id']}").json()
        assert reloaded == created | {"registeredCount": 1}
        assert reloaded["startsAt"] == "2026-11-21T09:30:00-05:00"
        assert client.get("/api/events/ev-01").json()["startsAt"] != seed_start  # seeds rebase
        assert created["id"] in ids(client, "week")
    saved = json.loads((data_dir / "state.json").read_text())
    assert saved["created_events"][created["id"]]["registeredCount"] == 0  # base value only


@pytest.mark.parametrize(("starts_at", "ok"), [
    (NOW, False),
    (NOW - timedelta(minutes=1), False),
    (NOW + timedelta(seconds=1), True),
    (NOW + timedelta(days=7) - timedelta(seconds=1), True),
    (NOW + timedelta(days=7), False),
    ((NOW + timedelta(days=7) - timedelta(seconds=1)).astimezone(EASTERN), True),
    ((NOW + timedelta(days=7)).astimezone(EASTERN), False),
    (NOW.astimezone(EASTERN), False),
], ids=["now", "past", "now+1s", "7d-1s", "7d", "7d-1s-eastern", "7d-eastern", "now-eastern"])
def test_start_window_is_rolling_seven_days_on_date_and_time(organizer, starts_at, ok):
    response = create(organizer, startsAt=starts_at.isoformat())
    assert response.status_code == (201 if ok else 422), response.text
    if ok:
        assert datetime.fromisoformat(response.json()["startsAt"]) == starts_at


@pytest.mark.parametrize("starts_at", [
    "2026-11-20T10:00:00", "2026-11-20", "tomorrow", "", "2026-11-20T10:00:00 EST", 1763658000,
])
def test_start_needs_an_iso_date_time_with_an_explicit_offset(organizer, starts_at):
    response = create(organizer, startsAt=starts_at)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_z_and_offset_forms_are_accepted(organizer):
    assert create(organizer, startsAt="2026-11-20T15:00:00Z").status_code == 201
    assert create(organizer, startsAt="2026-11-20T10:00:00-05:00").status_code == 201


@pytest.mark.parametrize("organization_id", ["org-game-development-club", "org-nonexistent"])
def test_another_organization_is_forbidden(organizer, organization_id):
    response = create(organizer, organizationId=organization_id)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize(("partner", "ok"), [
    (None, True), ("org-drone-club", True), ("org-robotics-club", False), ("org-unknown", False),
])
def test_partner_must_be_another_known_organization(organizer, partner, ok):
    response = create(organizer, partnerOrganizationId=partner)
    assert response.status_code == (201 if ok else 422)
    if ok:
        assert response.json()["partnerOrganizationId"] == partner


@pytest.mark.parametrize(("tags", "expected"), [
    ([], []),
    ([" Robots ", "robots", "AI", "ai ", "Build-Night"], ["robots", "ai", "build-night"]),
    ([f"tag{i}" for i in range(8)] + ["TAG0", " tag1 "], [f"tag{i}" for i in range(8)]),
    (["x" * 24], ["x" * 24]),
    ([f"tag{i}" for i in range(9)], None),
    (["x" * 25], None),
    (["   "], None),
    ([""], None),
    (None, None),
    ([1], None),
])
def test_tags_are_normalized_then_limited(organizer, tags, expected):
    response = create(organizer, tags=tags)
    if expected is None:
        assert response.status_code == 422
    else:
        assert response.status_code == 201
        assert response.json()["tags"] == expected


@pytest.mark.parametrize(("capacity", "ok"), [
    (None, True), (1, True), (500, True), (0, False), (-1, False), (2.5, False), ("5", False), (True, False),
])
def test_capacity_is_null_or_a_whole_number_of_at_least_one(organizer, capacity, ok):
    assert create(organizer, capacity=capacity).status_code == (201 if ok else 422)


@pytest.mark.parametrize(("changes", "ok"), [
    ({"durationMin": 1}, True), ({"durationMin": 1440}, True), ({"durationMin": 0}, False),
    ({"durationMin": 1441}, False), ({"durationMin": 30.0}, False), ({"durationMin": True}, False),
    ({"title": "x" * 120}, True), ({"title": "x" * 121}, False), ({"title": "   "}, False),
    ({"description": "x" * 2000}, True), ({"description": "x" * 2001}, False), ({"description": ""}, False),
    ({"location": {"buildingId": "b-library", "room": "x" * 40}}, True),
    ({"location": {"buildingId": "b-library", "room": "x" * 41}}, False),
    ({"location": {"buildingId": "b-library", "room": "  "}}, False),
    ({"location": {"buildingId": "b-nowhere", "room": "101"}}, False),
    ({"category": "music"}, False), ({"category": None}, False),
    ({"organizer": "Someone Else"}, False), ({"routeId": "route-sample"}, False),
    ({"registeredCount": 5}, False), ({"endsAt": "2026-11-20T12:00:00Z"}, False),
], ids=lambda value: json.dumps(value)[:40] if isinstance(value, dict) else str(value))
def test_field_rules(organizer, changes, ok):
    response = create(organizer, **changes)
    assert response.status_code == (201 if ok else 422), response.text
    if not ok:
        assert response.json()["error"]["code"] == "invalid_request"


@pytest.mark.parametrize("missing", ["category", "partnerOrganizationId", "tags", "capacity", "location"])
def test_every_key_is_required(organizer, missing):
    fields = body()
    del fields[missing]
    assert organizer.post("/api/events", json=fields).status_code == 422


def test_every_event_uses_its_rooms_confirmed_route(make_client, clock):
    math_204 = {"buildingId": "b-mathematics", "room": "204"}
    math_113 = {"buildingId": "b-mathematics", "room": "113"}
    with make_client(clock=clock) as client:
        in_204 = create(client, location=math_204).json()
        assert in_204["routeId"] == "route-sample"  # Room 204 has a confirmed route
        in_113 = create(client, location=math_113).json()
        assert in_113["routeId"] is None  # Room 113 starts without directions
        # Recording directions for a room that has them is refused, before the video is read.
        refused = upload(client, eventId=in_204["id"])
        assert refused.status_code == 409
        assert refused.json()["error"] == {
            "code": "room_has_route", "message": "This room already has directions. Events here use them.",
        }
        clock.advance(minutes=5)
        assert client.post("/api/routes/route-math-113-draft/confirm").status_code == 200
        later = create(client, location={"buildingId": "b-mathematics", "room": " 113 "}).json()
        assert later["routeId"] == "route-math-113-draft"
        assert client.get(f"/api/events/{in_113['id']}").json()["routeId"] == "route-math-113-draft"
        assert client.get(f"/api/events/{in_204['id']}").json()["routeId"] == "route-sample"
        # Moving an event re-checks its room.
        moved = client.put(f"/api/events/{in_113['id']}", json={
            k: v for k, v in body(location=math_204).items() if k != "organizationId"
        } | {"startsAt": in_113["startsAt"]})
        assert moved.status_code == 200
        assert moved.json()["routeId"] == "route-sample"
    # Bundled routes reset on restart: Room 113 is without directions again.
    with make_client(clock=clock, as_user=None) as client:
        assert client.get("/api/routes/route-math-113-draft").json()["status"] == "draft"
        assert client.get(f"/api/events/{later['id']}").json()["routeId"] is None
        assert client.get(f"/api/events/{in_204['id']}").json()["routeId"] == "route-sample"


def test_the_most_recently_confirmed_route_wins_in_a_room(make_client, clock, tmp_path):
    fixtures_dir = copytree(FIXTURES_DIR, tmp_path / "fixtures")
    newer = json.loads((fixtures_dir / "route.sample.json").read_text()) | {
        "id": "route-204-newer", "confirmedAt": "2026-11-18T09:00:00-05:00",
    }
    (fixtures_dir / "routes" / "route-204-newer.json").write_text(json.dumps(newer))
    with make_client(fixtures_dir, clock=clock, as_user=None) as client:
        assert client.get("/api/events/ev-10").json()["routeId"] == "route-204-newer"


def test_a_later_confirm_gives_a_created_event_its_route(make_client, clock, monkeypatch):
    import mock_pipeline

    monkeypatch.setattr(mock_pipeline, "STAGE_SECONDS", 0.02)
    with make_client(clock=clock) as client:
        event = create(client, location={"buildingId": "b-library", "room": "310"}).json()
        assert event["routeId"] is None
        route_id = upload(client, eventId=event["id"]).json()["id"]
        draft, _ = wait_for_draft(client, route_id)
        steps = [step for step in draft["steps"] if step["id"] != "s12"]
        assert client.put(f"/api/routes/{route_id}/steps", json={"steps": steps}).status_code == 200
        assert client.post(f"/api/routes/{route_id}/confirm").status_code == 200
        assert client.get(f"/api/events/{event['id']}").json()["routeId"] == route_id
        later = create(client, location={"buildingId": "b-library", "room": "310"}).json()
        assert later["routeId"] == route_id
    with make_client(clock=clock, as_user=None) as client:
        assert client.get(f"/api/events/{event['id']}").json()["routeId"] == route_id
        assert client.get(f"/api/events/{later['id']}").json()["routeId"] == route_id
