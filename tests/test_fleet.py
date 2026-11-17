"""Fleet forecast: age conditioning, the two-model mixture, Poisson-binomial counts, spend, and the reduction to the single-bus engine."""
import itertools
from datetime import date

import numpy as np
import pytest
from scipy.stats import binom

from engine.bus.scenario import Scenario
from engine.cell.uncertainty import load_models
from engine.decide import fleet as F
from engine.decide.replacement import replacement_window
from tests.helpers import find_bare_numbers

INF = float("inf")


@pytest.fixture(scope="module")
def models():
    return load_models("engine/artifacts", engine="reference")


def base(**kw):
    return Scenario.from_preset("12m", battery_cost_per_kwh_inr=12000, **kw)


# ------------------------------------------------------------------ periods and ages
def test_period_edges_follow_the_indian_financial_year():
    e, lab = F.period_edges(date(2026, 11, 11), 3)
    assert e[:4] == [0, 5, 17, 29] and lab[0] == "FY2026-27" and lab[1] == "FY2027-28"      # Nov..Mar is 5 months
    e, lab = F.period_edges(date(2026, 4, 2), 2)
    assert e[:3] == [0, 12, 24] and lab[0] == "FY2026-27"                                    # April starts a whole year
    e, lab = F.period_edges(date(2027, 1, 20), 2)
    assert e[1] == 3 and lab[0] == "FY2026-27"                                               # Jan..Mar of the year that began the April before
    assert e[-1] >= 24 and lab[0].startswith("FY") and len(lab) == len(e) - 1


def test_age_months_and_future_in_service_rejected():
    assert F.age_months("2023-07", date(2026, 11, 11)) == 40
    assert F.age_months(None, date(2026, 11, 11)) is None
    with pytest.raises(F.FleetInputError):
        F.age_months("2027-01", date(2026, 11, 11))


# ------------------------------------------------------------------ conditioning, by hand
A = {"a": np.array([10.0, 20.0, 30.0, 40.0]), "b": np.array([15.0, 25.0, INF, INF])}


def test_age_conditioning_matches_the_hand_formula():
    q, flags, _ = F.period_probs(A, 12, [0, 12, 24])
    # model a: F(12)=1/4, F(24)=2/4, F(36)=3/4, survivors 3/4 -> (1/3, 1/3); model b: F(12)=0, F(24)=1/4, F(36)=2/4 -> (1/4, 1/4)
    assert np.allclose(q, [[1 / 3, 1 / 3], [0.25, 0.25]]) and flags == []


def test_new_bus_is_the_unconditional_cdf():
    q, _, _ = F.period_probs(A, 0, [0, 12, 24])
    assert np.allclose(q, [[0.25, 0.25], [0.0, 0.25]])


def test_one_model_with_nothing_left_borrows_the_other():
    q, flags, _ = F.period_probs(A, 45, [0, 12])          # all of model a is below 45, model b has 2 of 4 below
    assert flags.count("one_model_only") == 1 and np.allclose(q[0], q[1])


def test_past_every_run_is_due_at_once_and_flagged():
    both = {"a": np.array([10.0, 20.0]), "b": np.array([5.0, 6.0])}
    q, flags, past = F.period_probs(both, 50, [0, 12, 24])
    assert "past_all_runs" in flags and "past_median_life" in flags and np.allclose(q[:, 0], 1.0) and np.allclose(q[:, 1:], 0.0) and past == 1.0


def test_past_median_life_flag_only_after_half_the_runs():
    assert "past_median_life" not in F.period_probs(A, 12, [0, 12])[1]
    assert "past_median_life" in F.period_probs(A, 35, [0, 12])[1]


