import os

import pytest
from fastapi.testclient import TestClient

from backend.app import auth
from backend.app.config import Settings
from backend.app.main import create_app


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


def test_security_headers_on_api_responses(client):
    r = client.get("/api/v1/health")
    h = r.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in h["content-security-policy"] and "default-src 'none'" in h["content-security-policy"]
    assert h["cache-control"] == "no-store"
    assert "camera=()" in h["permissions-policy"]


def test_security_headers_also_on_errors_and_413(client):
    assert client.get("/api/v1/nope").headers["x-content-type-options"] == "nosniff"
    big = client.post("/api/v1/predict", content=b"x" * 2_000_000, headers={"content-type": "application/json"})
    assert big.status_code == 413 and big.headers["x-content-type-options"] == "nosniff"


def test_malformed_json_is_a_clean_client_error(client):
    r = client.post("/api/v1/predict", content=b"{not json", headers={"content-type": "application/json"})
    assert r.status_code in (400, 422)
    body = r.text
    assert "Traceback" not in body and "File \"" not in body and r.json()["error"]["code"] in ("validation_error", "http_error")


def test_wrong_types_do_not_leak_internals(client):
    r = client.post("/api/v1/predict", json={"scenario": {"km_per_day": "far"}})
    assert r.status_code == 422 and "Traceback" not in r.text


def test_without_a_configured_secret_each_process_uses_a_random_one(monkeypatch):
    monkeypatch.delenv("EV_AUTH_SECRET", raising=False)
    s = Settings().auth_secret
    assert s == Settings().auth_secret and len(s) >= 32 and s != "dev-only-change-me"
    # a token signed with the old public development string must not be accepted
    forged = auth.make_token("demo", "dev-only-change-me", 600)
    assert auth.read_token(forged, s) is None


def test_configured_secret_is_used(monkeypatch):
    monkeypatch.setenv("EV_AUTH_SECRET", "x" * 40)
    assert Settings().auth_secret == "x" * 40
