"""Editing and cancelling events, registrations and directions (CONTRACTS.md sections 2 and 5)."""

from datetime import datetime, timedelta

from conftest import Clock, sign_in
from video_helpers import owned_event, upload, wait_for_draft


def edit_body(event, **changes):
    fields = {k: event[k] for k in ("title", "description", "partnerOrganizationId", "category", "tags",
                                    "startsAt", "location", "capacity")}
    starts, ends = event["startsAt"], event["endsAt"]
    duration = int((datetime.fromisoformat(ends) - datetime.fromisoformat(starts)).total_seconds() // 60)
    return fields | {"durationMin": duration} | changes


def test_owner_edits_a_seed_event_and_it_keeps_exact_times_after_restart(make_client):
    clock = Clock()
    with make_client(clock=clock) as client:
        event = client.get("/api/events/ev-04").json()
        edited = client.put("/api/events/ev-04", json=edit_body(event, title="Robotics Club Kickoff"))
        assert edited.status_code == 200
        assert edited.json()["title"] == "Robotics Club Kickoff"
        assert edited.json()["startsAt"] == event["startsAt"]  # unchanged start is allowed
    clock.advance(hours=1)
    with make_client(clock=clock, as_user=None) as client:
        again = client.get("/api/events/ev-04").json()
        assert again["title"] == "Robotics Club Kickoff"
        assert again["startsAt"] == event["startsAt"]  # no longer rebased


def test_a_new_start_must_be_in_the_window_but_an_unchanged_one_may_stay(make_client):
    clock = Clock()
    with make_client(clock=clock) as client:
        live = client.get("/api/events/ev-01").json()  # started 30 min ago (Tutoring Center: not Noah's)
        assert client.put("/api/events/ev-01", json=edit_body(live)).status_code == 403
        event = client.get("/api/events/ev-04").json()
        clock.advance(minutes=30)  # ev-04 is live now; its start is in the past
        assert client.put("/api/events/ev-04", json=edit_body(event)).status_code == 200
        past = (clock.now - timedelta(minutes=1)).isoformat()
        assert client.put("/api/events/ev-04", json=edit_body(event, startsAt=past)).status_code == 422
        far = (clock.now + timedelta(days=7)).isoformat()
        assert client.put("/api/events/ev-04", json=edit_body(event, startsAt=far)).status_code == 422
        ok = (clock.now + timedelta(days=6)).isoformat()
        assert client.put("/api/events/ev-04", json=edit_body(event, startsAt=ok)).status_code == 200
        assert client.put("/api/events/ev-04", json=edit_body(event) | {"organizationId": "org-x"}).status_code == 422


def test_cancelled_events_leave_lists_but_stay_readable_and_refuse_registering(make_client):
    with make_client(as_user="student") as client:
        assert client.post("/api/events/ev-25/register").status_code == 200
        sign_in(client, "organizer")
        cancelled = client.post("/api/events/ev-25/cancel")
        assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
        assert client.post("/api/events/ev-25/cancel").json()["status"] == "cancelled"  # idempotent
        event = client.get("/api/events/ev-25").json()
        assert client.put("/api/events/ev-25", json=edit_body(event)).json()["error"]["code"] == "event_cancelled"
        assert "ev-25" not in [e["id"] for e in client.get("/api/events?range=week").json()]
        assert client.get("/api/events/ev-25").json()["status"] == "cancelled"
        sign_in(client, "student")
        refused = client.post("/api/events/ev-25/register")
        assert refused.status_code == 409 and refused.json()["error"]["code"] == "event_cancelled"
        # Maya still sees it among her registrations, labeled cancelled.
        mine = client.get("/api/me/registrations").json()
        assert [(r["event"]["id"], r["event"]["status"]) for r in mine] == [("ev-25", "cancelled")]
    with make_client(as_user=None) as client:  # persisted
        assert client.get("/api/events/ev-25").json()["status"] == "cancelled"


def test_ended_events_cannot_be_edited_or_cancelled(make_client):
    clock = Clock()
    with make_client(clock=clock) as client:
        event = client.get("/api/events/ev-04").json()
        clock.advance(days=1)
        assert client.post("/api/events/ev-04/cancel").status_code == 422
        assert client.put("/api/events/ev-04", json=edit_body(event)).status_code == 422


def test_my_registrations_and_the_owners_list_have_times_and_names(make_client):
    clock = Clock()
    with make_client(as_user="student", clock=clock) as client:
        client.post("/api/events/ev-25/register")
        clock.advance(minutes=3)
        client.post("/api/events/ev-04/register")
        mine = client.get("/api/me/registrations").json()
        assert [r["event"]["id"] for r in mine] == ["ev-04", "ev-25"]  # by start
        sign_in(client, "organizer")
        client.post("/api/events/ev-25/register")
        people = client.get("/api/events/ev-25/registrations").json()
        assert people["registeredCount"] == 9 + 2  # seeded baseline plus two accounts
        assert [p["name"] for p in people["people"]] == ["Noah Brooks", "Maya Chen"]  # newest first
        sign_in(client, "student")
        assert client.get("/api/events/ev-25/registrations").status_code == 403


def test_directions_states_belong_to_the_event(make_client, monkeypatch):
    import mock_pipeline

    monkeypatch.setattr(mock_pipeline, "STAGE_SECONDS", 0.02)
    with make_client() as client:
        assert client.get("/api/events/ev-10/directions").status_code == 403  # Drone Club's event
        assert client.get("/api/events/ev-04/directions").json() == {"state": "none", "route": None}
        stage = client.get("/api/events/ev-25/directions").json()
        assert stage["state"] == "draft" and stage["route"]["id"] == "route-math-113-draft"

        event_id = owned_event(client, building="b-library", room="310")
        route_id = upload(client, eventId=event_id).json()["id"]
        assert client.get(f"/api/events/{event_id}/directions").json()["state"] in {"processing", "draft"}
        draft, _ = wait_for_draft(client, route_id)
        assert client.get(f"/api/events/{event_id}/directions").json()["route"]["id"] == route_id

        # Another of Noah's events in the same room doesn't see this draft: it belongs to the first event.
        other = owned_event(client, building="b-library", room="310", title="Second")
        assert client.get(f"/api/events/{other}/directions").json() == {"state": "none", "route": None}

        steps = [step for step in draft["steps"] if step["id"] != "s12"]
        client.put(f"/api/routes/{route_id}/steps", json={"steps": steps})
        assert client.post(f"/api/routes/{route_id}/confirm").status_code == 200
        for eid in (event_id, other):
            directions = client.get(f"/api/events/{eid}/directions").json()
            assert directions["state"] == "confirmed" and directions["route"]["id"] == route_id


def test_moving_an_event_away_hides_its_old_draft(make_client):
    with make_client() as client:
        event = client.get("/api/events/ev-25").json()
        moved = client.put("/api/events/ev-25", json=edit_body(event, location={"buildingId": "b-library", "room": "Atrium"}))
        assert moved.status_code == 200
        assert client.get("/api/events/ev-25/directions").json() == {"state": "none", "route": None}


def test_a_second_confirm_for_a_room_is_refused(make_client, monkeypatch):
    import mock_pipeline

    monkeypatch.setattr(mock_pipeline, "STAGE_SECONDS", 0.02)
    with make_client() as client:
        first = owned_event(client, building="b-library", room="310")
        second = owned_event(client, building="b-library", room="310", title="Second")
        routes = []
        for event_id in (first, second):
            route_id = upload(client, eventId=event_id).json()["id"]
            draft, _ = wait_for_draft(client, route_id)
            client.put(f"/api/routes/{route_id}/steps",
                       json={"steps": [s for s in draft["steps"] if s["id"] != "s12"]})
            routes.append(route_id)
        assert client.post(f"/api/routes/{routes[0]}/confirm").status_code == 200
        refused = client.post(f"/api/routes/{routes[1]}/confirm")
        assert refused.status_code == 409 and refused.json()["error"]["code"] == "room_has_route"


def test_a_named_room_is_labeled_as_entered(make_client, monkeypatch):
    import mock_pipeline

    monkeypatch.setattr(mock_pipeline, "STAGE_SECONDS", 0.02)
    with make_client() as client:
        event_id = owned_event(client, building="b-crawford", room=" Atrium ")
        draft, _ = wait_for_draft(client, upload(client, eventId=event_id).json()["id"])
        assert draft["destination"] == draft["steps"][-1]["label"] == "Atrium"


def test_uploads_are_refused_for_cancelled_ended_or_unknown_events(make_client):
    clock = Clock()
    with make_client(clock=clock) as client:
        client.post("/api/events/ev-25/cancel")
        assert upload(client, eventId="ev-25").json()["error"]["code"] == "event_cancelled"
        assert upload(client, eventId="ev-missing").status_code == 404
        clock.advance(days=2)
        assert upload(client, eventId="ev-04").status_code == 422  # ended


def test_the_stage_draft_fixture_matches_a_fresh_bake():
    from scripts.bake_stage_draft import main

    assert main(["--check"]) == 0