# ------------------------------------------------------------------ the counting maths
def test_poisson_binomial_equals_enumeration():
    cells = [(2, 0.3), (1, 0.6), (3, 0.1)]
    pmf = F.poisson_binomial(cells)
    bits = [(0.3,)] * 2 + [(0.6,)] + [(0.1,)] * 3
    ref = np.zeros(7)
    for combo in itertools.product([0, 1], repeat=6):
        p = np.prod([q[0] if c else 1 - q[0] for q, c in zip(bits, combo)])
        ref[sum(combo)] += p
    assert np.allclose(pmf, ref) and abs(pmf.sum() - 1) < 1e-12


def test_one_cell_is_the_plain_binomial_and_quantiles_agree_with_the_front_end_rule():
    cb = {"a": np.array([30.0, 30.0, 30.0, 30.0]), "b": np.array([30.0, 30.0, 30.0, 30.0])}          # both models identical
    q, _, _ = F.period_probs(cb, 0, [0, 12, 36])
    cell = F.Cell("c", 0, 40, 1.0, q)
    d = F._mix([F._period_dist([cell], m, 1, False) for m in range(2)])
    qq = float(q[0, 1])
    assert np.allclose(d.counts, binom.pmf(np.arange(41), 40, qq))
    for p in (0.1, 0.5, 0.9):
        assert F.quantile(np.arange(len(d.counts)), d.counts, p) == binom.ppf(p, 40, qq)


def test_shared_model_risk_widens_the_fleet_band():
    """Models disagree about timing. Treating all runs as one pool makes the band narrower than the mixture, which is the honest one."""
    cb = {"early": np.full(25, 10.0), "late": np.full(25, 200.0)}
    q, _, _ = F.period_probs(cb, 0, [0, 12])
    cell = F.Cell("c", 0, 100, 1.0, q)
    d = F._mix([F._period_dist([cell], m, 0, False) for m in range(2)])
    lo, hi = (F.quantile(np.arange(len(d.counts)), d.counts, p) for p in (0.1, 0.9))
    pooled = binom(100, float(q[:, 0].mean()))
    assert (lo, hi) == (0, 100) and pooled.ppf(0.9) - pooled.ppf(0.1) < 15          # mixture: all or nothing; pooled: about 50 +/- 6


def test_spend_convolution_is_exact_over_two_prices():
    cells = [F.Cell("a", 0, 2, 10.0, np.array([[0.3]])), F.Cell("b", 0, 2, 25.0, np.array([[0.5]]))]
    d = F._period_dist(cells, 0, 0, True)
    ref: dict[float, float] = {}
    for i, j in itertools.product(range(3), range(3)):
        ref[i * 10.0 + j * 25.0] = ref.get(i * 10.0 + j * 25.0, 0) + binom.pmf(i, 2, 0.3) * binom.pmf(j, 2, 0.5)
    got = dict(zip(d.spend_v.tolist(), d.spend_p.tolist()))
    assert set(got) == set(ref) and all(abs(got[k] - ref[k]) < 1e-12 for k in ref)


# ------------------------------------------------------------------ cohorts
def test_cohort_quantiles_shorten_with_age_and_none_beyond_horizon():
    cb = {"a": np.array([100.0, 150.0, 200.0, INF]), "b": np.array([120.0, 160.0, INF, INF])}
    new = F._cohort_quantiles(cb, 0)
    old = F._cohort_quantiles(cb, 110)
    assert new[1] is not None and old[1] is not None and old[1] < new[1]
    assert new[2] is None                                              # 90th percentile sits in the part that never crosses


# ------------------------------------------------------------------ with the real engine
def test_a_new_one_class_fleet_reproduces_the_single_bus_numbers(models):
    s = base().model_copy(update={"horizon_years": 20})
    cb = F.class_crossings(s, models)
    assert {len(v) for v in cb.values()} == {25}
    prob = np.array(replacement_window(s, models=models).probability_by_month.value)
    edges = [0, 84, 96, 108, 120, 132, 144, 156]
    q, flags, _ = F.period_probs(cb, 0, edges)
    assert flags == [] and np.allclose(q.mean(axis=0), np.diff(prob[edges]), atol=1e-12)
    r = F.fleet_forecast({"c": base()}, [F.BusSpec(f"B{i}", "c", 0) for i in range(100)], models, date(2026, 4, 1), 14)
    e = r.period_edges_months.value
    assert np.allclose(r.buses_expected.value, 100 * np.diff(prob[[int(x) for x in e]]), atol=1e-9)


