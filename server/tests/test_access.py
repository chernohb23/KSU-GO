"""The access table in CONTRACTS.md section 5, and auth checked before the body."""

import pytest

from conftest import Clock, demo_account
from video_helpers import movie_bytes


# (method, route template, concrete path, access) for every /api endpoint in the contract.
# "owner" means the organization, event or route belongs to an organization the caller owns:
# Noah owns the Robotics Club (ev-04, ev-25 and the Room 113 stage draft); Maya owns nothing.
ENDPOINTS = [
    ("GET", "/api/health", "/api/health", "open"),
    ("GET", "/api/events", "/api/events", "open"),
    ("GET", "/api/events/{event_id}", "/api/events/ev-04", "open"),
    ("GET", "/api/routes/{route_id}", "/api/routes/route-sample", "open"),
    ("GET", "/api/organizations", "/api/organizations", "open"),
    ("GET", "/api/organizations/{organization_id}", "/api/organizations/org-robotics-club", "open"),
    ("GET", "/api/organizations/{organization_id}/events", "/api/organizations/org-robotics-club/events", "open"),
    ("POST", "/api/auth/signup", "/api/auth/signup", "open"),
    ("POST", "/api/auth/login", "/api/auth/login", "open"),
    ("GET", "/api/me", "/api/me", "signed_in"),
    ("PUT", "/api/me/profile", "/api/me/profile", "signed_in"),
    ("GET", "/api/me/registrations", "/api/me/registrations", "signed_in"),
    ("POST", "/api/auth/logout", "/api/auth/logout", "signed_in"),
    ("POST", "/api/events/{event_id}/register", "/api/events/ev-04/register", "signed_in"),
    ("POST", "/api/organizations", "/api/organizations", "signed_in"),
    ("POST", "/api/organizations/{organization_id}/follow", "/api/organizations/org-robotics-club/follow", "signed_in"),
    ("DELETE", "/api/organizations/{organization_id}/follow", "/api/organizations/org-robotics-club/follow", "signed_in"),
    # Signed in first; ownership of its organizationId is checked after the body.
    ("POST", "/api/events", "/api/events", "signed_in"),
    ("PUT", "/api/organizations/{organization_id}", "/api/organizations/org-robotics-club", "owner"),
    ("PUT", "/api/events/{event_id}", "/api/events/ev-04", "owner"),
    ("POST", "/api/events/{event_id}/cancel", "/api/events/ev-04/cancel", "owner"),
    ("GET", "/api/events/{event_id}/registrations", "/api/events/ev-04/registrations", "owner"),
    ("GET", "/api/events/{event_id}/directions", "/api/events/ev-04/directions", "owner"),
    ("POST", "/api/routes", "/api/routes?eventId=ev-25", "owner"),
    ("PUT", "/api/routes/{route_id}/steps", "/api/routes/route-math-113-draft/steps", "owner"),
    ("POST", "/api/routes/{route_id}/confirm", "/api/routes/route-math-113-draft/confirm", "owner"),
]
PROTECTED = [endpoint for endpoint in ENDPOINTS if endpoint[3] != "open"]
OWNER_ONLY = [endpoint for endpoint in ENDPOINTS if endpoint[3] == "owner"]


def login_token(client, role):
    account = demo_account(role)
    response = client.post(
        "/api/auth/login", json={"email": account["email"], "password": account["password"]},
    )
    assert response.status_code == 200
    return response.json()["token"]


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_every_api_route_has_an_access_rule(make_client):
    with make_client(as_user=None) as client:
        served = {
            (method, route.path)
            for route in client.app.routes if route.path.startswith("/api")
            for method in route.methods
        }
    assert served == {(method, template) for method, template, _, _ in ENDPOINTS}


@pytest.mark.parametrize(
    ("method", "path", "access"),
    [(method, path, access) for method, _, path, access in ENDPOINTS],
    ids=[f"{method} {path}" for method, path, _, _ in ENDPOINTS],
)
def test_access_matrix(make_client, method, path, access):
    clock = Clock()
    with make_client(as_user=None, clock=clock) as client:
        expired = login_token(client, "organizer")
        clock.advance(days=7)
        identities = {
            "anonymous": {},
            "malformed header": {"Authorization": "Token abc"},
            "unknown token": bearer("not-a-real-token"),
            "expired token": bearer(expired),
            "student": bearer(login_token(client, "student")),
            "organizer": bearer(login_token(client, "organizer")),
        }
        for who, headers in identities.items():
            # An empty JSON body: a granted call fails validation (or succeeds), never 401/403.
            kwargs = {"json": {}} if method in ("POST", "PUT") and not path.startswith("/api/routes?") else {}
            status = client.request(method, path, headers=headers, **kwargs).status_code
            signed_in = who in ("student", "organizer")
            if access == "open":
                expected_denial = None
            elif not signed_in:
                expected_denial = 401
            elif access == "owner" and who == "student":
                expected_denial = 403
            else:
                expected_denial = None
            if expected_denial is None:
                assert status not in (401, 403), (who, status)
            else:
                assert status == expected_denial, (who, status)


