"""M4.2 tests: POST /api/v1/predict."""
import json
import threading
import time

import pytest
from fastapi.testclient import TestClient

from backend.app import service
from backend.app.main import create_app
from tests.helpers import find_bare_numbers

BODY = {"scenario": {"pack_kwh": 350, "kwh_per_km": 1.2, "km_per_day": 200, "operating_days_per_year": 340,
                     "charge_power_kw": 120, "battery_cost_per_kwh_inr": 12000}}



@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


def body(**over):
    b = json.loads(json.dumps(BODY))
    for k, v in over.items():
        if k in ("n_draws", "seed", "range_temperature_mode"):
            b[k] = v
        else:
            b["scenario"][k] = v
    return b


def test_predict_ok_shape_and_mode(client):
    r = client.post("/api/v1/predict", json=BODY)
    assert r.status_code == 200
    j = r.json()
    assert j["mode"] == "prior" and len(j["model_version"]) == 12
    assert "validated on buses" in j["disclaimer"]
    for k in ("conditions", "replacement", "range", "cost", "driver_split", "warnings", "scenario"):
        assert k in j
    p10, p50, p90 = (j["replacement"][f"retention_{q}"]["value"] for q in ("p10", "p50", "p90"))
    assert all(a <= b <= c for a, b, c in zip(p10, p50, p90))
    assert j["driver_split"]["calendar_share"]["value"] + j["driver_split"]["cycling_share"]["value"] == pytest.approx(1.0)
    m = j["replacement"]
    assert m["months_p10"]["value"] <= m["months_p50"]["value"]
    assert m["months_p90"] is None or m["months_p50"]["value"] <= m["months_p90"]["value"]      # None = beyond the horizon, said not invented
    assert j["cost"]["cost_per_km_p50"]["value"] > 0
    assert any("not been validated" in w or "validated on buses" in w for w in j["warnings"])


@pytest.mark.parametrize("arch", ["12m", "9m"])
@pytest.mark.parametrize("zone", ["hot_dry", "hot_humid", "composite", "cool"])
def test_every_number_labelled_and_finite(client, arch, zone):
    from engine.bus.scenario import Scenario
    s = Scenario.from_preset(arch, zone=zone, battery_cost_per_kwh_inr=12000).model_dump()
    r = client.post("/api/v1/predict", json={"scenario": s})
    assert r.status_code == 200
    assert find_bare_numbers(r.json()) == []


def test_reference_engine_is_deterministic_and_ignores_the_seed(client):
    # The reference ensemble is a fixed 50-run grid (2 models x 5 scalars x 5 pack penalties): there is nothing random to seed.
    a = client.post("/api/v1/predict", json=body(seed=3)).json()
    with TestClient(create_app()) as c2:           # fresh app, empty cache
        b = c2.post("/api/v1/predict", json=body(seed=3)).json()
        c = c2.post("/api/v1/predict", json=body(seed=4)).json()
    assert a == b
    assert a["replacement"] == c["replacement"]


def test_lab_engine_seed_changes_result(monkeypatch):
    monkeypatch.setenv("EV_ENGINE", "lab")
    with TestClient(create_app()) as c:
        a = c.post("/api/v1/predict", json=body(seed=3)).json()
        b = c.post("/api/v1/predict", json=body(seed=4)).json()
    assert a["replacement"]["months_p50"] != b["replacement"]["months_p50"] or a["replacement"]["retention_p10"] != b["replacement"]["retention_p10"]


def test_cache_hit_returns_identical_body(client):
    r1 = client.post("/api/v1/predict", json=body())
    r2 = client.post("/api/v1/predict", json=body())
    assert r1.headers["x-cache"] == "MISS" and r2.headers["x-cache"] == "HIT"
    assert r1.json() == r2.json()
    r3 = client.post("/api/v1/predict", json=body(km_per_day=210))
    assert r3.headers["x-cache"] == "MISS"


def test_extrapolation_is_warned(client):
    j = client.post("/api/v1/predict", json=body(zone="hot_dry", heat_rise_c=20)).json()
    assert j["replacement"]["extrapolated"] is True and j["replacement"]["extrapolation_reasons"]
    assert any("Outside the conditions the NREL cells were tested at" in w for w in j["warnings"])
    assert any("degC" in r for r in j["replacement"]["extrapolation_reasons"])


def test_cached_call_is_faster(client):
    b = body(n_draws=5000, seed=21)
    t = time.time(); client.post("/api/v1/predict", json=b); cold = time.time() - t
    t = time.time(); r = client.post("/api/v1/predict", json=b); warm = time.time() - t
    assert r.headers["x-cache"] == "HIT" and warm < cold


