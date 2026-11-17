"""Calibration method demonstration on EVBattery, written to metrics.json for the /evidence endpoint.

Question: if a vendor supplies k labelled snippets for a vehicle the fleet model has never seen, how much smaller does
the capacity error get, and does shrinkage toward the prior help when k is small?

Protocol. Vehicle-grouped 5-fold cross-validation: a vehicle is never in both the fleet fit and the test side. For each
test vehicle, 100 rows are held out as the fixed evaluation set; the vendor's k labelled rows are drawn at random from
its other rows (3 repeats). Error is |prediction - label| / label against the dataset's own derived capacity label.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from engine.calibrate.features import LABEL, MILEAGE_ONLY, SNIPPET_FEATURES, prepare
from engine.calibrate.model import CAVEAT, calibrate, fit_prior
from engine.train import metrics_store

TABLE = "engine/data/processed/evb_segments.parquet"
KS = [0, 5, 20, 100]
EVAL_ROWS, REPEATS, CAP_PER_VEHICLE, MIN_ROWS = 100, 3, 300, 200


def load(table: str = TABLE, seed: int = 0) -> pd.DataFrame:
    d = pd.read_parquet(table)
    d = prepare(d[d[LABEL] > 0])
    return d.sample(frac=1, random_state=seed).groupby("vehicle").head(CAP_PER_VEHICLE).reset_index(drop=True)


def run(d: pd.DataFrame, features: list[str], seed: int = 0) -> dict:
    rng = np.random.default_rng(seed)
    rows = {k: {"prior": [], "nopool": [], "pool": [], "better": []} for k in KS}
    tau, sigma, evaluated = [], [], 0
    for tr, te in GroupKFold(5).split(d, d[LABEL], d.vehicle):
        assert not set(d.iloc[tr].vehicle) & set(d.iloc[te].vehicle), "a vehicle is on both sides of the split"
        prior = fit_prior(d.iloc[tr], features, seed)
        tau.append(prior.tau2 ** 0.5); sigma.append(prior.sigma2 ** 0.5)
        test = d.iloc[te]
        for v, g in test.groupby("vehicle"):
            if len(g) < MIN_ROWS:
                continue
            evaluated += 1
            for _ in range(REPEATS):
                idx = rng.permutation(len(g))
                ev, pool_rows = g.iloc[idx[:EVAL_ROWS]], g.iloc[idx[EVAL_ROWS:]]
                y = ev[LABEL].to_numpy()
                base = prior.predict(ev)
                for k in KS:
                    vend = pool_rows.iloc[:k]
                    res = {}
                    for name, pooling in (("nopool", False), ("pool", True)):
                        c = calibrate(prior, vend, pooling)
                        res[name] = base + c.offsets.get(str(v), 0.0)
                    e0 = np.abs(base - y) / y
                    rows[k]["prior"].append(e0.mean())
                    rows[k]["nopool"].append((np.abs(res["nopool"] - y) / y).mean())
                    rows[k]["pool"].append((np.abs(res["pool"] - y) / y).mean())
                    rows[k]["better"].append(rows[k]["pool"][-1] <= e0.mean())
    pct = lambda a: float(np.mean(a) * 100)
    return {"results": [{"n_labels": k, "prior_mape": pct(rows[k]["prior"]), "no_pooling_mape": pct(rows[k]["nopool"]),
                         "partial_pooling_mape": pct(rows[k]["pool"]), "vehicles_not_worse_pct": pct(rows[k]["better"])} for k in KS],
            "tau_ah": float(np.mean(tau)), "sigma_ah": float(np.mean(sigma)), "vehicles_evaluated": evaluated}


def main() -> dict:
    d = load()
    out = {
        "split": "5-fold, vehicles never shared between the fleet fit and the vehicle being calibrated",
        "evaluation": f"{EVAL_ROWS} held-out rows per vehicle; the vendor's labelled rows are drawn from the vehicle's other rows; {REPEATS} random draws",
        "vehicles": int(d.vehicle.nunique()), "rows": int(len(d)),
        "with_snippet_features": run(d, SNIPPET_FEATURES), "mileage_only": run(d, MILEAGE_ONLY),
        "chemistry": "not LFP (cell voltage reaches 4.29 V); method demonstration only",
        "caveat": CAVEAT,
    }
    metrics_store.update("calibration_demo", out)
    return out


if __name__ == "__main__":
    o = main()
    for key in ("with_snippet_features", "mileage_only"):
        print(key, f"tau={o[key]['tau_ah']:.2f} Ah sigma={o[key]['sigma_ah']:.2f} Ah, vehicles={o[key]['vehicles_evaluated']}")
        for r in o[key]["results"]:
            print("  ", {k: round(v, 3) for k, v in r.items()})
