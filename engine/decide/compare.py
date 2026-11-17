"""Paired what-if comparison: scenarios share Monte Carlo draws, so differences are not simulation noise."""
from __future__ import annotations

import numpy as np
from pydantic import BaseModel

from engine.bus.scenario import Scenario
from engine.cell.uncertainty import Models, load_models, make_draws
from engine.decide.replacement import life_delta, p90_beyond_horizon, replacement_window, simulate_scenario
from engine.labels import Labelled, L

WHATIF_NOTES = {
    "charge_power_kw": "No data-backed C-rate effect on cycling (M2.3): charge power changes time at high SOC only.",
    "soc_max_pct": "Works through calendar stress at high SOC (storage data) and through the SOC window.",
}
REFERENCE_NOTES = {
    "charge_power_kw": "Charge power acts only through the time spent full: in the NREL models cycling fade barely depends on charge rate within the tested range.",
    "soc_max_pct": "Works through calendar ageing at high state of charge and through the daily state-of-charge window.",
}


class Delta(BaseModel):
    months_p10: Labelled
    months_p50: Labelled
    months_p90: Labelled
    prob_variant_later: Labelled
    p90_beyond_horizon: bool = False
    censored_note: str


class ComparisonResult(BaseModel):
    base: dict
    variants: list[dict]
    deltas: list[Delta]
    notes: list[str]
    mode: str = "prior"


def compare(scenarios: list[Scenario], n_draws: int = 2000, seed: int = 0, models: Models | None = None) -> ComparisonResult:
    if not 2 <= len(scenarios) <= 4:
        raise ValueError("compare needs between 2 and 4 scenarios")
    models = models or load_models()
    draws = make_draws(n_draws, models, seed)
    sims = [simulate_scenario(s, models, draws) for s in scenarios]
    results = [replacement_window(s, models=models, draws=draws) for s in scenarios]
    deltas, notes = [], []
    base = sims[0]
    for s, sim in zip(scenarios[1:], sims[1:]):
        h = min(base.months[-1], sim.months[-1])
        a, b = np.minimum(base.cross_months, h), np.minimum(sim.cross_months, h)   # censor both at the shorter horizon
        d = b - a                                                                   # paired by run: used for the probability only
        q = life_delta(base, sim)
        cens = float(np.isinf(base.cross_months).mean()), float(np.isinf(sim.cross_months).mean())
        deltas.append(Delta(months_p10=L(float(q[0]), "months", "derived"), months_p50=L(float(q[1]), "months", "derived"),
                            months_p90=L(float(q[2]), "months", "derived"), prob_variant_later=L(float((d > 0).mean()), "probability", "derived"), p90_beyond_horizon=p90_beyond_horizon(base, sim),
                            censored_note=(f"a percentile of life beyond the {h / 12:g}-year horizon is counted at the horizon, so gains near it are understated (runs never reaching the line: base {cens[0] * 100:.0f}%, variant {cens[1] * 100:.0f}%)"
                                           if models.engine == "reference" else
                                           f"draws not reaching the threshold are counted at the {h / 12:g}-year horizon (base {cens[0] * 100:.0f}%, variant {cens[1] * 100:.0f}%)")))
        for field, note in (REFERENCE_NOTES if models.engine == "reference" else WHATIF_NOTES).items():
            if getattr(s, field) != getattr(scenarios[0], field):
                notes.append(note)
    return ComparisonResult(base=results[0].model_dump(), variants=[r.model_dump() for r in results[1:]], deltas=deltas, notes=sorted(set(notes)))
