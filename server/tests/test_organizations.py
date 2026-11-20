"""Organizations, follows and profiles (CONTRACTS.md sections 2 and 5)."""

import json

import pytest

from conftest import Clock, sign_in


def org_body(**changes):
    return {
        "name": "Chess Society", "description": "Weekly blitz and a monthly tournament.",
        "logo": {"initials": "CS", "color": "ink"}, "memberCount": 18,
        "meets": "Wednesdays 7 PM, Student Center", "contactEmail": " Chess@Example.COM ",
        "website": "https://example.com/chess",
    } | changes


def test_any_signed_in_user_creates_and_owns_an_organization(make_client, data_dir):
    with make_client(as_user="student") as client:
        response = client.post("/api/organizations", json=org_body(name="  Chess Society "))
        assert response.status_code == 201
        org = response.json()
        assert org == {
            "id": "org-chess-society", "name": "Chess Society", "description": "Weekly blitz and a monthly tournament.",
            "logo": {"initials": "CS", "color": "ink"}, "memberCount": 18, "meets": "Wednesdays 7 PM, Student Center",
            "contactEmail": "chess@example.com", "website": "https://example.com/chess",
            "ownerId": "user-demo-student", "followerCount": 0,
        }
        # Maya is now an organizer: she owns an organization.
        assert client.get("/api/me").json()["ownedOrganizationIds"] == ["org-chess-society"]
        assert client.get("/api/organizations/org-chess-society").json() == org
    with make_client(as_user=None) as client:  # persisted
        assert client.get("/api/organizations/org-chess-society").json()["ownerId"] == "user-demo-student"


def test_names_are_unique_ignoring_case_and_ids_get_a_suffix(make_client):
    with make_client(as_user="student") as client:
        taken = client.post("/api/organizations", json=org_body(name="robotics club"))
        assert taken.status_code == 422
        assert taken.json()["error"]["message"] == "An organization with this name already exists."
        first = client.post("/api/organizations", json=org_body(name="Robotics Club!")).json()
        assert first["id"] == "org-robotics-club-2"  # slug taken by the seed organization


@pytest.mark.parametrize(("changes", "ok"), [
    ({"name": "A"}, False), ({"name": "x" * 60}, True), ({"name": "x" * 61}, False),
    ({"description": ""}, False), ({"description": "x" * 280}, True), ({"description": "x" * 281}, False),
    ({"logo": {"initials": "ABCD", "color": "gold"}}, True), ({"logo": {"initials": "abc", "color": "gold"}}, False),
    ({"logo": {"initials": "ABCDE", "color": "gold"}}, False), ({"logo": {"initials": "AB", "color": "amber"}}, False),
    ({"memberCount": 0}, True), ({"memberCount": 100000}, True), ({"memberCount": -1}, False),
    ({"memberCount": 100001}, False), ({"memberCount": 2.5}, False),
    ({"meets": None}, True), ({"meets": "x" * 81}, False), ({"meets": "  "}, False),
    ({"contactEmail": None}, True), ({"contactEmail": "no-at"}, False), ({"contactEmail": "a@b@c"}, False),
    ({"website": None}, True), ({"website": "http://example.com"}, False), ({"website": "https://"}, False),
    ({"website": "https://example.com/" + "x" * 200}, False), ({"ownerId": "user-demo-student"}, False),
], ids=lambda value: json.dumps(value)[:40] if isinstance(value, dict) else str(value))
def test_organization_field_rules(make_client, changes, ok):
    with make_client(as_user="student") as client:
        response = client.post("/api/organizations", json=org_body(**changes))
    assert response.status_code == (201 if ok else 422), response.text


def test_only_the_owner_edits_and_the_id_and_owner_never_change(make_client):
    with make_client() as client:  # Noah, owner of the Robotics Club
        edited = client.put("/api/organizations/org-robotics-club", json=org_body(
            name="Robotics Club", description="Build, wire and program robots.",
            logo={"initials": "RC", "color": "gold"}, memberCount=40,
        ))
        assert edited.status_code == 200
        assert edited.json()["id"] == "org-robotics-club"
        assert edited.json()["ownerId"] == "user-demo-organizer"
        assert edited.json()["memberCount"] == 40
        renamed = client.put("/api/organizations/org-robotics-club", json=org_body(
            name="KSU Robotics", logo={"initials": "KR", "color": "gold"},
        ))
        # Renaming renames it on its events.
        assert renamed.json()["name"] == "KSU Robotics"
        assert client.get("/api/events/ev-04").json()["organizer"] == "KSU Robotics"
        sign_in(client, "student")
        response = client.put("/api/organizations/org-robotics-club", json=org_body())
        assert response.status_code == 403
        assert client.put("/api/organizations/org-missing", json=org_body()).status_code == 404


