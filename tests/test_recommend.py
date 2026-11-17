"""M5.0 tests: /recommend usage presets are real model output, feasible, labelled and consistent with /predict and /compare."""
import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from engine.bus.scenario import Scenario
from tests.helpers import find_bare_numbers


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def scen(**kw):
    return Scenario.from_preset("12m", battery_cost_per_kwh_inr=12000, **kw).model_dump()


def rec(client, **kw):
    r = client.post("/api/v1/recommend", json={"scenario": scen(**kw), "n_draws": 600})
    assert r.status_code == 200, r.text
    return r.json()


def test_every_number_labelled(client):
    assert find_bare_numbers(rec(client)) == []


def test_default_bus_is_range_tight_and_says_so_plainly(client):
    j = rec(client)
    f = j["feasibility"]
    assert f["base_passes"] is False
    assert "already runs tighter" in f["plain"] and "210 km" in f["plain"] and "240 km" in f["plain"]
    base_rr = f["base_range_at_replacement_km"]["value"]
    for p in j["presets"]:
        for st in (p["charging"], p["with_confirmation"]):
            if st:
                assert st["feasible"]
                assert st["metrics"]["range_at_replacement_km"]["value"] >= base_rr - 1e-6      # never worse than Bus A
        assert all(c["lever"] != "soc_max_pct" for c in p["charging"]["changes"])               # caps all cut range here
    assert any("rejected" in t for t in j["presets"][0]["rejected"])


def test_light_route_unlocks_charge_cap_presets_and_budgets_order_the_gains(client):
    j = rec(client, km_per_day=150)
    assert j["feasibility"]["base_passes"] is True
    gain = {p["id"]: p["charging"]["delta"]["months_p50"]["value"] for p in j["presets"]}
    assert gain["longest_life"] >= gain["lowest_cost"] >= gain["balanced"] >= gain["max_range"] >= 0
    assert gain["longest_life"] > gain["max_range"]
    longest = {p["id"]: p for p in j["presets"]}["longest_life"]
    assert any(c["lever"] == "soc_max_pct" for c in longest["charging"]["changes"])
    need = j["feasibility"]["required_range_km"]["value"]
    assert longest["charging"]["metrics"]["range_at_replacement_km"]["value"] >= need - 1e-6
    budget = {p["id"]: p["range_budget"]["value"] for p in j["presets"]}
    for p in j["presets"]:
        assert -p["charging"]["delta"]["range_change_km"]["value"] <= budget[p["id"]] * j["base"]["range_at_replacement_km"]["value"] + 1e-6


def test_results_follow_the_inputs_not_a_fixed_table(client):
    a, b = rec(client, km_per_day=150), rec(client, km_per_day=200)
    assert a["presets"][3]["charging"]["summary"] != b["presets"][3]["charging"]["summary"]
    assert rec(client, km_per_day=150) == a                                                     # deterministic


def test_confirmation_stage_is_separate_and_flagged(client):
    j = rec(client)
    for p in j["presets"]:
        assert not any(c["needs_confirmation"] for c in p["charging"]["changes"])
        wc = p["with_confirmation"]
        assert wc and any(c["needs_confirmation"] for c in wc["changes"])
        assert wc["delta"]["months_p50"]["value"] > p["charging"]["delta"]["months_p50"]["value"]
    hot = {p["id"]: p for p in j["presets"]}["hot_climate"]
    cool = {c["lever"]: c for c in hot["with_confirmation"]["changes"]}["heat_rise_c"]
    assert cool["from_value"]["value"] - cool["to_value"]["value"] == pytest.approx(3.0)


def test_identical_goals_are_linked_not_repeated_silently(client):
    j = rec(client)
    ids = [p["id"] for p in j["presets"]]
    same = {p["id"]: p["same_as"] for p in j["presets"]}
    assert same[ids[0]] is None and any(v == ids[0] for v in same.values())


def test_base_metrics_match_predict_and_deltas_match_compare(client):
    j = rec(client, km_per_day=150)
    s = scen(km_per_day=150)
    p = client.post("/api/v1/predict", json={"scenario": s, "n_draws": 600}).json()
    assert j["base"]["months_p50"]["value"] == pytest.approx(p["replacement"]["months_p50"]["value"], abs=1e-6)
    assert j["base"]["cost_per_km_p50"]["value"] == pytest.approx(p["cost"]["cost_per_km_p50"]["value"], rel=1e-9)
    lo = {x["id"]: x for x in j["presets"]}["longest_life"]
    c = client.post("/api/v1/compare", json={"scenarios": [s, lo["charging"]["scenario"]], "n_draws": 600}).json()
    assert lo["charging"]["delta"]["months_p50"]["value"] == pytest.approx(c["deltas"][0]["months_p50"]["value"], abs=1e-6)


def test_levers_not_recommended_are_explained_with_measured_effect(client):
    nu = {n["lever"]: n for n in rec(client)["not_used"]}
    assert set(nu) == {"Charger power", "Minimum charge", "Km per day"}
    base_life = rec(client)["base"]["months_p50"]["value"]
    assert 0 <= nu["Charger power"]["effect_months"]["value"] < 0.05 * base_life and "almost no effect" in nu["Charger power"]["reason"]
    assert "depth of discharge" in nu["Minimum charge"]["reason"] and "extrapolating" in nu["Minimum charge"]["reason"]


def test_no_change_worth_making_is_said_honestly(client):
    j = rec(client, charge_start_hour=3.0, soc_max_pct=100.0)       # already charging late: little left to gain
    p = j["presets"][0]
    if not p["charging"]["changes"]:
        assert "No change is worth making" in p["charging"]["summary"]


def test_requests_are_validated(client):
    base = {"scenario": scen()}
    assert client.post("/api/v1/recommend", json={**base, "reserve_fraction": 0.9}).status_code == 422
    assert client.post("/api/v1/recommend", json={**base, "mode": "calibrated"}).status_code == 400
    assert client.post("/api/v1/recommend", json={**base, "extra": 1}).status_code == 422
    assert client.post("/api/v1/recommend", json={"scenario": {**scen(), "km_per_day": -5}}).status_code == 422


def test_latency_is_interactive(client):
    import time
    t = time.time()
    client.post("/api/v1/recommend", json={"scenario": scen(km_per_day=170), "n_draws": 2000})
    assert time.time() - t < 3.0


def test_reference_deltas_equal_the_gap_between_the_lives_shown(client):
    """A headline change must read as the difference of the two replacement times next to it (not a differently-estimated number)."""
    j = rec(client)
    base = j["base"]["months_p50"]["value"]
    for p in j["presets"]:
        for st in (p["charging"], p["with_confirmation"]):
            if st is None:
                continue
            assert st["delta"]["months_p50"]["value"] == pytest.approx(st["metrics"]["months_p50"]["value"] - base, abs=1e-6)
    d = j["presets"][0]["charging"]["delta"]
    assert d["p90_beyond_horizon"] is True and j["base"]["months_p90"] is None        # the default bus's 90th percentile is past 15 years
    assert "beyond the 15-year horizon" in j["presets"][0]["charging"]["summary"] and "likely between" not in j["presets"][0]["charging"]["summary"]
