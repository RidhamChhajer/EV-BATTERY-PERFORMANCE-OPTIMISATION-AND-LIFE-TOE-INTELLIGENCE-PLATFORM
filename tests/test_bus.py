import numpy as np
import pytest
from pydantic import ValidationError

from engine.bus.scenario import Scenario
from engine.bus.translate import sample_pack_penalty, translate
from engine.labels import Labelled, walk_numbers


def test_hand_calculation():
    c = translate(Scenario.from_preset("12m"))
    # 200 km x 1.2 kWh/km = 240 kWh/day; EFC/day = 240/350
    assert c.energy_per_day_kwh.value == pytest.approx(240.0)
    assert c.efc_per_day.value == pytest.approx(240 / 350, rel=1e-9)
    assert c.efc_per_year.value == pytest.approx(240 / 350 * 340, rel=1e-9)
    assert c.usable_kwh.value == pytest.approx(315.0)
    # charge: 120 kW, energy back = 350*(100-(100-100*240/350))/100 = 240 kWh -> 2 h; idle 22:00+2h -> 05:00 = 5 h
    assert c.charge_hours.value == pytest.approx(2.0)
    assert c.idle_hours_at_soc_max.value == pytest.approx(5.0)


def test_doubling_distance_doubles_efc():
    a = translate(Scenario.from_preset("12m", km_per_day=100)).efc_per_year.value
    b = translate(Scenario.from_preset("12m", km_per_day=200)).efc_per_year.value
    assert b == pytest.approx(2 * a)


def test_hotter_zone_hotter_cells():
    hot = translate(Scenario.from_preset("12m", zone="hot_dry")).effective_temp_c.value
    cool = translate(Scenario.from_preset("12m", zone="cool")).effective_temp_c.value
    assert hot > cool + 5


def test_soc_cap_lowers_time_at_high_soc():
    full = translate(Scenario.from_preset("12m", soc_max_pct=100))
    capped = translate(Scenario.from_preset("12m", soc_max_pct=90))
    assert capped.mean_soc_pct.value < full.mean_soc_pct.value


@pytest.mark.parametrize("bad", [dict(km_per_day=-5), dict(soc_max_pct=120), dict(zone="mars"), dict(extra_field=1),
                                 dict(soc_min_pct=50, soc_max_pct=55), dict(pack_penalty_min=0.2, pack_penalty_max=0.1)])
def test_invalid_scenarios(bad):
    with pytest.raises((ValidationError, ValueError, TypeError)):
        Scenario.from_preset("12m", **bad)


def test_impossible_duty_warns_without_crash():
    c = translate(Scenario.from_preset("12m", km_per_day=450))
    assert any("exceeds the usable pack energy" in w for w in c.warnings)


def test_late_charge_warns():
    c = translate(Scenario.from_preset("12m", charge_start_hour=3.0, departure_hour=5.0, charge_power_kw=50))
    assert any("not finished before departure" in w for w in c.warnings)


def test_every_number_labelled():
    c = translate(Scenario.from_preset("9m"))
    nums = list(walk_numbers(c))
    assert len(nums) == 13 and all(isinstance(n, Labelled) and n.validated_on_buses is False for n in nums)
    assert {n.evidence_level for n in nums} <= {"derived", "assumption"}
    assert all(n.evidence_level != "lab" for n in nums)   # nothing about a bus can be "lab"


def test_pack_penalty_bounds_and_seed():
    s = Scenario.from_preset("12m")
    a = sample_pack_penalty(s, 1000, seed=3)
    assert a.min() >= 0.20 and a.max() <= 0.30            # NREL: pack life is 20-30 % shorter than cell life
    assert np.array_equal(a, sample_pack_penalty(s, 1000, seed=3))


def test_archetypes_have_sources():
    import json
    for arch in json.load(open("engine/bus/archetypes.json"))["archetypes"].values():
        for k, f in arch.items():
            if isinstance(f, dict):
                assert f["source"] and f["evidence_level"] == "assumption"


def test_bus_c_rate_flagged_as_extrapolation():
    from engine.cell.uncertainty import extrapolation_reasons, load_models
    s = Scenario.from_preset("12m")
    c = translate(s)
    r = extrapolation_reasons(c.efc_per_year.value * 10, c.effective_temp_c.value, c.mean_soc_pct.value, c.c_rate_eff.value, load_models())
    assert any("C-rate" in x for x in r)


def test_equivalent_soc_keeps_high_soc_stress():
    full = translate(Scenario.from_preset("12m", soc_max_pct=100))
    capped = translate(Scenario.from_preset("12m", soc_max_pct=90))
    assert full.calendar_equivalent_soc_pct.value > capped.calendar_equivalent_soc_pct.value
    # a 100 % top-up with long idle must look more stressful than its mean SOC (about 73 %)
    assert full.calendar_equivalent_soc_pct.value > full.mean_soc_pct.value
