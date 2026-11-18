from pathlib import Path

import pytest
from fastapi.testclient import TestClient


FIXTURES_DIR = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


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
