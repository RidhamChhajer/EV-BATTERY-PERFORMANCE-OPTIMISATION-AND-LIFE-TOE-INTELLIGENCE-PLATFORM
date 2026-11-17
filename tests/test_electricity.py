"""Electricity cost per km: published tariff, time-of-day shift, additive total. Tariff figures are the ones read from MERC's order (engine/bus/tariffs.json)."""
import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from engine.bus.scenario import Scenario
from engine.decide.electricity import TARIFFS, electricity_cost, tod_change

P = dict(battery_cost_per_kwh_inr=12000)


def test_tariff_figures_are_the_ones_in_the_order():
    ht, lt = TARIFFS["msedcl_ht_ix"], TARIFFS["msedcl_lt_viii"]
    assert (ht["energy_inr_per_unit"], ht["wheeling_inr_per_unit"]) == (8.92, 0.81)
    assert (lt["energy_inr_per_unit"], lt["wheeling_inr_per_unit"]) == (7.73, 1.52)
    assert ht["fixed_inr_per_kva_month"] == lt["fixed_inr_per_kva_month"] == 0
    for t in (ht, lt):
        assert "Case No. 75 of 2025" in t["source"] and t["url"].startswith("https://")


@pytest.mark.parametrize("start,hours,expect", [(22, 2.5, 0.16), (0, 3, 0.0), (23, 3, 2 / 30), (10, 3, -0.2), (16, 2, 0.0), (17, 1, 0.2), (3, 0, 0.0)])
def test_tod_change_by_charge_window(start, hours, expect):
    assert tod_change(start, hours) == pytest.approx(expect)


def test_charge_past_midnight_and_long_charge():
    assert tod_change(23.5, 1.0) == pytest.approx(0.1)  # half an hour of peak, half at 0 %
    assert -0.21 < tod_change(8, 24) < 0.21  # a full day averages every slot


def test_off_means_no_electricity():
    s = Scenario.from_preset("12m")
    assert s.electricity_tariff == "none" and electricity_cost(s, 2.5) is None


def test_cost_is_energy_over_efficiency_times_price():
    s = Scenario.from_preset("12m", electricity_tariff="msedcl_ht_ix", charge_start_hour=0.0)  # 0 % shift
    r = electricity_cost(s, 2.5)
    assert r.price_inr_per_kwh.value == pytest.approx(8.92 + 0.81)
    assert r.cost_per_km.value == pytest.approx(s.kwh_per_km / 0.92 * 9.73)
    assert r.tod_change_pct.value == 0
    s2 = s.model_copy(update=dict(charger_efficiency=0.85))
    assert electricity_cost(s2, 2.5).cost_per_km.value > r.cost_per_km.value


def test_evening_start_costs_more_than_midnight_start():
    late = Scenario.from_preset("12m", electricity_tariff="msedcl_ht_ix", charge_start_hour=22.0)
    mid = late.model_copy(update=dict(charge_start_hour=0.0))
    assert electricity_cost(late, 2.5).cost_per_km.value > electricity_cost(mid, 2.5).cost_per_km.value


def test_custom_price_is_flat_and_needs_a_value():
    s = Scenario.from_preset("12m", electricity_tariff="custom", electricity_custom_inr_per_kwh=8.0, charge_start_hour=22.0)
    r = electricity_cost(s, 2.5)
    assert r.price_inr_per_kwh.value == 8.0 and r.tod_change_pct.value == 0
    assert electricity_cost(s.model_copy(update=dict(electricity_custom_inr_per_kwh=None)), 2.5) is None


def test_scenario_bounds():
    with pytest.raises(ValueError):
        Scenario.from_preset("12m", charger_efficiency=0.5)
    with pytest.raises(ValueError):
        Scenario.from_preset("12m", electricity_tariff="bogus")


def test_api_total_is_battery_plus_electricity_and_battery_is_unchanged():
    with TestClient(create_app()) as c:
        sc = Scenario.from_preset("12m", **P).model_dump()
        base = c.post("/api/v1/predict", json={"scenario": sc, "n_draws": 200}).json()
        withe = c.post("/api/v1/predict", json={"scenario": {**sc, "electricity_tariff": "msedcl_ht_ix"}, "n_draws": 200}).json()
    assert base["cost"]["electricity"] is None and base["cost"]["total_cost_per_km_p50"] is None
    for k in ("cost_per_km_p10", "cost_per_km_p50", "cost_per_km_p90", "lifetime_km_p50"):
        assert withe["cost"][k]["value"] == base["cost"][k]["value"]  # the battery side does not move
    e = withe["cost"]["electricity"]["cost_per_km"]["value"]
    for q in ("p10", "p50", "p90"):
        assert withe["cost"][f"total_cost_per_km_{q}"]["value"] == pytest.approx(withe["cost"][f"cost_per_km_{q}"]["value"] + e)
    assert withe["cost"]["electricity"]["cost_per_km"]["evidence_level"] == "derived"
    assert withe["cost"]["electricity"]["price_inr_per_kwh"]["evidence_level"] == "assumption"
    assert withe["cost"]["electricity"]["cost_per_km"]["validated_on_buses"] is False


def test_electricity_without_a_battery_price():
    with TestClient(create_app()) as c:
        sc = {**Scenario.from_preset("12m").model_dump(), "electricity_tariff": "msedcl_lt_viii"}
        r = c.post("/api/v1/predict", json={"scenario": sc, "n_draws": 200}).json()
    assert r["cost"]["cost_per_km_p50"] is None and r["cost"]["total_cost_per_km_p50"] is None
    assert r["cost"]["electricity"]["cost_per_km"]["value"] > 0


def test_electricity_does_not_change_ageing():
    with TestClient(create_app()) as c:
        sc = Scenario.from_preset("12m", **P).model_dump()
        a = c.post("/api/v1/predict", json={"scenario": sc, "n_draws": 200}).json()
        b = c.post("/api/v1/predict", json={"scenario": {**sc, "electricity_tariff": "msedcl_ht_ix", "charger_efficiency": 0.8}, "n_draws": 200}).json()
    assert a["replacement"]["months_p50"] == b["replacement"]["months_p50"]
