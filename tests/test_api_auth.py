"""M5.0 tests: demo login and token protection."""
import time

import pytest
from fastapi.testclient import TestClient

from backend.app import auth
from backend.app.main import create_app

CREDS = {"username": "demo", "password": "PackHorizon-2026"}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("EV_AUTH_REQUIRED", "true")
    auth._fails.clear()
    with TestClient(create_app()) as c:
        yield c
    auth._fails.clear()


def token(client):
    return client.post("/api/v1/auth/login", json=CREDS).json()["access_token"]


def test_health_and_login_are_public_everything_else_is_closed(client):
    assert client.get("/api/v1/health").status_code == 200
    for path in ("/api/v1/presets", "/api/v1/zones", "/api/v1/evidence", "/api/v1/auth/me"):
        r = client.get(path)
        assert r.status_code == 401 and r.json()["error"]["code"] == "not_authenticated", path
    for path in ("/api/v1/predict", "/api/v1/compare", "/api/v1/recommend"):
        assert client.post(path, json={}).status_code == 401, path          # auth is checked before the body


def test_login_gives_a_working_token(client):
    r = client.post("/api/v1/auth/login", json=CREDS)
    assert r.status_code == 200
    j = r.json()
    assert j["token_type"] == "bearer" and j["expires_in"] > 0 and j["username"] == "demo"
    h = {"Authorization": f"Bearer {j['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=h).json() == {"username": "demo"}
    assert client.get("/api/v1/presets", headers=h).status_code == 200


def test_wrong_password_and_wrong_user_look_identical(client):
    a = client.post("/api/v1/auth/login", json={**CREDS, "password": "nope"})
    b = client.post("/api/v1/auth/login", json={**CREDS, "username": "someone"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()
    assert "access_token" not in a.text


def test_tampered_or_expired_tokens_are_refused(client):
    t = token(client)
    bad = t[:-3] + ("AAA" if not t.endswith("AAA") else "BBB")
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bad}"}).status_code == 401
    old = auth.make_token("demo", "dev-only-change-me", 60, now=time.time() - 3600)
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old}"}).status_code == 401
    other = auth.make_token("demo", "a-different-secret", 3600)
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {other}"}).status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_repeated_failures_are_rate_limited(client):
    for _ in range(auth.MAX_FAILS):
        assert client.post("/api/v1/auth/login", json={**CREDS, "password": "x"}).status_code == 401
    r = client.post("/api/v1/auth/login", json=CREDS)          # even the right password waits
    assert r.status_code == 429 and r.json()["error"]["code"] == "too_many_attempts"


def test_login_validates_its_body(client):
    assert client.post("/api/v1/auth/login", json={"username": "", "password": "x"}).status_code == 422
    assert client.post("/api/v1/auth/login", json={**CREDS, "role": "admin"}).status_code == 422


def test_env_credentials_are_used(monkeypatch):
    monkeypatch.setenv("EV_AUTH_REQUIRED", "true")
    monkeypatch.setenv("EV_DEMO_USER", "judge")
    monkeypatch.setenv("EV_DEMO_PASSWORD", "s3cret-test")
    auth._fails.clear()
    with TestClient(create_app()) as c:
        assert c.post("/api/v1/auth/login", json=CREDS).status_code == 401
        assert c.post("/api/v1/auth/login", json={"username": "judge", "password": "s3cret-test"}).status_code == 200


def test_cors_allows_the_authorization_header(client):
    r = client.options("/api/v1/predict", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
                                                   "Access-Control-Request-Headers": "authorization,content-type"})
    assert r.status_code == 200 and "authorization" in r.headers["access-control-allow-headers"].lower()
