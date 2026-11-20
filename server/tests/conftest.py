import builtins
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


FIXTURES_DIR = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


DEMO_IDS = {"student": "user-demo-student", "organizer": "user-demo-organizer"}


def demo_account(who):
    """Maya ("student") or Noah ("organizer", owner of the Robotics Club)."""
    from demo_accounts import DEMO_ACCOUNTS

    return next(account for account in DEMO_ACCOUNTS if account["id"] == DEMO_IDS[who])


def sign_in(client, role):
    """Log in through the real endpoint as a demo account and send its token from now on."""
    account = demo_account(role)
    response = client.post(
        "/api/auth/login", json={"email": account["email"], "password": account["password"]},
    )
    assert response.status_code == 200, response.text
    token = response.json()["token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return token


class SignedInClient(TestClient):
    """A TestClient that signs in once the app (and its store) has started."""

    def __init__(self, app, *, as_user="organizer"):
        super().__init__(app)
        self.as_user = as_user

    def __enter__(self):
        super().__enter__()
        if self.as_user is not None:
            sign_in(self, self.as_user)
        return self


class Clock:
    """A settable clock for create_app(clock=...)."""

    def __init__(self, now=datetime(2026, 11, 19, 17, 0, tzinfo=UTC)):
        self.now = now

    def __call__(self):
        return self.now

    def advance(self, **delta):
        self.now += timedelta(**delta)


@pytest.fixture(autouse=True)
def no_paid_clients_or_keys(monkeypatch):
    """Every test stays offline: fail before importing Gemini or reading a key."""
    original_import = builtins.__import__
    original_getitem = os._Environ.__getitem__

    def guarded_import(name, *args, **kwargs):
        if name == "google" or name.startswith("google.genai"):
            raise AssertionError("Tests must inject a fake Gemini client.")
        return original_import(name, *args, **kwargs)

    def guarded_getitem(self, key):
        if key in {"GEMINI_API_KEY", "REPLICATE_API_TOKEN"}:
            raise AssertionError("Tests must not read environment keys.")
        return original_getitem(self, key)

    monkeypatch.setattr(builtins, "__import__", guarded_import)
    monkeypatch.setattr(os._Environ, "__getitem__", guarded_getitem)


@pytest.fixture(autouse=True)
def cheap_password_hashing(monkeypatch):
    """Tests hash with N=2**14 instead of the production 2**17 to stay fast."""
    import accounts

    monkeypatch.setattr(accounts, "SCRYPT_N", 2**14)


@pytest.fixture
def data_dir(tmp_path):
    return tmp_path / "data"


@pytest.fixture
def make_client(data_dir, monkeypatch):
    monkeypatch.delenv("PIPELINE_MODE", raising=False)
    monkeypatch.delenv("BUDGET_CAP_USD", raising=False)

    def make(fixtures_dir=FIXTURES_DIR, *, as_user="organizer", clock=None):
        from main import create_app

        options = {} if clock is None else {"clock": clock}
        app = create_app(data_dir=data_dir, fixtures_dir=fixtures_dir, **options)
        return SignedInClient(app, as_user=as_user)

    return make


@pytest.fixture
def client(make_client):
    with make_client() as client:
        yield client
