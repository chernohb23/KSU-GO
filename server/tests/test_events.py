import json
from datetime import datetime
from shutil import copytree

import pytest
from pydantic import TypeAdapter

from conftest import FIXTURES_DIR, sign_in
from models import EventSeed, Organization


def test_health_defaults_to_mock(make_client):
    with make_client() as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "pipelineMode": "mock"}


def test_cors_allows_an_app_origin(client):
    response = client.options("/api/routes", headers={
        "Origin": "https://example.org",
        "Access-Control-Request-Method": "POST",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"


def test_events_default_to_today_and_week_includes_later_events(client):
    today = client.get("/api/events").json()
    week = client.get("/api/events?range=week").json()
    assert len(today) == 12
    assert len(week) == 24
    assert [event["id"] for event in today] == [
        f"ev-{index:02}" for index in range(1, 13)
    ]
    assert week[:12] == today
    assert week[12]["id"] == "ev-13"
    starts_at = datetime.fromisoformat(today[0]["startsAt"])
    ends_at = datetime.fromisoformat(today[0]["endsAt"])
    assert starts_at.utcoffset() is not None
    assert (ends_at - starts_at).total_seconds() == 120 * 60


def test_event_list_excludes_ended_events_and_respects_range(tmp_path, make_client):
    fixtures_dir = copytree(FIXTURES_DIR, tmp_path / "fixtures")
    seeds_path = fixtures_dir / "events.seed.json"
    seed = json.loads(seeds_path.read_text())[0]
    seeds_path.write_text(json.dumps([
        dict(seed, id="outside-week", startsInMin=10081),
        dict(seed, id="week", startsInMin=1441),
        dict(seed, id="ended", startsInMin=-121),
        dict(seed, id="today", startsInMin=1439),
        dict(seed, id="live", startsInMin=-1),
    ]))
    with make_client(fixtures_dir) as client:
        assert [event["id"] for event in client.get("/api/events").json()] == [
            "live", "today",
        ]
        assert [
            event["id"] for event in client.get("/api/events?range=week").json()
        ] == ["live", "today", "week"]


def test_event_detail_serves_seeded_event(client):
    response = client.get("/api/events/ev-04")
    assert response.status_code == 200
    assert response.json()["title"] == "Robotics Club Meeting"
    assert response.json()["routeId"] == "route-sample"
    assert response.json()["organizationId"] == "org-robotics-club"
    assert response.json()["partnerOrganizationId"] is None
    assert response.json()["tags"] == ["robotics", "engineering", "club-meeting"]


def test_organizations_fixture_covers_every_seed_event():
    organizations = TypeAdapter(list[Organization]).validate_json(
        (FIXTURES_DIR / "organizations.json").read_bytes()
    )
    seeds = TypeAdapter(list[EventSeed]).validate_json(
        (FIXTURES_DIR / "events.seed.json").read_bytes()
    )
    names = {organization.id: organization.name for organization in organizations}
    assert len(names) == len(organizations)
    for seed in seeds:
        assert names[seed.organizationId] == seed.organizer
        assert seed.partnerOrganizationId in names.keys() | {None}
        assert seed.partnerOrganizationId != seed.organizationId


@pytest.mark.parametrize(("route_id", "expected_status"), [
    ("route-sample", "confirmed"),
    ("route-placeholder-draft", "draft"),
])
def test_routes_are_loaded_from_both_fixture_locations(client, route_id, expected_status):
    response = client.get(f"/api/routes/{route_id}")
    assert response.status_code == 200
    assert response.json()["status"] == expected_status
    assert response.json()["steps"][-1]["label"] == "Room 204"


def test_registration_is_per_user_and_idempotent_across_restart(make_client):
    url = "/api/events/ev-04/register"
    with make_client(as_user="student") as client:
        first = client.post(url)
        assert first.status_code == 200
        assert first.json() == {"registered": True, "registeredCount": 13}
        assert client.post(url).json() == first.json()
        sign_in(client, "organizer")
        assert client.post(url).json()["registeredCount"] == 14

    with make_client(as_user="organizer") as client:
        assert client.get("/api/events/ev-04").json()["registeredCount"] == 14
        assert client.post(url).json()["registeredCount"] == 14
        sign_in(client, "student")
        assert client.post(url).json()["registeredCount"] == 14


@pytest.mark.parametrize("path", ["/api/events/missing", "/api/routes/missing"])
def test_unknown_id_returns_contract_error(client, path):
    response = client.get(path)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_registration_needs_a_sign_in_and_ignores_an_old_device_body(make_client):
    with make_client(as_user=None) as client:
        response = client.post("/api/events/ev-04/register", json={"deviceId": "device-a"})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthenticated"
        sign_in(client, "student")
        response = client.post("/api/events/ev-04/register", json={"deviceId": 123})
        assert response.json() == {"registered": True, "registeredCount": 13}
        assert client.post("/api/events/missing/register").status_code == 404


def test_pre_account_state_file_loads_and_keeps_device_registrations(data_dir, make_client):
    # A state.json written before phase B: device-id registrations, an upload and an event link.
    old_upload = {
        "route": json.loads((FIXTURES_DIR / "route.sample.json").read_text())
        | {"id": "route-old-upload", "buildingId": "b-library", "destination": "Room 310"},
        "event_id": "ev-07",
        "pipeline_mode": "mock",
        "assemble_warnings": [],
        "motion": None,
    }
    data_dir.mkdir()
    (data_dir / "state.json").write_text(json.dumps({
        "registrations": {"ev-04": ["device-a", "device-b"]},
        "uploads": {"route-old-upload": old_upload},
        "event_routes": {"ev-07": "route-old-upload"},
    }))

    with make_client(as_user="student") as client:
        assert client.get("/api/events/ev-04").json()["registeredCount"] == 14
        assert client.get("/api/events/ev-07").json()["routeId"] == "route-old-upload"
        assert client.get("/api/routes/route-old-upload").json()["status"] == "confirmed"
        assert client.post("/api/events/ev-04/register").json()["registeredCount"] == 15
        assert client.post("/api/events/ev-04/register").json()["registeredCount"] == 15

    saved = json.loads((data_dir / "state.json").read_text())
    assert {k: set(v) for k, v in saved["registrations"].items()} == {"ev-04": {"device-a", "device-b"}}
    assert saved["user_registrations"] == {"ev-04": ["user-demo-student"]}
    with make_client(as_user=None) as client:
        assert client.get("/api/events/ev-04").json()["registeredCount"] == 15


def test_unknown_range_uses_contract_error(client):
    response = client.get("/api/events?range=month")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
