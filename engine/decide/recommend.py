"""Usage presets (Layer 4): search the levers the model really responds to, keep what the bus can run, explain in plain words.

Nothing here is a fixed answer. For the client's own Bus A the engine tries combinations of levers with the same ageing engine
as /predict, drops any that fail the route-feasibility rule, and picks the best per goal. Results move with the inputs.

Levers searched (measured with the engine, see docs/phase-checkpoints.md):
  charge cap (soc_max_pct)       real effect via calendar stress at high SOC; costs usable range
  charge start time              real effect via less time idle at the top of the SOC window; free
  cell heat rise (cooling)       biggest effect; the client must confirm it is achievable          -> "needs confirmation"
  energy use per km (efficiency) real effect; the client must confirm it is achievable             -> "needs confirmation"
Held fixed on purpose:
  minimum charge (soc_min_pct)   both NREL cells were cycled at 80-100 % depth of discharge, so a shallower window is extrapolated and not trusted
  charger power                  the models show almost no charge-speed effect; effect is measured and reported, not recommended
  km per day                     a service level decided by the operator, not a battery-usage choice
"""
from __future__ import annotations

import math

import numpy as np
from pydantic import BaseModel

from engine.bus.scenario import Scenario
from engine.bus.translate import translate
from engine.cell.uncertainty import Models, make_draws
from engine.decide.cost import lifetime_km
from engine.decide.replacement import ScenarioSim, life_delta, life_percentiles, p90_beyond_horizon, simulate_scenario
from engine.labels import Labelled, L

CAP_STEPS = (95.0, 90.0, 85.0, 80.0, 75.0, 70.0)
FAST_DRAWS = 400
BUFFER_H = 0.5                 # charging must end this long before departure
MIN_GAIN_MONTHS = 0.5          # below this a change is not worth recommending
COOL_STEP_C, COOL_STEP_HOT_C = 2.0, 3.0
EFFICIENCY_GAIN = 0.05

# Range each goal is willing to give up (fraction of Bus A's range). The model is the same for every goal; the goals
# differ only in how much usable energy the client accepts to lose (and hot-climate adds cooling).
GOALS = {
    "max_range":   dict(title="Keep full range", budget=0.0, cooling=COOL_STEP_C,
                        goal="Take only the gains that cost you no range."),
    "balanced":    dict(title="Balanced", budget=0.05, cooling=COOL_STEP_C,
                        goal="Gain battery life while giving up at most 5 % of range."),
    "lowest_cost": dict(title="Lowest cost per km", budget=0.10, cooling=COOL_STEP_C,
                        goal="Spread the battery price over more kilometres, giving up at most 10 % of range."),
    "longest_life": dict(title="Longest battery life", budget=1.0, cooling=COOL_STEP_C,
                         goal="Get the most life from the pack, as long as the route stays possible."),
    "hot_climate": dict(title="Hot-climate protection", budget=0.05, cooling=COOL_STEP_HOT_C,
                        goal="Cut heat and time spent full in hot weather, giving up at most 5 % of range."),
}


class LeverChange(BaseModel):
    lever: str
    label: str
    unit: str
    from_value: Labelled
    to_value: Labelled
    needs_confirmation: bool
    why: str


class Metrics(BaseModel):
    months_p10: Labelled | None
    months_p50: Labelled | None
    months_p90: Labelled | None
    retention_p10: Labelled
    retention_p50: Labelled
    retention_p90: Labelled
    cost_per_km_p50: Labelled | None
    range_new_km: Labelled
    range_at_replacement_km: Labelled
    range_margin: Labelled
    idle_hours_at_full: Labelled
    calendar_equivalent_soc_pct: Labelled
    effective_temp_c: Labelled


class DeltaVsBase(BaseModel):
    months_p10: Labelled
    months_p50: Labelled
    months_p90: Labelled
    prob_later: Labelled
    p90_beyond_horizon: bool = False          # months_p90 is then the horizon-capped difference, not a measured change
    cost_per_km_change: Labelled | None
    range_change_km: Labelled
    note: str


class Stage(BaseModel):
    scenario: Scenario
    changes: list[LeverChange]
    metrics: Metrics
    delta: DeltaVsBase
    feasible: bool
    summary: str


class PresetResult(BaseModel):
    id: str
    title: str
    goal: str
    range_budget: Labelled
    charging: Stage
    with_confirmation: Stage | None
    same_as: str | None = None
    rejected: list[str]


