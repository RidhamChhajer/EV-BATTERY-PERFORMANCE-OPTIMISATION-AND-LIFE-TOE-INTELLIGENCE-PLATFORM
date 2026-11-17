import numpy as np
import pytest

from engine.bus.scenario import Scenario
from engine.cell.uncertainty import load_models, make_draws
from engine.decide.compare import compare
from engine.decide.cost import cost_per_km, lifetime_km
from engine.decide.range import monthly_range, temperature_factor
from engine.decide.replacement import simulate_scenario
from engine.labels import Labelled, walk_numbers

M = load_models()
D = make_draws(800, M, seed=4)


def S(**kw):
    return Scenario.from_preset("12m", **kw)


def sim(s):
    return simulate_scenario(s, M, D)


def test_cost_scales_with_price():
    a = cost_per_km(sim(S(battery_cost_per_kwh_inr=10000))).cost_per_km_p50.value
    b = cost_per_km(sim(S(battery_cost_per_kwh_inr=20000))).cost_per_km_p50.value
    assert b == pytest.approx(2 * a, rel=1e-9)


def test_cost_inverse_to_lifetime():
    s = S(battery_cost_per_kwh_inr=10000)
    x = sim(s)
    r = cost_per_km(x)
    assert r.cost_per_km_p50.value == pytest.approx(s.pack_kwh * 10000 / np.percentile(lifetime_km(x), 50), rel=1e-6)
    assert r.cost_per_km_p10.value <= r.cost_per_km_p50.value <= r.cost_per_km_p90.value


def test_missing_price_documented_choice():
    r = cost_per_km(sim(S()))
    assert r.cost_per_km_p50 is None and any("price" in w for w in r.warnings)


def test_tornado_sorted_and_censoring_warning():
    r = cost_per_km(sim(S(battery_cost_per_kwh_inr=10000)), M, D)
    sw = [t.swing.value for t in r.tornado]
    assert sw == sorted(sw, reverse=True) and len(sw) == 3
    light = cost_per_km(sim(S(battery_cost_per_kwh_inr=10000, km_per_day=15, horizon_years=3)))
    assert any("never reach" in w for w in light.warnings)


def test_range_bounded_by_new_pack():
    r = monthly_range(sim(S()))
    new = r.new_pack_range_km.value
    for key, v in r.range_km_p50.items():
        assert len(v.value) == 12 and max(v.value) <= new + 1e-9
    assert r.range_km_p50["6"].value[0] < r.range_km_p50["0"].value[0]
    assert all(a <= b + 1e-9 for a, b in zip(r.range_km_p10["3"].value, r.range_km_p50["3"].value))


def test_temperature_modes():
    assert (temperature_factor([5, 15, 30], "none") == 1.0).all()
    f = temperature_factor([0, 25], "datasheet_example")
    assert f[0] == pytest.approx(0.90) and f[1] == pytest.approx(1.0)
    with pytest.raises(ValueError):
        temperature_factor([10], "bogus")


def test_range_cool_zone_datasheet_mode_has_winter_dip():
    r = monthly_range(sim(S(zone="cool")), mode="datasheet_example")
    v = r.range_km_p50["0"].value
    assert v[0] < v[5] and any("illustrative" in w for w in r.warnings)


def test_range_age_out_of_bounds():
    with pytest.raises(ValueError):
        monthly_range(sim(S()), ages_years=(99,))


def test_cap_90_vs_100_later_replacement_with_own_interval():
    r = compare([S(soc_max_pct=100), S(soc_max_pct=90)], n_draws=800, models=M)
    d = r.deltas[0]
    assert d.months_p50.value > 0 and d.prob_variant_later.value > 0.5
    assert d.months_p10.value <= d.months_p50.value <= d.months_p90.value
    assert any("calendar stress" in n for n in r.notes)


def test_identical_scenarios_zero_delta():
    r = compare([S(), S()], n_draws=500, models=M)
    d = r.deltas[0]
    assert d.months_p10.value == d.months_p50.value == d.months_p90.value == 0.0


def test_charge_rate_note_says_no_data_backed_effect():
    r = compare([S(charge_power_kw=60), S(charge_power_kw=150)], n_draws=500, models=M)
    assert any("No data-backed C-rate effect" in n for n in r.notes)


@pytest.mark.parametrize("n", [1, 5])
def test_compare_count_limits(n):
    with pytest.raises(ValueError):
        compare([S()] * n, n_draws=100, models=M)


def test_labels_everywhere():
    r = cost_per_km(sim(S(battery_cost_per_kwh_inr=10000)), M, D)
    nums = list(walk_numbers(r)) + list(walk_numbers(monthly_range(sim(S()))))
    assert nums and all(isinstance(n, Labelled) and n.validated_on_buses is False and n.evidence_level != "lab" for n in nums)
