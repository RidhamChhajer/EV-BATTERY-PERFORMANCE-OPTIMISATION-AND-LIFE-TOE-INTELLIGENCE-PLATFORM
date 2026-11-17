import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app


@pytest.fixture()
def site(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>app</title>")
    (tmp_path / "assets" / "app-abc123.js").write_text("console.log(1)")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    (tmp_path.parent / "secret.txt").write_text("do not serve")
    monkeypatch.setenv("EV_STATIC_DIR", str(tmp_path))
    monkeypatch.setenv("EV_AUTH_REQUIRED", "false")
    with TestClient(create_app()) as c:
        yield c


def test_root_and_app_routes_return_the_page(site):
    assert "<title>app</title>" in site.get("/").text
    r = site.get("/optimise")                      # a reload on a client-side route
    assert r.status_code == 200 and "<title>app</title>" in r.text and r.headers["cache-control"] == "no-cache"


def test_assets_are_served_and_cached_for_a_year(site):
    r = site.get("/assets/app-abc123.js")
    assert r.status_code == 200 and "immutable" in r.headers["cache-control"]


def test_missing_file_is_404_not_the_page(site):
    assert site.get("/assets/missing.js").status_code == 404


@pytest.mark.parametrize("p", ["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt", "/..%2f.env"])
def test_path_traversal_never_leaves_the_build_folder(site, p):
    r = site.get(p)
    assert "do not serve" not in r.text
    assert r.status_code in (200, 404)             # 200 only ever means the index page
    if r.status_code == 200:
        assert "<title>app</title>" in r.text


def test_api_still_wins_and_unknown_api_paths_are_json_404(site):
    assert site.get("/api/v1/health").json()["status"] == "ok"
    r = site.get("/api/v1/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "http_error"


def test_page_gets_the_app_content_security_policy(site):
    csp = site.get("/").headers["content-security-policy"]
    assert "script-src 'self'" in csp and "frame-ancestors 'none'" in csp


def test_without_a_build_folder_the_api_still_runs(monkeypatch, tmp_path):
    monkeypatch.setenv("EV_STATIC_DIR", str(tmp_path / "nothing"))
    monkeypatch.setenv("EV_AUTH_REQUIRED", "false")
    with TestClient(create_app()) as c:
        assert c.get("/api/v1/health").status_code == 200
        assert c.get("/").status_code == 404