class Feasibility(BaseModel):
    reserve: Labelled
    required_range_km: Labelled
    base_range_at_replacement_km: Labelled
    base_margin: Labelled
    base_passes: bool
    rule_applied: str
    plain: str


class NotUsed(BaseModel):
    lever: str
    reason: str
    effect_months: Labelled | None = None


class RecommendResult(BaseModel):
    mode: str = "prior"
    scenario: Scenario
    base: Metrics
    feasibility: Feasibility
    presets: list[PresetResult]
    not_used: list[NotUsed]
    months: list[float]
    notes: list[str]
    warnings: list[str]


# ---------------------------------------------------------------- helpers
def range_at_replacement(s: Scenario) -> float:
    return s.pack_kwh * (s.soc_max_pct - s.soc_min_pct) / 100.0 / s.kwh_per_km * s.threshold


def _score(sim: ScenarioSim) -> float:
    return min(life_percentiles(sim, (50,))[0], float(sim.months[-1]))


def metrics(sim: ScenarioSim) -> Metrics:
    s, c = sim.scenario, sim.conditions
    h = float(sim.months[-1])
    lp = dict(zip((10, 50, 90), life_percentiles(sim)))
    def pm(q):
        return None if not np.isfinite(lp[q]) else L(lp[q], "months", "derived")
    r = np.percentile(sim.retention, [10, 50, 90], axis=0)
    rng_new = c.usable_kwh.value / s.kwh_per_km
    cost = None
    if s.battery_cost_per_kwh_inr is not None:
        cost = L(float(np.percentile(s.pack_kwh * s.battery_cost_per_kwh_inr / lifetime_km(sim), 50)), "INR/km", "derived")
    rr = range_at_replacement(s)
    return Metrics(months_p10=pm(10), months_p50=pm(50), months_p90=pm(90),
                   retention_p10=L(r[0].tolist(), "fraction", "derived"), retention_p50=L(r[1].tolist(), "fraction", "derived"),
                   retention_p90=L(r[2].tolist(), "fraction", "derived"), cost_per_km_p50=cost,
                   range_new_km=L(rng_new, "km", "derived"), range_at_replacement_km=L(rr, "km", "derived", "usable range when the pack has aged to the replacement line"),
                   range_margin=L(rr / s.km_per_day, "ratio", "derived", "range at replacement / daily route"),
                   idle_hours_at_full=L(c.idle_hours_at_soc_max.value, "h/day", "derived"),
                   calendar_equivalent_soc_pct=L(c.calendar_equivalent_soc_pct.value, "%", "derived"),
                   effective_temp_c=L(c.effective_temp_c.value, "degC", "derived"))


def delta_vs(base: ScenarioSim, sim: ScenarioSim, bm: Metrics, m: Metrics) -> DeltaVsBase:
    h = min(base.months[-1], sim.months[-1])
    d = np.minimum(sim.cross_months, h) - np.minimum(base.cross_months, h)        # paired by run: used for the probability only
    q = life_delta(base, sim)
    cost = None
    if bm.cost_per_km_p50 is not None and m.cost_per_km_p50 is not None:
        cost = L(m.cost_per_km_p50.value - bm.cost_per_km_p50.value, "INR/km", "derived", "negative means cheaper")
    cens = float(np.isinf(base.cross_months).mean()), float(np.isinf(sim.cross_months).mean())
    return DeltaVsBase(months_p10=L(float(q[0]), "months", "derived"), months_p50=L(float(q[1]), "months", "derived"),
                       months_p90=L(float(q[2]), "months", "derived"), prob_later=L(float((d > 0).mean()), "probability", "derived"),
                       p90_beyond_horizon=p90_beyond_horizon(base, sim), cost_per_km_change=cost,
                       range_change_km=L(m.range_at_replacement_km.value - bm.range_at_replacement_km.value, "km", "derived"),
                       note=(f"difference between the same percentiles of life shown for each bus; a percentile beyond the {h / 12:g}-year horizon is counted at the horizon, "
                             f"so gains near it are understated (runs that never reach the line: Bus A {cens[0] * 100:.0f}%, variant {cens[1] * 100:.0f}%). "
                             "The share of runs that last longer is paired run by run."
                             if sim.engine == "reference" else
                             f"paired on the same random draws; draws that never reach the line are counted at the {h / 12:g}-year horizon "
                             f"(Bus A {cens[0] * 100:.0f}%, variant {cens[1] * 100:.0f}%)"))