def test_follow_and_unfollow_are_idempotent_and_count_real_followers(make_client):
    url = "/api/organizations/org-game-development-club/follow"
    with make_client(as_user="student") as client:
        assert client.post(url).json() == {"following": True, "followerCount": 1}
        assert client.post(url).json() == {"following": True, "followerCount": 1}
        sign_in(client, "organizer")
        assert client.post(url).json() == {"following": True, "followerCount": 2}
        assert client.post("/api/organizations/org-robotics-club/follow").status_code == 200
        assert client.get("/api/me").json()["followingOrganizationIds"] == [
            "org-game-development-club", "org-robotics-club",
        ]
        assert client.delete(url).json() == {"following": False, "followerCount": 1}
        assert client.delete(url).json() == {"following": False, "followerCount": 1}
        assert client.post("/api/organizations/org-missing/follow").status_code == 404
    with make_client(as_user=None) as client:
        assert client.get("/api/organizations/org-game-development-club").json()["followerCount"] == 1


def test_organizations_list_is_sorted_by_name_and_includes_created_ones(make_client):
    with make_client(as_user="student") as client:
        client.post("/api/organizations", json=org_body(name="Aardvark Society", logo={"initials": "AS", "color": "gold"}))
        names = [org["name"] for org in client.get("/api/organizations").json()]
    assert names == sorted(names, key=str.casefold)
    assert names[0] == "Aardvark Society"
    assert len(names) == 22


def test_organization_events_upcoming_and_past_include_cancelled(make_client):
    clock = Clock()
    with make_client(clock=clock) as client:
        assert client.post("/api/events/ev-25/cancel").status_code == 200
        upcoming = client.get("/api/organizations/org-robotics-club/events").json()
        assert [e["id"] for e in upcoming] == ["ev-04", "ev-25"]
        assert upcoming[1]["status"] == "cancelled"
        assert client.get("/api/organizations/org-robotics-club/events?when=past").json() == []
        clock.advance(days=3)
        past = client.get("/api/organizations/org-robotics-club/events?when=past").json()
        assert [e["id"] for e in past] == ["ev-25", "ev-04"]  # newest first
        assert client.get("/api/organizations/org-robotics-club/events?when=later").status_code == 422
        assert client.get("/api/organizations/org-missing/events").status_code == 404


def test_profile_edits_persist_for_demo_and_signed_up_accounts(make_client):
    clock = Clock()  # 2026
    profile = {"name": " Maya C. ", "major": " Computer Science ", "classYear": 2028,
               "bio": "Robots and ramen.", "avatarColor": "amber"}
    with make_client(as_user="student", clock=clock) as client:
        user = client.put("/api/me/profile", json=profile).json()
        assert user["name"] == "Maya C."
        assert user["profile"] == {"major": "Computer Science", "classYear": 2028,
                                   "bio": "Robots and ramen.", "avatarColor": "amber"}
    with make_client(as_user="student", clock=clock) as client:
        assert client.get("/api/me").json()["profile"]["classYear"] == 2028
        cleared = client.put("/api/me/profile", json=profile | {"major": None, "bio": None, "classYear": None})
        assert cleared.json()["profile"] == {"major": None, "classYear": None, "bio": None, "avatarColor": "amber"}


@pytest.mark.parametrize(("changes", "ok"), [
    ({"name": ""}, False), ({"name": "x" * 80}, True), ({"name": "x" * 81}, False),
    ({"major": "x" * 60}, True), ({"major": "x" * 61}, False), ({"major": " "}, False),
    ({"classYear": 2025}, True), ({"classYear": 2024}, False), ({"classYear": 2033}, True), ({"classYear": 2034}, False),
    ({"classYear": "2028"}, False), ({"bio": "x" * 160}, True), ({"bio": "x" * 161}, False),
    ({"avatarColor": "sky"}, False), ({"avatarColor": "ink"}, True),
], ids=lambda value: json.dumps(value)[:40] if isinstance(value, dict) else str(value))
def test_profile_field_rules(make_client, changes, ok):
    base = {"name": "Maya Chen", "major": None, "classYear": None, "bio": None, "avatarColor": "gold"}
    with make_client(as_user="student", clock=Clock()) as client:
        response = client.put("/api/me/profile", json=base | changes)
    assert response.status_code == (200 if ok else 422), response.text
