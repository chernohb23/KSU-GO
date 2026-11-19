import builtins
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


FIXTURES_DIR = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


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


@pytest.fixture
def data_dir(tmp_path):
    return tmp_path / "data"


@pytest.fixture
def make_client(data_dir, monkeypatch):
    monkeypatch.delenv("PIPELINE_MODE", raising=False)
    monkeypatch.delenv("BUDGET_CAP_USD", raising=False)

    def make(fixtures_dir=FIXTURES_DIR):
        from main import create_app

        return TestClient(create_app(data_dir=data_dir, fixtures_dir=fixtures_dir))

    return make


@pytest.fixture
def client(make_client):
    with make_client() as client:
        yield client
