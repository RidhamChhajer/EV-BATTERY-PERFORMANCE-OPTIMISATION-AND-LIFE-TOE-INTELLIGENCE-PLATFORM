"""Fleet forecast (Layer 5): when will the buses of a mixed-age, mixed-duty fleet reach the replacement line, and what will that cost?

What it adds to the single-bus engine, and what it deliberately does not:

* **Age.** The engine forecasts a new pack. A bus already in service has survived to today, so its chance of crossing in a later period
  is conditional on that: (F(a + end) - F(a + start)) / (1 - F(a)). "Still in service" is read as "has not yet reached the model's line",
  which is not the same as "has not been replaced": operators often keep running packs below the line.
* **Shared model risk.** The 50 reference runs are 2 published models x 5 degradation scalars x 5 pack penalties. Which model is closer to the
  truth is one fact for the whole fleet, so it cannot average out across buses. The fleet is therefore a 50/50 MIXTURE over the two models,
  with independent buses inside each. The 50/50 weight is an assumption. Updating it from the fleet's own survival would be calibration,
  which this prior-only engine does not do. Conditioning on age is applied inside each model.
* **Different buses, different binomials.** Buses with the same duty class and the same age share one per-period probability, so the count of
  replacements in a period is a sum of independent binomials, one per (class, age) cell: a Poisson-binomial, by exact convolution.
* **Money.** Spend per period is convolved exactly over the distinct pack prices (after rounding to the nearest rupee thousand).

Not modelled: a second pack for a replaced bus, discounting, charger or depot capacity, and per-bus duty variation inside a class.
Everything stays "not yet validated on buses".
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import numpy as np
from pydantic import BaseModel
from scipy.stats import binom

from engine.bus.scenario import Scenario
from engine.cell.uncertainty import Models, make_draws
from engine.decide.cost import cost_per_km
from engine.decide.replacement import replacement_window, simulate_scenario
from engine.labels import Labelled, L
from engine.reference.simulate import reference_curves

FLEET_HORIZON_YEARS = 20          # every class runs at this horizon, so the ageing-curve cache key is the same for every fleet
MODEL_WEIGHT = 0.5                # assumption: the two published models are equally likely to be the closer one
MAX_PRICE_LEVELS = 8
PRUNE = 1e-12
MAX_SUPPORT = 200_000


class FleetInputError(ValueError):
    """A fleet that cannot be forecast (the message is written for the person who sent it)."""


# ------------------------------------------------------------------ inputs
@dataclass(frozen=True)
class BusSpec:
    id: str
    class_id: str
    age_months: int | None        # None = in-service date unknown; the bus is counted as new and flagged
    pack_price_inr: float | None = None


def age_months(in_service: str | None, as_of: date) -> int | None:
    """Whole months from an 'YYYY-MM' in-service month to the month of `as_of`."""
    if in_service is None:
        return None
    y, m = int(in_service[:4]), int(in_service[5:7])
    a = (as_of.year - y) * 12 + (as_of.month - m)
    if a < 0:
        raise FleetInputError(f"In-service month {in_service} is after {as_of.isoformat()[:7]}.")
    return a


def period_edges(as_of: date, forecast_years: int) -> tuple[list[int], list[str]]:
    """Month offsets from today at each Indian financial-year boundary (April to March), and the labels. The first period is the rest of the
    current financial year. The last one is whole, so the window may run a little past `forecast_years`."""
    first = (4 - as_of.month) % 12 or 12
    edges = [0, first]
    while edges[-1] < 12 * forecast_years:
        edges.append(edges[-1] + 12)
    y0 = as_of.year if as_of.month >= 4 else as_of.year - 1
    return edges, [f"FY{y0 + p}-{(y0 + p + 1) % 100:02d}" for p in range(len(edges) - 1)]


# ------------------------------------------------------------------ per-class crossing times
def class_crossings(s: Scenario, models: Models) -> dict[str, np.ndarray]:
    """Month each reference run reaches the line, split by which published model the run belongs to (inf = not within the horizon)."""
    sim = simulate_scenario(s, models, make_draws(2000, models, 0))
    who = np.array(reference_curves(s).model_of_row)
    return {m: np.asarray(sim.cross_months)[who == m] for m in sorted(set(who))}


def _F(cross: np.ndarray, t: float) -> float:
    return float(np.mean(cross <= t + 1e-9))


# ------------------------------------------------------------------ one (class, age) cell
@dataclass
class Cell:
    class_id: str
    age: int | None
    n: int
    price: float | None
    q: np.ndarray = field(default=None)         # (n_models, P) probability of reaching the line in each period, given still in service
    flags: list[str] = field(default_factory=list)


def period_probs(cross_by_model: dict[str, np.ndarray], age: int, edges: list[int]) -> tuple[np.ndarray, list[str], float]:
    """Per model and period: chance a bus of this age reaches the line in that period, given it has not yet. Also flags and P(already past)."""
    keys = list(cross_by_model)
    surv = [1.0 - _F(cross_by_model[m], age) for m in keys]
    cdf = [[_F(cross_by_model[m], age + e) for e in edges] for m in keys]
    q = np.zeros((len(keys), len(edges) - 1))
    flags: list[str] = []
    for i in range(len(keys)):
        if surv[i] > 1e-12:
            q[i] = np.diff(cdf[i]) / surv[i]
    live = [i for i in range(len(keys)) if surv[i] > 1e-12]
    if not live:
        q[:, 0] = 1.0                                  # past every run of both models: due as soon as possible
        flags.append("past_all_runs")
    elif len(live) < len(keys):
        for i in range(len(keys)):
            if i not in live:
                q[i] = q[live[0]]                       # this model has nothing left to say about a bus this old: use the other one alone
        flags.append("one_model_only")
    past = float(np.mean([_F(cross_by_model[m], age) for m in keys]))
    if past > 0.5:
        flags.append("past_median_life")
    return q, flags, past


# ------------------------------------------------------------------ distributions
def _binom_pmf(n: int, q: float) -> np.ndarray:
    return binom.pmf(np.arange(n + 1), n, min(max(q, 0.0), 1.0))


def poisson_binomial(cells: list[tuple[int, float]]) -> np.ndarray:
    """PMF of the total of independent Binomial(n_i, q_i): exact, by convolution."""
    pmf = np.array([1.0])
    for n, q in cells:
        if n > 0 and q > 0:
            pmf = np.convolve(pmf, _binom_pmf(n, q))
    return pmf


def _trim(vals: np.ndarray, p: np.ndarray, tol: float = PRUNE):
    keep = p > tol
    return vals[keep], p[keep]


def _combine(av: np.ndarray, ap: np.ndarray, bv: np.ndarray, bp: np.ndarray):
    """Distribution of the sum of two independent discrete quantities. Equal sums are merged. Only if the support still exceeds
    MAX_SUPPORT is it binned (to at most that many points), which is far finer than any rupee figure shown."""
    v = np.add.outer(av, bv).ravel()
    p = np.multiply.outer(ap, bp).ravel()
    u, inv = np.unique(v, return_inverse=True)
    pp = np.bincount(inv, weights=p)
    if len(u) > MAX_SUPPORT:
        w = (u[-1] - u[0]) / MAX_SUPPORT
        b = np.floor((u - u[0]) / w).astype(int)
        mass = np.bincount(b, weights=pp)
        mean = np.bincount(b, weights=pp * u) / np.maximum(mass, 1e-300)
        u, pp = mean[mass > 0], mass[mass > 0]
    return _trim(u, pp, 1e-13)


def quantile(vals: np.ndarray, p: np.ndarray, q: float) -> float:
    """Smallest value whose cumulative probability reaches q (the rule `binomialQuantile` in the front end uses)."""
    o = np.argsort(vals, kind="stable")
    c = np.cumsum(p[o])
    return float(vals[o][min(int(np.searchsorted(c, q - 1e-9)), len(vals) - 1)])


@dataclass
class PeriodDist:
    counts: np.ndarray                 # pmf over number of buses reaching the line in the period
    spend_v: np.ndarray | None = None
    spend_p: np.ndarray | None = None


def _period_dist(cells: list[Cell], model: int, p: int, with_money: bool) -> PeriodDist:
    groups: dict[float | None, list[tuple[int, float]]] = {}
    for c in cells:
        groups.setdefault(c.price, []).append((c.n, float(c.q[model, p])))
    pmfs = {g: poisson_binomial(v) for g, v in groups.items()}
    counts = np.array([1.0])
    for pm in pmfs.values():
        counts = np.convolve(counts, pm)
    if not with_money:
        return PeriodDist(counts)
    sv, sp = np.array([0.0]), np.array([1.0])
    for price, pm in pmfs.items():
        k = np.arange(len(pm), dtype=float)
        v, pr = _trim(k * float(price), pm)
        sv, sp = _combine(sv, sp, v, pr)
    return PeriodDist(counts, sv, sp)


def _mix(dists: list[PeriodDist]) -> PeriodDist:
    w = 1.0 / len(dists)
    n = max(len(d.counts) for d in dists)
    counts = sum(w * np.pad(d.counts, (0, n - len(d.counts))) for d in dists)
    if dists[0].spend_v is None:
        return PeriodDist(counts)
    return PeriodDist(counts, np.concatenate([d.spend_v for d in dists]), np.concatenate([w * d.spend_p for d in dists]))


# ------------------------------------------------------------------ results
class ClassSummary(BaseModel):
    id: str
    n_buses: Labelled
    months_p10: Labelled | None
    months_p50: Labelled | None
    months_p90: Labelled | None
    km_per_year: Labelled
    battery_cost_per_km_p50: Labelled | None
    electricity_cost_per_km: Labelled | None
    total_cost_per_km_p50: Labelled | None
    extrapolation_reasons: list[str]
    warnings: list[str]


class CohortSummary(BaseModel):
    """Buses of one duty class and one age. `months_to_line_*` count from today and are conditional on the bus still being in service;
    they are percentiles of the model's runs, which for a new pack can differ from the Replacement page's headline (that one is the
    crossing of the percentile curves)."""
    class_id: str
    age_months: Labelled | None
    n_buses: Labelled
    months_to_line_p10: Labelled | None
    months_to_line_p50: Labelled | None
    months_to_line_p90: Labelled | None
    chance_due_next_12_months: Labelled
    flags: list[str]


class FleetCost(BaseModel):
    battery_cost_per_km_p50: Labelled | None
    electricity_cost_per_km: Labelled | None
    total_cost_per_km_p50: Labelled | None


class FleetResult(BaseModel):
    as_of: str
    period_labels: list[str]
    period_edges_months: Labelled
    buses_expected: Labelled
    buses_p10: Labelled
    buses_p90: Labelled
    spend_expected: Labelled | None
    spend_p10: Labelled | None
    spend_p90: Labelled | None
    beyond_forecast_buses: Labelled
    bulk_from_period: str | None
    bulk_to_period: str | None
    cost: FleetCost
    classes: list[ClassSummary]
    cohorts: list[CohortSummary]
    model_weights: Labelled
    warnings: list[str]


def _cohort_quantiles(cross_by_model: dict[str, np.ndarray], age: int, qs=(0.1, 0.5, 0.9)) -> list[float | None]:
    """Months from today to the line, over the runs still in service at `age`, weighting the two models equally (or one alone if the other
    has nothing left). None = beyond the 20-year horizon."""
    vals, wts = [], []
    live = {m: c[c > age + 1e-9] for m, c in cross_by_model.items()}
    live = {m: c for m, c in live.items() if len(c)}
    if not live:
        return [0.0, 0.0, 0.0]
    for m, c in live.items():
        vals.append(c - age)
        wts.append(np.full(len(c), 1.0 / (len(live) * len(c))))
    v, w = np.concatenate(vals), np.concatenate(wts)
    o = np.argsort(v, kind="stable")
    v, c = v[o], np.cumsum(w[o])
    out = []
    for q in qs:
        i = int(np.searchsorted(c, q - 1e-9))
        x = v[min(i, len(v) - 1)]
        out.append(None if (i >= len(v) or not np.isfinite(x)) else float(x))
    return out


def _due(cross_by_model: dict[str, np.ndarray], age: int, edges: list[int]) -> float:
    """Mixture chance of reaching the line within the next 12 months, given still in service."""
    q, _, _ = period_probs(cross_by_model, age, [0, 12])
    return float(q[:, 0].mean())


def fleet_forecast(classes: dict[str, Scenario], buses: list[BusSpec], models: Models, as_of: date, forecast_years: int = 10) -> FleetResult:
    """Forecast a fleet. `classes` maps class id to its duty scenario; every bus names its class."""
    if models.engine != "reference":
        raise FleetInputError("The fleet forecast needs the reference engine.")
    if not buses:
        raise FleetInputError("The fleet has no buses.")
    unknown = sorted({b.class_id for b in buses} - set(classes))
    if unknown:
        raise FleetInputError(f"Unknown duty class: {', '.join(unknown[:3])}.")
    edges, labels = period_edges(as_of, forecast_years)
    oldest = max((b.age_months or 0) for b in buses)
    if oldest + edges[-1] > FLEET_HORIZON_YEARS * 12:
        raise FleetInputError(f"The oldest bus is {oldest / 12:.1f} years old and the forecast runs {edges[-1] / 12:.1f} years, past the model's "
                              f"{FLEET_HORIZON_YEARS}-year horizon. Shorten the forecast to {max(1, (FLEET_HORIZON_YEARS * 12 - oldest) // 12 - 1)} years or fewer.")
    scen = {k: s.model_copy(update={"horizon_years": FLEET_HORIZON_YEARS}) for k, s in classes.items()}
    used = sorted({b.class_id for b in buses})
    cross = {k: class_crossings(scen[k], models) for k in used}
    keys = list(next(iter(cross.values())))
    nm, P = len(keys), len(edges) - 1

    def default_price(k: str) -> float | None:
        s = scen[k]
        return None if s.battery_cost_per_kwh_inr is None else s.pack_kwh * s.battery_cost_per_kwh_inr

    # ---- cells: same class, same age (or both unknown), same price
    grouped: dict[tuple, int] = {}
    for b in buses:
        price = b.pack_price_inr if b.pack_price_inr is not None else default_price(b.class_id)
        price = None if price is None else round(price / 1000.0) * 1000.0
        grouped[(b.class_id, b.age_months, price)] = grouped.get((b.class_id, b.age_months, price), 0) + 1
    with_money = all(k[2] is not None for k in grouped)
    if with_money and len({k[2] for k in grouped}) > MAX_PRICE_LEVELS:
        raise FleetInputError(f"More than {MAX_PRICE_LEVELS} different pack prices. Give buses of one type the same price.")
    cells: list[Cell] = []
    for (cid, age, price), n in sorted(grouped.items(), key=lambda kv: (kv[0][0], kv[0][1] or -1, kv[0][2] or 0)):
        q, flags, _ = period_probs(cross[cid], age or 0, edges)
        if age is None:
            flags = ["age_unknown"]                    # no age to condition on: counted as new, and kept out of the other flags
        cells.append(Cell(cid, age, n, price, q, flags))

    # ---- fleet distributions: mixture over the two models
    per_period = [_mix([_period_dist(cells, m, p, with_money) for m in range(nm)]) for p in range(P)]
    exp_n = np.array([sum(c.n * c.q[:, p].mean() for c in cells) for p in range(P)])
    p10 = np.array([quantile(np.arange(len(d.counts)), d.counts, 0.1) for d in per_period])
    p90 = np.array([quantile(np.arange(len(d.counts)), d.counts, 0.9) for d in per_period])
    N = float(sum(c.n for c in cells))
    beyond = float(sum(c.n * (1.0 - c.q[:, :].sum(axis=1).mean()) for c in cells))
    cum = np.cumsum(exp_n) / N
    first = lambda t: next((labels[i] for i in range(P) if cum[i] >= t - 1e-9), None)
    note = "weighted equally across the two published models; the weight is an assumption"
    if with_money:
        sp = [(float(np.dot(d.spend_v, d.spend_p)), quantile(d.spend_v, d.spend_p, 0.1), quantile(d.spend_v, d.spend_p, 0.9)) for d in per_period]
    sn = "pack price x buses reaching the line, first pack only, undiscounted"
    warns = ["Each bus is counted once: no second pack, no discounting, and buses age independently inside each published model.",
             "A bus still in service is taken to have not yet reached the model's replacement line. Operators often run packs below it.",
             "The two models are mixed 50/50 by assumption. The fleet's own survival is not used to reweight them (that would be calibration)."]
    if any("age_unknown" in c.flags for c in cells):
        warns.append("Some buses have no in-service date and are counted as new, which pushes their replacement later than it may be.")
    if not with_money:
        warns.append("Spend is not shown because some buses have no pack price.")

    # ---- per class
    summaries, tot_w, bat, ele, tot = [], 0.0, [], [], []
    for k in used:
        s = scen[k]
        n = sum(c.n for c in cells if c.class_id == k)
        sim = simulate_scenario(s, models, make_draws(2000, models, 0))
        rep = replacement_window(s, models=models, draws=make_draws(2000, models, 0))
        cost = cost_per_km(sim)
        kmy = s.km_per_day * s.operating_days_per_year
        b = cost.cost_per_km_p50.value if cost.cost_per_km_p50 else None
        e = cost.electricity.cost_per_km.value if cost.electricity else None
        t = (b + e) if (b is not None and e is not None) else None
        bat.append((n * kmy, b)); ele.append((n * kmy, e)); tot.append((n * kmy, t)); tot_w += n * kmy
        summaries.append(ClassSummary(
            id=k, n_buses=L(float(n), "buses", "derived", "count of buses in this class"), months_p10=rep.months_p10, months_p50=rep.months_p50,
            months_p90=rep.months_p90, km_per_year=L(kmy, "km", "assumption", "km per day x operating days per year"),
            battery_cost_per_km_p50=cost.cost_per_km_p50, electricity_cost_per_km=cost.electricity.cost_per_km if cost.electricity else None,
            total_cost_per_km_p50=None if t is None else L(float(t), "INR/km", "derived", "battery cost per km p50 + electricity cost per km"),
            extrapolation_reasons=list(rep.extrapolation_reasons), warnings=list(rep.warnings)))

    def weighted(rows, note):
        if any(v is None for _, v in rows):
            return None
        return L(float(sum(w * v for w, v in rows) / tot_w), "INR/km", "derived", note)

    wn = "average of the classes' medians weighted by the km each class drives a year; a mean of medians, not a percentile of the fleet"
    cohorts = []
    for c in cells:
        cb = cross[c.class_id]
        if c.age is None:
            qs = _cohort_quantiles(cb, 0)
            due = _due(cb, 0, edges)
        else:
            qs = _cohort_quantiles(cb, c.age)
            due = _due(cb, c.age, edges)
        mk = lambda v: None if v is None else L(v, "months", "derived", "from today, conditional on the bus still being in service")
        cohorts.append(CohortSummary(
            class_id=c.class_id, age_months=None if c.age is None else L(float(c.age), "months", "assumption", "months since the in-service month"),
            n_buses=L(float(c.n), "buses", "derived"), months_to_line_p10=mk(qs[0]), months_to_line_p50=mk(qs[1]), months_to_line_p90=mk(qs[2]),
            chance_due_next_12_months=L(due, "fraction", "derived", note), flags=c.flags))
    return FleetResult(
        as_of=as_of.isoformat(), period_labels=labels, period_edges_months=L([float(e) for e in edges], "months", "derived", "months from today at each financial-year boundary"),
        buses_expected=L(exp_n.tolist(), "buses", "derived", note), buses_p10=L(p10.tolist(), "buses", "derived", "10th percentile of the number of buses reaching the line in the period"),
        buses_p90=L(p90.tolist(), "buses", "derived", "90th percentile of the number of buses reaching the line in the period"),
        spend_expected=L([x[0] for x in sp], "INR", "derived", sn) if with_money else None,
        spend_p10=L([x[1] for x in sp], "INR", "derived", sn) if with_money else None,
        spend_p90=L([x[2] for x in sp], "INR", "derived", sn) if with_money else None,
        beyond_forecast_buses=L(beyond, "buses", "derived", "expected buses not reaching the line within the forecast"),
        bulk_from_period=first(0.1), bulk_to_period=first(0.9),
        cost=FleetCost(battery_cost_per_km_p50=weighted(bat, wn), electricity_cost_per_km=weighted(ele, wn), total_cost_per_km_p50=weighted(tot, wn)),
        classes=summaries, cohorts=cohorts, model_weights=L(MODEL_WEIGHT, "fraction", "assumption", "weight of each published model in the mixture"), warnings=warns)