def _hhmm(h: float) -> str:
    h = h % 24
    m = int(round((h - int(h)) * 60))
    hh = int(h) + (m // 60)
    return f"{hh % 24:02d}:{m % 60:02d}"


def _change(lever: str, label: str, unit: str, a: float, b: float, conf: bool, why: str) -> LeverChange:
    return LeverChange(lever=lever, label=label, unit=unit, from_value=L(a, unit, "assumption"), to_value=L(b, unit, "assumption"),
                       needs_confirmation=conf, why=why)


def _changes(base: Scenario, s: Scenario, conf: bool) -> list[LeverChange]:
    out = []
    if s.soc_max_pct != base.soc_max_pct:
        out.append(_change("soc_max_pct", "Stop charging at", "%", base.soc_max_pct, s.soc_max_pct, False,
                           "Less time at a very full battery slows ageing in storage and in use."))
    if s.charge_start_hour != base.charge_start_hour:
        out.append(_change("charge_start_hour", "Start charging at", "hour of day", base.charge_start_hour, s.charge_start_hour, False,
                           "Charging later leaves the pack sitting full for fewer hours before departure."))
    if conf and s.heat_rise_c != base.heat_rise_c:
        out.append(_change("heat_rise_c", "Pack runs hotter than the air by", "degC", base.heat_rise_c, s.heat_rise_c, True,
                           "Cooler cells age more slowly. The client must confirm the depot or pack cooling can really do this."))
    if conf and s.kwh_per_km != base.kwh_per_km:
        out.append(_change("kwh_per_km", "Energy use per km", "kWh/km", base.kwh_per_km, s.kwh_per_km, True,
                           "Using less energy per km means fewer cycles and more range. The client must confirm it is achievable (driving, load, air conditioning)."))
    return out


def _describe(base: Scenario, s: Scenario, bm: Metrics, m: Metrics, d: DeltaVsBase, changes: list[LeverChange]) -> str:
    unmeasurable = bm.months_p50 is None and m.months_p50 is None      # median pack stays above the line for the whole horizon either way
    if not changes:
        if unmeasurable:
            return (f"The median pack stays above the replacement line for the whole {base.horizon_years}-year horizon, so the model cannot rank changes by how much "
                    "longer the pack lasts. No change is suggested.")
        return "No change is worth making for this goal: nothing the model can test improves on today's usage by half a month or more."
    parts = []
    for c in changes:
        a, b = c.from_value.value, c.to_value.value
        if c.lever == "soc_max_pct":
            parts.append(f"stop charging at {b:g} % instead of {a:g} %")
        elif c.lever == "charge_start_hour":
            parts.append(f"start charging at {_hhmm(b)} instead of {_hhmm(a)}")
        elif c.lever == "heat_rise_c":
            parts.append(f"keep the pack about {a - b:g} °C cooler")
        elif c.lever == "kwh_per_km":
            parts.append(f"use about {(1 - b / a) * 100:.0f} % less energy per km")
    txt = ", ".join(parts[:-1]) + (" and " if len(parts) > 1 else "") + parts[-1]
    txt = txt[0].upper() + txt[1:] + ". "
    mo = d.months_p50.value
    if unmeasurable:
        txt += (f"The median pack stays above the replacement line for the whole {base.horizon_years}-year horizon either way, so the gain in battery life cannot be measured. ")
    beyond = d.p90_beyond_horizon        # 90th percentile of life lies past the horizon, so its change is not measurable
    span = (f"{d.months_p10.value:+.1f} months at the 10th percentile; the 90th percentile is beyond the {base.horizon_years}-year horizon"
            if beyond else f"likely between {d.months_p10.value:.1f} and {d.months_p90.value:.1f} months")
    if not unmeasurable:
        txt += (f"The model expects the pack to last about {abs(mo):.1f} month{'s' if abs(mo) != 1 else ''} {'longer' if mo >= 0 else 'shorter'} "
                f"({span}). ")
    rc = d.range_change_km.value
    txt += "Range when the pack is due for replacement stays the same. " if abs(rc) < 0.5 else \
        f"Range when the pack is due for replacement {'drops' if rc < 0 else 'rises'} by about {abs(rc):.0f} km. "
    if d.cost_per_km_change is not None and abs(d.cost_per_km_change.value) >= 0.005:
        cc = d.cost_per_km_change.value
        txt += f"Battery cost per km {'falls' if cc < 0 else 'rises'} by about ₹{abs(cc):.2f}."
    return txt.strip()


def _delays(s: Scenario, idle_h: float) -> list[float]:
    cap = max(idle_h - BUFFER_H, 0.0)
    out = {0.0} | {float(i) for i in range(1, int(cap) + 1)} | ({round(cap, 2)} if cap > 0 else set())
    return sorted(out)


def _candidates(s: Scenario):
    caps = sorted({s.soc_max_pct} | {c for c in CAP_STEPS if c < s.soc_max_pct and c - s.soc_min_pct >= 10}, reverse=True)
    for cap in caps:
        t = translate(s.model_copy(update=dict(soc_max_pct=cap)))
        for dly in _delays(s, t.idle_hours_at_soc_max.value):
            yield s.model_copy(update=dict(soc_max_pct=cap, charge_start_hour=(s.charge_start_hour + dly) % 24))


def _feasibility(s: Scenario, reserve: float) -> tuple[Feasibility, float]:
    need = s.km_per_day * (1 + reserve)
    rr = range_at_replacement(s)
    passes = rr + 1e-9 >= need
    if passes:
        floor, rule = need, f"Every suggestion must still cover the daily route plus a {reserve * 100:g} % reserve when the pack is due for replacement."
        plain = (f"Today, when this pack has aged to the replacement line it can still drive about {rr:.0f} km on a charge. "
                 f"Your route needs {need:.0f} km ({s.km_per_day:g} km plus a {reserve * 100:g} % reserve), so there is room to spare.")
    else:
        floor = rr
        rule = "Bus A already misses the reserve, so no suggestion may reduce the range margin below Bus A's own."
        plain = (f"Careful: today, when this pack has aged to the replacement line it can drive only about {rr:.0f} km on a charge, "
                 f"but your {s.km_per_day:g} km route plus a {reserve * 100:g} % safety reserve needs {need:.0f} km. "
                 f"So this bus already runs tighter than the reserve rule. We never suggest anything that cuts its range further.")
    return Feasibility(reserve=L(reserve, "fraction", "assumption"), required_range_km=L(need, "km", "assumption"),
                       base_range_at_replacement_km=L(rr, "km", "derived"), base_margin=L(rr / s.km_per_day, "ratio", "derived"),
                       base_passes=bool(passes), rule_applied=rule, plain=plain), floor


def recommend(base: Scenario, models: Models, n_draws: int = 2000, seed: int = 0, reserve: float = 0.2) -> RecommendResult:
    feas, floor = _feasibility(base, reserve)
    fast = make_draws(min(FAST_DRAWS, n_draws), models, seed)
    base_fast = _score(simulate_scenario(base, models, fast))
    base_rr = range_at_replacement(base)

    # --- search (fast draws, shared by every candidate)
    scored, rejected = [], []
    for c in _candidates(base):
        rr = range_at_replacement(c)
        if rr + 1e-9 < floor:
            if c.charge_start_hour == base.charge_start_hour:
                rejected.append((c.soc_max_pct, f"Stopping charging at {c.soc_max_pct:g} % is rejected: range at replacement would be {rr:.0f} km, "
                                 f"below the {floor:.0f} km this route needs." if feas.base_passes else
                                 f"Stopping charging at {c.soc_max_pct:g} % is rejected: it cuts range at replacement to {rr:.0f} km, below today's {base_rr:.0f} km."))
            continue
        scored.append((c, _score(simulate_scenario(c, models, fast)), 1 - rr / base_rr))

    picks = {}
    for gid, g in GOALS.items():
        ok = [(c, sc, loss) for c, sc, loss in scored if loss <= g["budget"] + 1e-9]
        # best life; ties go to the smaller change (higher cap, earlier start)
        ok.sort(key=lambda t: (-round(t[1], 2), t[2], (t[0].charge_start_hour - base.charge_start_hour) % 24))
        best = ok[0][0] if ok and ok[0][1] - base_fast >= MIN_GAIN_MONTHS else base
        picks[gid] = best

    # --- final evaluation on full shared draws
    draws = make_draws(n_draws, models, seed)
    bsim = simulate_scenario(base, models, draws)
    bm = metrics(bsim)
    presets = []
    for gid, g in GOALS.items():
        ch = picks[gid]
        csim = simulate_scenario(ch, models, draws)
        cm = metrics(csim)
        cd = delta_vs(bsim, csim, bm, cm)
        cchg = _changes(base, ch, False)
        stage1 = Stage(scenario=ch, changes=cchg, metrics=cm, delta=cd, feasible=range_at_replacement(ch) + 1e-9 >= floor,
                       summary=_describe(base, ch, bm, cm, cd, cchg))
        ext = ch.model_copy(update=dict(heat_rise_c=max(ch.heat_rise_c - g["cooling"], 0.0),
                                        kwh_per_km=round(ch.kwh_per_km * (1 - EFFICIENCY_GAIN), 4)))
        esim = simulate_scenario(ext, models, draws)
        em = metrics(esim)
        ed = delta_vs(bsim, esim, bm, em)
        echg = _changes(base, ext, True)
        stage2 = Stage(scenario=ext, changes=echg, metrics=em, delta=ed, feasible=range_at_replacement(ext) + 1e-9 >= floor,
                       summary=_describe(base, ext, bm, em, ed, echg))
        presets.append(PresetResult(id=gid, title=g["title"], goal=g["goal"], range_budget=L(g["budget"], "fraction", "assumption", "share of range this goal may give up"),
                                    charging=stage1, with_confirmation=stage2 if echg else None, rejected=[]))
    # rejected caps failed the route rule, not a goal budget, so the list is shared; goals that end up with identical advice are linked
    rej_txt = [t for _, t in sorted(set(rejected), reverse=True)][:4]
    seen: dict[tuple, str] = {}
    for p in presets:
        p.rejected = rej_txt
        sig = (p.charging.scenario.model_dump_json(), p.with_confirmation.scenario.model_dump_json() if p.with_confirmation else "")
        if sig in seen:
            p.same_as = seen[sig]
        else:
            seen[sig] = p.id

    # --- levers we measured but do not recommend
    def eff(**kw):
        sm = simulate_scenario(base.model_copy(update=kw), models, draws)
        return _score(sm) - _score(bsim)
    e_lo, e_hi = eff(charge_power_kw=base.charge_power_kw * 0.5), eff(charge_power_kw=min(base.charge_power_kw * 2, 500))
    swing = max(abs(e_lo), abs(e_hi))
    not_used = [
        NotUsed(lever="Charger power", effect_months=L(swing, "months", "derived", "largest change in median life when charger power is halved or doubled"),
                reason=f"Halving or doubling charger power moves battery life by at most {swing:.1f} months in the model. "
                       + ("In the NREL models charge speed has almost no effect on cycling loss within the tested range, so power only changes how long the pack sits full. "
                          if models.engine == "reference" else "The cycling data show no charge-speed effect, so power only changes how long the pack sits full. ")
                       + "Not worth changing for battery health."),
        NotUsed(lever="Minimum charge", reason=(
            "Both NREL cells were cycled at 80 to 100 % depth of discharge. A bus uses less than that, so the model is extrapolating, and any gain from changing the minimum charge "
            "cannot be trusted. It is also a safety margin rather than a battery-usage choice, so it is never suggested."
            if models.engine == "reference" else
            "The model has no depth-of-discharge effect (the training cells were all cycled full depth), so lowering the minimum charge would look free. "
            "That is a gap in the data, not proof it is free, so it is never suggested.")),
        NotUsed(lever="Km per day", reason="Daily distance is a service level set by the operator, not a battery-usage choice, so it is not changed. "
                                           "You can still explore it by editing Bus B by hand."),
    ]
    notes = ["Presets are suggestions to test, not predictions that they will be followed.",
             "Cost per km moves in step with battery life here because the pack price and daily distance are held fixed.",
             f"{len(scored)} combinations of charge cap and start time passed the route rule; {len({r[0] for r in rejected})} charge caps failed it."]
    warnings = list(dict.fromkeys([*translate(base).warnings]))
    return RecommendResult(scenario=base, base=bm, feasibility=feas, presets=presets, not_used=not_used,
                           months=[float(x) for x in bsim.months], notes=notes, warnings=warnings)