@pytest.mark.parametrize(
    ("method", "path"), [(m, p) for m, _, p, _ in PROTECTED], ids=[f"{m} {p}" for m, _, p, _ in PROTECTED],
)
@pytest.mark.parametrize("body", [
    {"content": b"{", "headers": {"Content-Type": "application/json"}},
    {"json": {"unexpected": True}},
    {"content": b"not json at all", "headers": {"Content-Type": "text/plain"}},
], ids=["malformed-json", "wrong-shape", "not-json"])
def test_no_token_is_401_before_the_body_is_read(make_client, method, path, body):
    with make_client(as_user=None) as client:
        response = client.request(method, path, **body)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthenticated"


@pytest.mark.parametrize(
    ("method", "path"), [(m, p) for m, _, p, _ in OWNER_ONLY],
    ids=[f"{m} {p}" for m, _, p, _ in OWNER_ONLY],
)
def test_non_owner_is_403_before_the_body_is_read(make_client, method, path):
    with make_client(as_user="student") as client:
        response = client.request(
            method, path, content=b"{", headers={"Content-Type": "application/json"},
        )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize("who", [None, "student"])
def test_upload_without_organizer_never_parses_or_stores_the_video(make_client, data_dir, monkeypatch, who):
    import starlette.requests

    def no_parse(*_args, **_kwargs):
        raise AssertionError("The multipart body was parsed before the access check.")

    monkeypatch.setattr(starlette.requests.Request, "form", no_parse)
    with make_client(as_user=who) as client:
        response = client.post(
            "/api/routes?eventId=ev-25",
            files={"video": ("walk.mov", movie_bytes(), "video/quicktime")},
            data={"buildingId": "b-library", "destination": "Room 310",
                  "startFloor": "1", "destinationFloor": "3"},
        )
    assert response.status_code == (401 if who is None else 403)
    assert not (data_dir / "uploads").exists()
    assert not (data_dir / "videos").exists()


@pytest.mark.parametrize("path", ["/api/health", "/api/events", "/api/events/ev-04", "/api/routes/route-sample"])
def test_open_endpoints_ignore_a_bad_token(make_client, path):
    with make_client(as_user=None) as client:
        assert client.get(path, headers=bearer("junk")).status_code == 200


def test_open_auth_endpoints_ignore_a_bad_token(make_client):
    account = demo_account("student")
    with make_client(as_user=None) as client:
        response = client.post(
            "/api/auth/login", headers=bearer("junk"),
            json={"email": account["email"], "password": account["password"]},
        )
        assert response.status_code == 200
        response = client.post(
            "/api/auth/signup", headers=bearer("junk"),
            json={"name": "Ana", "email": "ana@example.com", "password": "long enough"},
        )
        assert response.status_code == 201


def test_creating_an_event_for_an_organization_you_do_not_own_is_403_after_the_body(make_client):
    # The documented exception: organizationId is in the body, so a malformed body is 422 first.
    with make_client(as_user="student") as client:
        malformed = client.post("/api/events", content=b"{", headers={"Content-Type": "application/json"})
        assert malformed.status_code == 422
        response = client.post("/api/events", json={
            "title": "Not mine", "description": "d", "organizationId": "org-robotics-club",
            "partnerOrganizationId": None, "category": "other", "tags": [],
            "startsAt": "2099-01-01T00:00:00Z", "durationMin": 30,
            "location": {"buildingId": "b-library", "room": "310"}, "capacity": None,
        })
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_upload_without_an_event_is_refused_before_the_video_is_read(make_client, data_dir, monkeypatch):
    import starlette.requests

    monkeypatch.setattr(starlette.requests.Request, "form", lambda *a, **k: (_ for _ in ()).throw(AssertionError("parsed")))
    with make_client() as client:
        response = client.post("/api/routes", files={"video": ("a.mov", b"x", "video/quicktime")})
    assert response.status_code == 422
    assert not (data_dir / "uploads").exists()
