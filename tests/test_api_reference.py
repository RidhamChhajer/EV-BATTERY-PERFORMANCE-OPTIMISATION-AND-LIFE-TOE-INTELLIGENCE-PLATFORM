"""M4.3 tests: /compare, /presets, /zones, /evidence, OpenAPI contract."""
import json

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from tests.helpers import find_bare_numbers

SC = {"pack_kwh": 350, "kwh_per_km": 1.2, "km_per_day": 200, "operating_days_per_year": 340, "charge_power_kw": 120}


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def cmp(client, *variants, **kw):
    scs = [SC] + [{**SC, **v} for v in variants]
    return client.post("/api/v1/compare", json={"scenarios": scs, **kw})


# ---- compare
def test_compare_shape_and_alignment(client):
    r = cmp(client, {"soc_max_pct": 90}, {"zone": "cool"})
    assert r.status_code == 200
    j = r.json()
    assert len(j["replacements"]) == 3 == len(j["scenarios"]) and len(j["deltas"]) == 2
    assert j["scenarios"][1]["soc_max_pct"] == 90 and j["scenarios"][2]["zone"] == "cool"
    assert j["mode"] == "prior" and any("validated on buses" in w for w in j["warnings"])
    assert j["deltas"][0]["months_p50"]["value"] > 0 and j["deltas"][1]["months_p50"]["value"] > 0   # cap / cooler zone both help


def test_compare_identical_scenarios_have_zero_delta(client):
    j = cmp(client, {}).json()           # paired draws: identical scenarios must give exactly no difference
    d = j["deltas"][0]
    assert d["months_p10"]["value"] == d["months_p50"]["value"] == d["months_p90"]["value"] == 0
    assert d["prob_variant_later"]["value"] == 0


def test_compare_every_number_labelled(client):
    assert find_bare_numbers(cmp(client, {"soc_max_pct": 90}).json(), skip=("scenario", "scenarios", "months")) == []


def test_compare_notes_name_the_changed_lever(client):
    assert any("state of charge" in n for n in cmp(client, {"soc_max_pct": 90}).json()["notes"])
    assert any("time spent full" in n for n in cmp(client, {"charge_power_kw": 60}).json()["notes"])


@pytest.mark.parametrize("n", [1, 5])
def test_compare_scenario_count_limits(client, n):
    r = client.post("/api/v1/compare", json={"scenarios": [SC] * n})
    assert r.status_code == 422 and any(f["field"].startswith("scenarios") for f in r.json()["error"]["fields"])


def test_compare_invalid_member_names_index(client):
    r = client.post("/api/v1/compare", json={"scenarios": [SC, {**SC, "pack_kwh": -1}]})
    assert r.status_code == 422 and any("scenarios.1.pack_kwh" in f["field"] for f in r.json()["error"]["fields"])


def test_compare_cached_and_seeded(client):
    a = cmp(client, {"soc_max_pct": 85}, seed=5)
    b = cmp(client, {"soc_max_pct": 85}, seed=5)
    assert a.headers["x-cache"] == "MISS" and b.headers["x-cache"] == "HIT" and a.json() == b.json()


# ---- presets
def test_presets_match_source_file_and_are_assumptions(client):
    j = client.get("/api/v1/presets").json()
    src = json.load(open("engine/bus/archetypes.json"))["archetypes"]
    assert {p["id"] for p in j["presets"]} == set(src)
    for p in j["presets"]:
        for k, f in p["fields"].items():
            assert f["value"]["value"] == src[p["id"]][k]["value"]
            assert f["value"]["evidence_level"] == "assumption" and f["value"]["note"]
            assert f["value"]["unit"]
    assert find_bare_numbers(j, skip=("scenario",)) == []


def test_each_preset_scenario_predicts(client):
    for p in client.get("/api/v1/presets").json()["presets"]:
        assert client.post("/api/v1/predict", json={"scenario": p["scenario"], "n_draws": 200}).status_code == 200


