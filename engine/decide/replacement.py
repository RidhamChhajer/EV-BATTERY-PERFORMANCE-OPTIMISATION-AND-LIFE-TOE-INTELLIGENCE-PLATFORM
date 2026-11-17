"""Replacement-window Monte Carlo (Layer 4): when does retention cross the replacement threshold?"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from pydantic import BaseModel

from engine.bus.scenario import Scenario
from engine.bus.translate import CellConditions, translate
from engine.cell.uncertainty import Draws, Models, extrapolation_reasons, load_models, make_draws, simulate_loss
from engine.labels import Labelled, L
from engine.reference.simulate import SCALAR_STD

DAYS_PER_MONTH = 365.25 / 12


@dataclass
class ScenarioSim:
    scenario: Scenario
    conditions: CellConditions
    months: np.ndarray            # (T,)
    retention: np.ndarray         # (D, T)
    cal_loss: np.ndarray
    cyc_loss: np.ndarray
    pack_penalty: np.ndarray      # (D,)
    cross_months: np.ndarray      # (D,) time to threshold in months, inf if not reached within horizon
    extrapolated: bool
    extrapolation_reasons: list[str]
    engine: str = "lab"


def first_crossing(retention: np.ndarray, months: np.ndarray, threshold: float) -> np.ndarray:
    """First time retention <= threshold (linear interpolation between grid points); inf if never."""
    below = retention <= threshold
    any_below = below.any(axis=1)
    idx = below.argmax(axis=1)
    out = np.full(retention.shape[0], np.inf)
    rows = np.where(any_below)[0]
    for r in rows:
        i = idx[r]
        if i == 0:
            out[r] = months[0]
        else:
            r0, r1 = retention[r, i - 1], retention[r, i]
            frac = (r0 - threshold) / (r0 - r1) if r0 != r1 else 0.0
            out[r] = months[i - 1] + frac * (months[i] - months[i - 1])
    return out


def reference_conditions(s: Scenario):
    """Conditions as the reference engine sees them: what the NREL models are driven by, not our fitted stress-equivalents."""
    from engine.bus.translate import translate
    c = translate(s)
    temps = np.array(c.monthly_cell_temp_c.value)
    warns = [w for w in c.warnings if not w.startswith("Depth-of-discharge effects")]
    warns.insert(0, "Depth of discharge and C-rate are modelled by the NREL models, but both were fitted on 80-100 % depth cycles at charge rates up to 0.65-1 C.")
    return c.model_copy(update=dict(
        calendar_equivalent_soc_pct=L(c.mean_soc_pct.value, "%", "derived", "time-averaged state of charge over the day; the NREL models work from average state of charge"),
        effective_temp_c=L(float(temps.mean()), "degC", "derived", "mean of the monthly air temperatures plus the assumed heat rise"),
        c_rate_eff=L(c.c_rate_eff.value, "C", "derived", "mean of charge and discharge C-rate (the NREL models use average throughput rate)"),
        warnings=warns))


def _simulate_reference(s: Scenario) -> ScenarioSim:
    from engine.reference.simulate import reference_curves
    rc = reference_curves(s)
    c = reference_conditions(s)
    loss = np.clip(rc.cal_loss + rc.cyc_loss, 0.0, 1.0)
    ret = 1.0 - loss
    return ScenarioSim(s, c, rc.months, ret, rc.cal_loss, rc.cyc_loss, rc.pack_penalty, first_crossing(ret, rc.months, s.threshold),
                       bool(rc.reasons), list(rc.reasons), "reference")


def simulate_scenario(s: Scenario, models: Models | None = None, draws: Draws | None = None,
                      n_draws: int = 2000, seed: int = 0) -> ScenarioSim:
    models = models or load_models()
    if models.engine == "reference":
        return _simulate_reference(s)
    draws = draws or make_draws(n_draws, models, seed)
    c = translate(s)
    months = np.arange(0, s.horizon_years * 12 + 1, dtype=float)
    t_days = months * DAYS_PER_MONTH
    efc = c.efc_per_day.value * s.operating_days_per_year * t_days / 365.25
    sim = simulate_loss(t_days, efc, c.effective_temp_c.value, c.calendar_equivalent_soc_pct.value, c.c_rate_eff.value, models, draws)
    pen = s.pack_penalty_min + (s.pack_penalty_max - s.pack_penalty_min) * draws.u_pen
    loss = np.clip(sim["total"] * (1.0 + pen)[:, None], 0.0, 1.0)
    ret = 1.0 - loss
    cross = first_crossing(ret, months, s.threshold)
    reasons = extrapolation_reasons(float(efc.max()), c.effective_temp_c.value, c.calendar_equivalent_soc_pct.value, c.c_rate_eff.value, models)
    return ScenarioSim(s, c, months, ret, sim["calendar"], sim["cycle"], pen, cross, sim["extrapolated"], reasons)


class ReplacementResult(BaseModel):
    months_p10: Labelled | None
    months_p50: Labelled | None
    months_p90: Labelled | None
    probability_by_month: Labelled
    probability_within_horizon: Labelled
    calendar_share_of_loss: Labelled
    retention_p10: Labelled
    retention_p50: Labelled
    retention_p90: Labelled
    months: list[float]
    threshold: Labelled
    extrapolated: bool
    extrapolation_reasons: list[str]
    warnings: list[str]
    mode: str = "prior"


def life_percentiles(sim: ScenarioSim, qs=(10, 50, 90)) -> list[float]:
    """Months until retention reaches the threshold at each percentile; inf when beyond the horizon.

    Reference engine: crossing of the percentile retention curves (the two models make row-wise crossing times bimodal, and
    one of the modes is usually beyond the horizon). Lab engine: percentiles of the per-draw crossing times."""
    h = float(sim.months[-1])
    if sim.engine == "reference":
        return [float(v) for v in first_crossing(np.percentile(sim.retention, list(qs), axis=0), sim.months, sim.scenario.threshold)]
    capped = np.minimum(sim.cross_months, h * 10)           # inf-safe: a percentile that lands on a censored draw is beyond the horizon
    return [float(v) if v <= h else float("inf") for v in np.percentile(capped, list(qs))]


def p90_beyond_horizon(base: ScenarioSim, sim: ScenarioSim) -> bool:
    """True when the 90th-percentile life of either scenario lies past the horizon, so the change at that percentile cannot be measured."""
    return any(not np.isfinite(life_percentiles(x, (90,))[0]) for x in (base, sim)) if sim.engine == "reference" else False


def life_delta(base: ScenarioSim, sim: ScenarioSim, qs=(10, 50, 90)) -> list[float]:
    """Change in life (months) at each percentile, variant minus base, both counted at the shorter horizon when beyond it.

    Reference engine: difference of the same percentile crossings that the headline months show, so a change reads the same as the two
    lives it is the gap between. Lab engine: percentiles of the per-draw paired differences."""
    h = float(min(base.months[-1], sim.months[-1]))
    if sim.engine == "reference" and base.engine == "reference":
        a, b = (np.minimum(life_percentiles(x, qs), h) for x in (base, sim))
        return [float(v) for v in b - a]
    d = np.minimum(sim.cross_months, h) - np.minimum(base.cross_months, h)
    return [float(v) for v in np.percentile(d, list(qs))]


def _pct(cross: np.ndarray, q: float, horizon: float):
    v = np.percentile(cross, q)
    return None if not np.isfinite(v) or v > horizon else float(v)


def replacement_window(s: Scenario, n_draws: int = 2000, seed: int = 0, models: Models | None = None,
                       draws: Draws | None = None) -> ReplacementResult:
    sim = simulate_scenario(s, models, draws, n_draws, seed)
    horizon = float(sim.months[-1])
    cross = sim.cross_months
    prob = np.array([(cross <= m).mean() for m in sim.months])
    hit = np.isfinite(cross)
    cal_share = 0.0
    if hit.any():
        idxs = np.minimum(np.searchsorted(sim.months, cross[hit], side="left"), len(sim.months) - 1)
        rows = np.where(hit)[0]
        c, y = sim.cal_loss[rows, idxs], sim.cyc_loss[rows, idxs]
        cal_share = float(np.mean(c / np.maximum(c + y, 1e-12)))
    ret = np.percentile(sim.retention, [10, 50, 90], axis=0)
    ev = "derived"
    warns = list(sim.conditions.warnings)
    models = models or load_models()
    reference = models.engine == "reference"
    if reference:
        if sim.extrapolated:
            warns.append("Outside the conditions the NREL cells were tested at (see extrapolation_reasons): treat the result as qualitative.")
        warns.append("The range is the spread between two published LFP models (250 Ah prismatic, 3 Ah cylindrical), cell-to-cell scatter "
                     f"(degradation scalar std {SCALAR_STD:g}, BLAST-Lite's convention) and an assumed pack penalty of "
                     f"{s.pack_penalty_min * 100:.0f}-{s.pack_penalty_max * 100:.0f} % earlier end of life. It is not a statistical confidence interval.")
    else:
        if sim.extrapolated:
            warns.append("Inputs are outside the range of the training data (see extrapolation_reasons): bands were widened by an assumed factor.")
        cmin = models.cyc.valid_c_rate[0]
        if sim.conditions.c_rate_eff.value < cmin:
            warns.append(f"Direction of likely bias: the cycling data are high-rate ({cmin:.1f}+ C) and the model has no C-rate effect, "
                         f"so cycling loss for this {sim.conditions.c_rate_eff.value:.2f} C bus is probably OVERSTATED and replacement timing too early.")
    if not hit.any():
        warns.append(f"Retention does not reach the threshold within {s.horizon_years} years in any simulated {'run' if reference else 'draw'}.")
    elif hit.mean() < 0.9:
        warns.append(f"Only {hit.mean() * 100:.0f}% of {'runs' if reference else 'draws'} reach the threshold within {s.horizon_years} years; upper percentiles are beyond the horizon.")
    lp = dict(zip((10, 50, 90), life_percentiles(sim)))
    mk = lambda q: (None if not np.isfinite(lp[q]) else L(lp[q], "months", ev))
    return ReplacementResult(
        months_p10=mk(10), months_p50=mk(50), months_p90=mk(90),
        probability_by_month=L(prob.tolist(), "probability", ev, "P(replacement threshold reached by month m)"),
        probability_within_horizon=L(float(hit.mean()), "probability", ev),
        calendar_share_of_loss=L(cal_share, "fraction", ev, "share of capacity loss from calendar ageing at crossing (rest is cycling)"),
        retention_p10=L(ret[0].tolist(), "fraction", ev), retention_p50=L(ret[1].tolist(), "fraction", ev),
        retention_p90=L(ret[2].tolist(), "fraction", ev), months=sim.months.tolist(),
        threshold=L(s.threshold, "fraction", "assumption", "replace when retention falls to this"),
        extrapolated=sim.extrapolated, extrapolation_reasons=sim.extrapolation_reasons, warnings=warns)
