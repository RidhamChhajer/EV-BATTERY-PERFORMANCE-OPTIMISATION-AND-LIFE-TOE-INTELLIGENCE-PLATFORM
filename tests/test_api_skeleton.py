"""M4.1 tests: health, errors, CORS, body limit, fail-fast on missing artifact."""
import shutil

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


def test_health_ok_and_versions(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok" and j["mode"] == "prior"
    assert set(j["artifacts"]) >= {"calendar_params.json", "cycle_params.json", "uncertainty.json", "metrics.json"}
    assert len(j["model_version"]) == 12


def test_unknown_route_uniform_error(client):
    r = client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "http_error"


def test_method_not_allowed_uniform(client):
    r = client.post("/api/v1/health")
    assert r.status_code == 405 and "error" in r.json()


def test_cors_allowed_origin(client):
    r = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_disallowed_origin(client):
    r = client.get("/api/v1/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_cors_preflight_allowed(client):
    r = client.options("/api/v1/predict", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
                                                    "Access-Control-Request-Headers": "content-type"})
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_preflight_blocked(client):
    r = client.options("/api/v1/predict", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in r.headers


def test_body_limit_2mb(client):
    assert client.post("/api/v1/predict", content=b"x" * 2_000_000, headers={"Content-Type": "application/json"}).status_code == 413


def test_413_carries_cors_headers(client):
    r = client.post("/api/v1/predict", content=b"x" * 1_100_000,
                    headers={"Content-Type": "application/json", "Origin": "http://localhost:5173"})
    assert r.status_code == 413 and r.headers["access-control-allow-origin"] == "http://localhost:5173"


def _chunks(data: bytes, n: int = 4096):
    for i in range(0, len(data), n):
        yield data[i:i + n]


def test_chunked_valid_body_still_works(client):
    import json
    from tests.test_api_predict import BODY
    r = client.post("/api/v1/predict", content=_chunks(json.dumps(BODY).encode()), headers={"Content-Type": "application/json"})
    assert r.status_code == 200 and r.json()["mode"] == "prior"


def test_chunked_oversized_body_is_413(client):
    r = client.post("/api/v1/predict", content=_chunks(b"x" * 1_500_000), headers={"Content-Type": "application/json"})
    assert r.status_code == 413 and r.json()["error"]["code"] == "payload_too_large"


def test_docs_page_loads(client):
    assert client.get("/docs").status_code == 200 and client.get("/openapi.json").status_code == 200


def test_body_limit(client):
    r = client.post("/api/v1/health", content=b"x" * 1_100_000, headers={"Content-Type": "application/json"})
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"


def test_missing_artifact_fails_fast(tmp_path, monkeypatch):
    shutil.copytree("engine/artifacts", tmp_path / "art")
    (tmp_path / "art" / "cycle_params.json").unlink()
    monkeypatch.setenv("EV_ARTIFACT_DIR", str(tmp_path / "art"))
    with pytest.raises(RuntimeError, match="cycle_params.json"):
        with TestClient(create_app()):
            pass


def test_unhandled_error_has_no_traceback():
    app = create_app()

    @app.get("/boom")
    async def boom():
        raise KeyError("secret internal detail")

    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/boom")
    assert r.status_code == 500
    assert r.json() == {"error": {"code": "internal_error", "message": "Internal server error", "fields": []}}
    assert "secret" not in r.text and "Traceback" not in r.text


def test_value_error_is_not_shown_as_client_error():
    app = create_app()

    @app.get("/vboom")
    async def vboom():
        raise ValueError("internal x")

    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/vboom")
    assert r.status_code == 500 and "internal x" not in r.text


def test_dotenv_not_tracked():
    import subprocess
    assert subprocess.run(["git", "ls-files", ".env"], capture_output=True, text=True).stdout.strip() == ""
