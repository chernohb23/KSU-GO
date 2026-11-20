"""Demo accounts: signup, login, logout, /api/me, sessions, password storage and logs."""

import hashlib
import json
import logging

import pytest

from conftest import Clock, demo_account


USER_KEYS = {"id", "name", "email", "role", "organizationId"}
WRONG_LOGIN = {"code": "unauthenticated", "message": "Email or password is wrong."}


def signup(client, name="Ana Ruiz", email="ana@example.com", password="correct horse"):
    return client.post("/api/auth/signup", json={"name": name, "email": email, "password": password})


def login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def me(client, token):
    return client.get("/api/me", headers={"Authorization": f"Bearer {token}"})


def test_signup_creates_a_student_and_signs_in(make_client):
    with make_client(as_user=None) as client:
        response = signup(client, name="  Ana Ruiz ", email="  Ana@Example.COM ")
        assert response.status_code == 201
        body = response.json()
        assert set(body) == {"token", "user"}
        assert set(body["user"]) == USER_KEYS
        assert body["user"] | {"id": None} == {
            "id": None, "name": "Ana Ruiz", "email": "ana@example.com",
            "role": "student", "organizationId": None,
        }
        mine = me(client, body["token"])
        assert mine.status_code == 200
        assert mine.json() == body["user"]


def test_signup_cannot_choose_a_role_or_organization(make_client):
    with make_client(as_user=None) as client:
        for extra in ({"role": "organizer"}, {"organizationId": "org-robotics-club"}):
            response = client.post("/api/auth/signup", json={
                "name": "Ana", "email": "ana@example.com", "password": "correct horse", **extra,
            })
            assert response.status_code == 422
            assert response.json()["error"]["code"] == "invalid_request"


@pytest.mark.parametrize("email", ["ana@example.com", " ANA@example.com ", "student@ksu-go.example"])
def test_duplicate_email_is_rejected_with_the_contract_message(make_client, email):
    with make_client(as_user=None) as client:
        assert signup(client).status_code == 201
        response = signup(client, email=email)
    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "invalid_request", "message": "An account with this email already exists.",
    }


@pytest.mark.parametrize(("field", "value", "ok"), [
    ("name", "", False), ("name", "   ", False), ("name", "x" * 80, True), ("name", "x" * 81, False),
    ("email", "no-at-sign", False), ("email", "a@b@c", False), ("email", "a@", False),
    ("email", "@b", False), ("email", "a@" + "b" * 252, True), ("email", "a@" + "b" * 253, False),
    ("password", "x" * 7, False), ("password", "x" * 8, True), ("password", "x" * 128, True),
    ("password", "x" * 129, False), ("password", 12345678, False), ("name", None, False),
])
def test_signup_field_rules(make_client, field, value, ok):
    fields = {"name": "Ana", "email": "ana@example.com", "password": "correct horse"} | {field: value}
    with make_client(as_user=None) as client:
        response = client.post("/api/auth/signup", json=fields)
    assert response.status_code == (201 if ok else 422)
    if not ok:
        assert response.json()["error"]["code"] == "invalid_request"


@pytest.mark.parametrize("role", ["student", "organizer"])
def test_demo_accounts_log_in(make_client, role):
    account = demo_account(role)
    with make_client(as_user=None) as client:
        response = login(client, f"  {account['email'].upper()} ", account["password"])
        assert response.status_code == 200
        user = response.json()["user"]
        assert set(user) == USER_KEYS
        assert me(client, response.json()["token"]).json() == user
    assert user["name"] == account["name"]
    assert user["role"] == role
    assert user["organizationId"] == ("org-robotics-club" if role == "organizer" else None)


def test_wrong_password_and_unknown_email_get_the_same_401(make_client):
    account = demo_account("student")
    with make_client(as_user=None) as client:
        wrong_password = login(client, account["email"], "not the password")
        unknown_email = login(client, "nobody@example.com", account["password"])
        assert login(client, account["email"], account["password"].lower()).status_code == 401
        malformed = client.post("/api/auth/login", json={"email": account["email"]})
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json()["error"] == unknown_email.json()["error"] == WRONG_LOGIN
    assert malformed.status_code == 422


def test_logout_ends_only_that_session(make_client):
    account = demo_account("organizer")
    with make_client(as_user=None) as client:
        first = login(client, account["email"], account["password"]).json()["token"]
        second = login(client, account["email"], account["password"]).json()["token"]
        response = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {first}"})
        assert response.status_code == 204
        assert response.content == b""
        assert me(client, first).status_code == 401
        assert me(client, first).json()["error"]["code"] == "unauthenticated"
        assert me(client, second).status_code == 200
        again = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {first}"})
        assert again.status_code == 401


def test_token_expires_seven_days_after_it_was_issued(make_client):
    clock = Clock()
    account = demo_account("student")
    with make_client(as_user=None, clock=clock) as client:
        token = login(client, account["email"], account["password"]).json()["token"]
        clock.advance(days=7, seconds=-1)
        assert me(client, token).status_code == 200
        clock.advance(seconds=1)
        response = me(client, token)
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthenticated"
        # Using a session does not extend it.
        fresh = login(client, account["email"], account["password"]).json()["token"]
        clock.advance(days=6)
        assert me(client, fresh).status_code == 200
        clock.advance(days=1)
        assert me(client, fresh).status_code == 401


