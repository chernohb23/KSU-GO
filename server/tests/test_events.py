import json
from datetime import datetime
from shutil import copytree

import pytest

from conftest import FIXTURES_DIR


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


@pytest.mark.parametrize(("route_id", "expected_status"), [
    ("route-sample", "confirmed"),
    ("route-placeholder-draft", "draft"),
])
def test_routes_are_loaded_from_both_fixture_locations(client, route_id, expected_status):
    response = client.get(f"/api/routes/{route_id}")
    assert response.status_code == 200
    assert response.json()["status"] == expected_status
    assert response.json()["steps"][-1]["label"] == "Room 204"


def test_registration_is_idempotent_across_restart(make_client):
    url = "/api/events/ev-04/register"
    with make_client() as client:
        first = client.post(url, json={"deviceId": "device-a"})
        assert first.status_code == 200
        assert first.json() == {"registered": True, "registeredCount": 13}
        assert client.post(url, json={"deviceId": "device-a"}).json() == first.json()
        assert client.post(url, json={"deviceId": "device-b"}).json()["registeredCount"] == 14

    with make_client() as client:
        assert client.get("/api/events/ev-04").json()["registeredCount"] == 14
        assert client.post(url, json={"deviceId": "device-b"}).json()["registeredCount"] == 14


@pytest.mark.parametrize("path", ["/api/events/missing", "/api/routes/missing"])
def test_unknown_id_returns_contract_error(client, path):
    response = client.get(path)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_registration_requires_a_string_device_id(client):
    response = client.post("/api/events/ev-04/register", json={"deviceId": 123})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_unknown_range_uses_contract_error(client):
    response = client.get("/api/events?range=month")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