def test_older_fleet_replaces_sooner_than_a_new_one(models):
    new = F.fleet_forecast({"c": base()}, [F.BusSpec(f"B{i}", "c", 0) for i in range(100)], models, date(2026, 11, 11), 10)
    old = F.fleet_forecast({"c": base()}, [F.BusSpec(f"B{i}", "c", 72) for i in range(100)], models, date(2026, 11, 11), 10)
    cut = lambda r: sum(r.buses_expected.value[:6])
    assert cut(old) > cut(new) + 10 and old.beyond_forecast_buses.value < new.beyond_forecast_buses.value


def test_result_shape_money_labels_and_no_bare_numbers(models):
    c2 = base(km_per_day=160.0, charge_start_hour=1.0)
    buses = [F.BusSpec(f"B{i}", "a" if i % 2 else "b", (i * 5) % 70 if i % 7 else None, 6.0e6 if i % 11 == 0 else None) for i in range(60)]
    r = F.fleet_forecast({"a": base(), "b": c2}, buses, models, date(2026, 11, 11), 8)
    assert find_bare_numbers(r.model_dump(mode="json")) == []
    n = len(r.period_labels)
    assert len(r.buses_expected.value) == len(r.buses_p10.value) == len(r.spend_p90.value) == n and len(r.period_edges_months.value) == n + 1
    assert all(lo <= e + 1e-9 <= hi + 1 for lo, e, hi in zip(r.buses_p10.value, r.buses_expected.value, r.buses_p90.value))
    assert all(lo <= hi for lo, hi in zip(r.spend_p10.value, r.spend_p90.value))
    assert abs(sum(r.buses_expected.value) + r.beyond_forecast_buses.value - 60) < 1e-6                  # every bus is somewhere
    assert sum(c.n_buses.value for c in r.cohorts) == 60 and sum(c.n_buses.value for c in r.classes) == 60
    assert any("age_unknown" in c.flags for c in r.cohorts)
    assert r.model_weights.evidence_level == "assumption"


def test_segment_totals_equal_the_fleet_total(models):
    """Splitting the same fleet by class and forecasting each part gives the same expected counts as forecasting it whole."""
    cl = {"a": base(), "b": base(km_per_day=150.0)}
    bs = [F.BusSpec(f"B{i}", "a" if i % 3 else "b", (i * 4) % 60) for i in range(90)]
    whole = F.fleet_forecast(cl, bs, models, date(2026, 11, 11), 10)
    parts = [F.fleet_forecast(cl, [b for b in bs if b.class_id == k], models, date(2026, 11, 11), 10) for k in ("a", "b")]
    assert np.allclose(whole.buses_expected.value, np.sum([p.buses_expected.value for p in parts], axis=0), atol=1e-9)
    assert np.allclose(whole.spend_expected.value, np.sum([p.spend_expected.value for p in parts], axis=0), rtol=1e-9)


def test_weighted_cost_is_km_weighted_and_none_when_a_class_has_no_price(models):
    cl = {"a": base(), "b": base(km_per_day=150.0)}
    bs = [F.BusSpec("x1", "a", 10)] * 1 + [F.BusSpec("x2", "b", 10)] * 1
    r = F.fleet_forecast(cl, bs, models, date(2026, 11, 11), 10)
    ca = {c.id: c for c in r.classes}
    w = {k: cl[k].km_per_day * cl[k].operating_days_per_year for k in cl}
    expect = (w["a"] * ca["a"].battery_cost_per_km_p50.value + w["b"] * ca["b"].battery_cost_per_km_p50.value) / (w["a"] + w["b"])
    assert r.cost.battery_cost_per_km_p50.value == pytest.approx(expect) and r.cost.electricity_cost_per_km is None
    nopr = {"a": base(), "b": Scenario.from_preset("12m", km_per_day=150.0)}
    r2 = F.fleet_forecast(nopr, bs, models, date(2026, 11, 11), 10)
    assert r2.cost.battery_cost_per_km_p50 is None and r2.spend_expected is None and any("pack price" in w for w in r2.warnings)