# ---- zones
def test_zones_are_real_data_from_file(client):
    j = client.get("/api/v1/zones").json()
    src = json.load(open("engine/data/zones.json"))["zones"]
    assert {z["id"] for z in j["zones"]} == {"hot_dry", "hot_humid", "composite", "cool"}
    assert j["provenance"]["synthetic"] is False and j["provenance"]["attribution"] and j["data_kind"] == "measured_weather"
    for z in j["zones"]:
        assert len(z["monthly"]) == 12
        assert z["monthly"] == src[z["id"]]["monthly"]
    cool = next(z for z in j["zones"] if z["id"] == "cool")
    hot = next(z for z in j["zones"] if z["id"] == "hot_dry")
    assert max(m["tmean_c"] for m in cool["monthly"]) < max(m["tmean_c"] for m in hot["monthly"])


# ---- evidence
def test_evidence_comes_from_files(client):
    j = client.get("/api/v1/evidence").json()
    assert j["validated_on_buses"] is False and j["mode"] == "prior"
    assert j["metrics"] == json.load(open("engine/artifacts/metrics.json"))
    assert j["uncertainty"] == json.load(open("engine/artifacts/uncertainty.json"))
    ids = {d["id"] for d in j["datasets"]}
    assert ids == {"hust", "stanford_calendar", "naumann_calendar", "weather", "evbattery"}
    assert all(d["synthetic"] is False and d["source_url"] and d["licence"] and d["limitations"] and d["used_for"] for d in j["datasets"])
    cyc = json.load(open("engine/artifacts/cycle_params.json"))["params"]
    assert j["training_coverage"]["cycling_c_rate"] == list(cyc["valid_c_rate"])
    assert any("validated on buses" in s for s in j["limitations"])
    assert client.get("/api/v1/health").json()["artifacts"] == j["artifacts"]


def test_evidence_contains_headline_numbers_from_metrics(client):
    m = client.get("/api/v1/evidence").json()["metrics"]
    el = {c["model"]: c["mape"] for c in m["early_life"]["candidates"]}
    assert el["ElasticNet capacity features"] == pytest.approx(12.7, abs=0.05)          # HUST early-life error
    assert m["evbattery_capacity"]["snippet_features"]["mape"] == pytest.approx(2.29, abs=0.02)
    assert m["evbattery_capacity"]["mileage_only"]["mape"] > m["evbattery_capacity"]["snippet_features"]["mape"]
    assert "not LFP" in m["evbattery_capacity"]["chemistry"]


def test_evidence_serves_the_calibration_demo_with_its_caveat(client):
    cd = client.get("/api/v1/evidence").json()["metrics"]["calibration_demo"]
    r = {x["n_labels"]: x for x in cd["with_snippet_features"]["results"]}
    assert sorted(r) == [0, 5, 20, 100]
    assert r[5]["partial_pooling_mape"] < r[0]["prior_mape"]
    assert "not LFP" in cd["chemistry"] and "method demonstration" in cd["caveat"]


def test_evidence_reflects_changed_metrics_file(tmp_path, monkeypatch):
    import shutil
    shutil.copytree("engine/artifacts", tmp_path / "art")
    monkeypatch.setenv("EV_ARTIFACT_DIR", str(tmp_path / "art"))
    with TestClient(create_app()) as c:
        before = c.get("/api/v1/evidence").json()["metrics"]
        mp = tmp_path / "art" / "metrics.json"
        data = json.load(open(mp)); data["early_life"]["improvement_vs_mean_pct_points"] = 99.0
        json.dump(data, open(mp, "w"))
        after = c.get("/api/v1/evidence").json()["metrics"]
    assert before != after and after["early_life"]["improvement_vs_mean_pct_points"] == 99.0


def test_compare_unsupported_mode_is_400(client):
    r = client.post("/api/v1/compare", json={"scenarios": [SC, SC], "mode": "calibrated"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "unsupported_mode"


# ---- contract
def test_openapi_file_is_current_and_complete():
    spec = create_app().openapi()
    assert json.load(open("docs/openapi.json")) == json.loads(json.dumps(spec, sort_keys=True)), "run scripts/export_openapi.py"
    assert {"/api/v1/health", "/api/v1/predict", "/api/v1/compare", "/api/v1/presets", "/api/v1/zones", "/api/v1/evidence"} <= set(spec["paths"])
    assert {"PredictRequest", "PredictionResult", "CompareRequest", "CompareResult", "Labelled"} <= set(spec["components"]["schemas"])