def test_unsupported_mode_is_400(client):
    r = client.post("/api/v1/predict", json={**BODY, "mode": "calibrated"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "unsupported_mode"
    assert "Calibrated" in r.json()["error"]["message"]


def test_lru_evicts_oldest():
    c = service.LRUCache(2)
    c.put("a", 1); c.put("b", 2); c.get("a"); c.put("c", 3)
    assert c.get("b") is None and c.get("a") == 1 and c.get("c") == 3 and len(c) == 2


@pytest.mark.parametrize("over,field", [
    ({"pack_kwh": -5}, "scenario.pack_kwh"),
    ({"km_per_day": 10_000}, "scenario.km_per_day"),
    ({"zone": "mars"}, "scenario.zone"),
    ({"soc_min_pct": 55, "soc_max_pct": 60}, "scenario"),
    ({"n_draws": 5001}, "n_draws"),
    ({"n_draws": 10**7}, "n_draws"),
    ({"n_draws": 10}, "n_draws"),
])
def test_invalid_inputs_give_field_level_422(client, over, field):
    r = client.post("/api/v1/predict", json=body(**over))
    assert r.status_code == 422
    e = r.json()["error"]
    assert e["code"] == "validation_error" and any(f["field"].startswith(field) for f in e["fields"])


def test_extra_fields_rejected(client):
    b = body(); b["scenario"]["turbo"] = True
    assert client.post("/api/v1/predict", json=b).status_code == 422
    b = body(); b["admin"] = 1
    assert client.post("/api/v1/predict", json=b).status_code == 422


def test_missing_body_and_bad_json(client):
    assert client.post("/api/v1/predict").status_code == 422
    r = client.post("/api/v1/predict", content=b"{not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 422 and "error" in r.json()


def test_no_battery_price_gives_null_cost_and_warning(client):
    b = body(); del b["scenario"]["battery_cost_per_kwh_inr"]
    j = client.post("/api/v1/predict", json=b).json()
    assert j["cost"]["cost_per_km_p50"] is None
    assert any("battery price" in w for w in j["warnings"])


def test_short_horizon_limits_range_ages(client):
    j = client.post("/api/v1/predict", json=body(horizon_years=2)).json()
    assert j["range"]["ages_years"] == [0.0]


def test_what_if_cap_changes_answer(client):
    full = client.post("/api/v1/predict", json=body(soc_max_pct=100)).json()["replacement"]["months_p50"]["value"]
    cap = client.post("/api/v1/predict", json=body(soc_max_pct=90)).json()["replacement"]["months_p50"]["value"]
    assert cap > full


def test_latency_under_two_seconds(client):
    t = time.time()
    assert client.post("/api/v1/predict", json=body(n_draws=5000, seed=11)).status_code == 200
    assert time.time() - t < 2.0


def test_concurrent_requests_consistent():
    with TestClient(create_app()) as c:
        results, errs = [], []

        def go(seed):
            try:
                results.append((seed, c.post("/api/v1/predict", json=body(seed=seed % 3)).json()["replacement"]["months_p50"]))
            except Exception as e:      # pragma: no cover
                errs.append(e)
        ts = [threading.Thread(target=go, args=(i,)) for i in range(20)]
        [t.start() for t in ts]; [t.join() for t in ts]
    assert not errs and len(results) == 20
    by = {}
    for seed, v in results:
        by.setdefault(seed % 3, []).append(v)
    assert all(all(x == vs[0] for x in vs) for vs in by.values())


def test_value_error_inside_engine_is_500_not_422(monkeypatch):
    def boom(*a, **k):
        raise ValueError("internal x")
    monkeypatch.setattr(service, "run_prediction", boom)
    with TestClient(create_app(), raise_server_exceptions=False) as c:
        r = c.post("/api/v1/predict", json=BODY)
    assert r.status_code == 500 and "internal x" not in r.text


def test_engine_failure_is_logged_server_side(monkeypatch, caplog):
    def boom(*a, **k):
        raise RuntimeError("secret path /Users/x/model.bin")
    monkeypatch.setattr(service, "run_prediction", boom)
    with caplog.at_level("ERROR", logger="ev.api"):
        with TestClient(create_app(), raise_server_exceptions=False) as c:
            c.post("/api/v1/predict", json=BODY)
    assert any("unhandled error" in r.message for r in caplog.records)


def test_engine_failure_is_500_without_leak(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("secret path /Users/x/model.bin")
    monkeypatch.setattr(service, "run_prediction", boom)
    with TestClient(create_app(), raise_server_exceptions=False) as c:
        r = c.post("/api/v1/predict", json=BODY)
    assert r.status_code == 500 and r.json()["error"]["code"] == "internal_error"
    assert "secret" not in r.text