def test_electricity_in_the_weighted_total(models):
    s = base(electricity_tariff="msedcl_ht_ix")
    r = F.fleet_forecast({"a": s}, [F.BusSpec("x", "a", 5)], models, date(2026, 11, 11), 10)
    c = r.classes[0]
    assert r.cost.total_cost_per_km_p50.value == pytest.approx(c.battery_cost_per_km_p50.value + c.electricity_cost_per_km.value)


def test_unfittable_inputs_are_refused_with_a_reason(models):
    with pytest.raises(F.FleetInputError, match="Unknown duty class"):
        F.fleet_forecast({"a": base()}, [F.BusSpec("x", "zzz", 3)], models, date(2026, 11, 11))
    with pytest.raises(F.FleetInputError, match="20-year horizon"):
        F.fleet_forecast({"a": base()}, [F.BusSpec("x", "a", 150)], models, date(2026, 11, 11), 10)
    with pytest.raises(F.FleetInputError, match="no buses"):
        F.fleet_forecast({"a": base()}, [], models, date(2026, 11, 11))
    with pytest.raises(F.FleetInputError, match="different pack prices"):
        F.fleet_forecast({"a": base()}, [F.BusSpec(f"x{i}", "a", 5, 5.0e6 + i * 5.0e5) for i in range(9)], models, date(2026, 11, 11))


def test_five_thousand_buses_is_fast(models):
    import time
    bs = [F.BusSpec(f"B{i}", "a", (i * 3) % 100) for i in range(5000)]
    t = time.perf_counter()
    r = F.fleet_forecast({"a": base()}, bs, models, date(2026, 11, 11), 10)
    assert time.perf_counter() - t < 3.0 and abs(sum(r.buses_expected.value) + r.beyond_forecast_buses.value - 5000) < 1e-6


def test_engine_agrees_with_an_independent_monte_carlo(models):
    """Draw a model for the whole fleet, then a run for each bus among the runs still alive at its age; compare counts per period."""
    cl = {"a": base(), "b": base(km_per_day=150.0, heat_rise_c=6.0)}
    rng = np.random.default_rng(1)
    buses = [F.BusSpec(f"B{i}", "a" if i % 3 else "b", int(rng.integers(0, 90))) for i in range(40)]
    r = F.fleet_forecast(cl, buses, models, date(2026, 11, 11), 10)
    edges = [int(x) for x in r.period_edges_months.value]
    cross = {k: F.class_crossings(cl[k].model_copy(update={"horizon_years": 20}), models) for k in cl}
    mk = sorted(cross["a"])
    sims, P = 6000, len(edges) - 1
    out = np.zeros((sims, P))
    for s in range(sims):
        m = mk[rng.integers(2)]
        for b in buses:
            alive = cross[b.class_id][m][cross[b.class_id][m] > b.age_months]
            if not len(alive):
                other = cross[b.class_id][mk[1 - mk.index(m)]]
                alive = other[other > b.age_months]
            if len(alive):
                t = alive[rng.integers(len(alive))] - b.age_months
                p = np.searchsorted(edges, t, side="left") - 1
                if np.isfinite(t) and 0 <= p < P:
                    out[s, p] += 1
    exp = np.array(r.buses_expected.value)
    assert np.allclose(out.mean(axis=0), exp, atol=0.25) and exp.max() > 2
    for p in range(P):
        if exp[p] > 1:
            assert abs(np.percentile(out[:, p], 90) - r.buses_p90.value[p]) <= 1 and abs(np.percentile(out[:, p], 10) - r.buses_p10.value[p]) <= 1