def test_sessions_and_signed_up_accounts_survive_a_restart(make_client, data_dir):
    with make_client(as_user=None) as client:
        token = signup(client).json()["token"]
    with make_client(as_user=None) as client:
        assert me(client, token).json()["email"] == "ana@example.com"
        assert login(client, "ana@example.com", "correct horse").status_code == 200
        assert client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"}).status_code == 204
    with make_client(as_user=None) as client:
        assert me(client, token).status_code == 401


def test_demo_accounts_are_not_duplicated_or_stored_across_restarts(make_client, data_dir):
    account = demo_account("organizer")
    for _ in range(3):
        with make_client(as_user=None) as client:
            assert login(client, account["email"], account["password"]).status_code == 200
            assert signup(client, email=account["email"]).status_code == 422
    saved = json.loads((data_dir / "state.json").read_text())
    assert saved["users"] == {}
    assert {session["userId"] for session in saved["sessions"].values()} == {"user-demo-organizer"}


def test_state_file_holds_only_salted_hashes_and_token_hashes(make_client, data_dir):
    password = "same password for both"
    with make_client(as_user=None) as client:
        first = signup(client, email="one@example.com", password=password).json()["token"]
        second = signup(client, email="two@example.com", password=password).json()["token"]
    raw = (data_dir / "state.json").read_text()
    for secret in (password, first, second, demo_account("student")["password"],
                   demo_account("organizer")["password"]):
        assert secret not in raw
    saved = json.loads(raw)
    assert set(saved["sessions"]) == {
        hashlib.sha256(token.encode()).hexdigest() for token in (first, second)
    }
    records = [user["password"] for user in saved["users"].values()]
    assert len(records) == 2
    assert all(record.startswith("scrypt$16384$8$1$") for record in records)
    assert len({record.split("$")[4] for record in records}) == 2  # a fresh salt per user


def test_production_cost_is_the_owasp_minimum(monkeypatch):
    import accounts

    assert accounts.PRODUCTION_SCRYPT_N == 2**17
    monkeypatch.setattr(accounts, "SCRYPT_N", accounts.PRODUCTION_SCRYPT_N)
    record = accounts.hash_password("correct horse")
    assert record.startswith("scrypt$131072$8$1$")
    assert accounts.verify_password("correct horse", record)


def test_password_records_carry_their_own_parameters(monkeypatch):
    import accounts

    record = accounts.hash_password("correct horse")
    assert accounts.verify_password("correct horse", record)
    assert not accounts.verify_password("correct horsf", record)
    # A 2**14 record (the cost used before) still verifies under the production cost.
    monkeypatch.setattr(accounts, "SCRYPT_N", accounts.PRODUCTION_SCRYPT_N)
    assert record.startswith("scrypt$16384$8$1$")
    assert accounts.verify_password("correct horse", record)
    # A record made with other parameters still verifies, so the cost can be raised later.
    salt = bytes(16)
    key = hashlib.scrypt(b"correct horse", salt=salt, n=2**10, r=4, p=2, dklen=16)
    older = f"scrypt${2**10}$4$2${salt.hex()}${key.hex()}"
    assert accounts.verify_password("correct horse", older)
    assert not accounts.verify_password("wrong", older)


def test_logs_never_contain_passwords_tokens_or_authorization(make_client, caplog, capfd):
    caplog.set_level(logging.DEBUG)
    password = "s3cret-signup-pass"
    student = demo_account("student")
    organizer = demo_account("organizer")
    tokens = []
    with make_client(as_user=None) as client:
        tokens.append(signup(client, password=password).json()["token"])
        assert login(client, student["email"], "wrong-guess-pass").status_code == 401
        tokens.append(login(client, student["email"], student["password"]).json()["token"])
        tokens.append(login(client, organizer["email"], organizer["password"]).json()["token"])
        student_auth = {"Authorization": f"Bearer {tokens[1]}"}
        organizer_auth = {"Authorization": f"Bearer {tokens[2]}"}
        assert client.get("/api/me", headers=student_auth).status_code == 200
        assert client.post("/api/events/ev-04/register", headers=student_auth).status_code == 200
        assert client.post("/api/events", headers=organizer_auth, json={}).status_code == 422
        assert client.get("/api/events", headers={"Authorization": "Bearer junk-token-value"}).status_code == 200
        assert client.get("/api/me", headers={"Authorization": "Bearer junk-token-value"}).status_code == 401
        assert client.post("/api/auth/logout", headers=student_auth).status_code == 204
    captured = capfd.readouterr()
    logged = caplog.text + captured.out + captured.err
    assert caplog.records  # the capture is live, so an empty text would prove nothing
    for secret in [password, "wrong-guess-pass", student["password"], organizer["password"],
                   "junk-token-value", *tokens]:
        assert secret not in logged
    assert "Bearer" not in logged
    assert "authorization" not in logged.lower()
