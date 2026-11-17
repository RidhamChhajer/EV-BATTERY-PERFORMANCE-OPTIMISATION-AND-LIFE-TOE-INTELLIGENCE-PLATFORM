"""Glue between HTTP and engine: one pure function plus a small thread-safe LRU cache."""
from __future__ import annotations

import hashlib
import threading
from collections import OrderedDict

from backend.app.schemas import (CompareRequest, CompareResult, DISCLAIMER, DriverSplit, FleetRequest, FleetResponse, PredictionResult, PredictRequest,
                                 RecommendRequest, RecommendResponse)
from engine.cell.uncertainty import Models, make_draws
from engine.decide.compare import compare
from engine.decide.cost import cost_per_km
from engine.decide.fleet import BusSpec, age_months, fleet_forecast
from engine.decide.range import monthly_range
from engine.decide.recommend import recommend
from engine.decide.replacement import replacement_window, simulate_scenario
from engine.labels import L

RANGE_AGES = (0.0, 3.0, 6.0)


def run_prediction(req: PredictRequest, models: Models, model_version: str) -> PredictionResult:
    s = req.scenario
    draws = make_draws(req.n_draws, models, req.seed)
    sim = simulate_scenario(s, models, draws)
    rep = replacement_window(s, models=models, draws=draws)
    rng = monthly_range(sim, ages_years=tuple(a for a in RANGE_AGES if a <= s.horizon_years), mode=req.range_temperature_mode)
    cost = cost_per_km(sim, models, draws)
    cal = float(rep.calendar_share_of_loss.value)
    split = DriverSplit(calendar_share=L(cal, "fraction", "derived", "share of capacity loss from calendar ageing at crossing"),
                        cycling_share=L(1.0 - cal, "fraction", "derived", "share from cycling at crossing"))
    warnings: list[str] = []
    for w in [DISCLAIMER, *sim.conditions.warnings, *rep.warnings, *rng.warnings, *cost.warnings]:
        if w not in warnings:
            warnings.append(w)
    return PredictionResult(model_version=model_version, scenario=s, conditions=sim.conditions, replacement=rep,
                            range=rng, cost=cost, driver_split=split, warnings=warnings)


def run_compare(req: CompareRequest, models: Models, model_version: str) -> CompareResult:
    from engine.decide.replacement import ReplacementResult
    res = compare(req.scenarios, n_draws=req.n_draws, seed=req.seed, models=models)
    reps = [ReplacementResult.model_validate(d) for d in [res.base, *res.variants]]
    warnings: list[str] = [DISCLAIMER]
    for r in reps:
        warnings += [w for w in r.warnings if w not in warnings]
    return CompareResult(model_version=model_version, scenarios=req.scenarios, replacements=reps, deltas=res.deltas,
                         notes=res.notes, warnings=warnings)


def run_recommend(req: RecommendRequest, models: Models, model_version: str) -> RecommendResponse:
    res = recommend(req.scenario, models, n_draws=req.n_draws, seed=req.seed, reserve=req.reserve_fraction)
    warns = [DISCLAIMER, *[w for w in res.warnings if w != DISCLAIMER]]
    return RecommendResponse(**{**res.model_dump(), "warnings": warns}, model_version=model_version)


def run_fleet(req: FleetRequest, models: Models, model_version: str) -> FleetResponse:
    """Classes run once each (the ageing curves are cached by their own key, so classes that differ only in price share a run);
    the fleet maths then works from per-class crossing times. Raises FleetInputError for a fleet that cannot be forecast."""
    buses = [BusSpec(b.id, b.class_id, age_months(b.in_service, req.as_of), b.pack_price_inr) for b in req.buses]
    res = fleet_forecast({c.id: c.scenario for c in req.classes}, buses, models, req.as_of, req.forecast_years)
    return FleetResponse(**res.model_dump(), model_version=model_version)


class LRUCache:
    def __init__(self, size: int = 128):
        self.size, self._d, self._lock = size, OrderedDict(), threading.Lock()

    @staticmethod
    def key(req, model_version: str) -> str:
        return hashlib.sha256((type(req).__name__ + model_version + req.model_dump_json()).encode()).hexdigest()

    def get(self, k):
        with self._lock:
            if k in self._d:
                self._d.move_to_end(k)
                return self._d[k]
        return None

    def put(self, k, v):
        with self._lock:
            self._d[k] = v
            self._d.move_to_end(k)
            while len(self._d) > self.size:
                self._d.popitem(last=False)

    def __len__(self):
        return len(self._d)
