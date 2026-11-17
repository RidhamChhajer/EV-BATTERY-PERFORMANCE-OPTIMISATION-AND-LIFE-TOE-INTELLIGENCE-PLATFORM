"""Model selection for the early-life predictor (leave-one-cell-out). Usage: python -m engine.train.fit_early_life

Rule fixed in advance: pick the SIMPLEST model whose LOO MAPE is within one bootstrap standard error of the best.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import ElasticNetCV
from sklearn.model_selection import LeaveOneOut, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from engine.cell.early_life import CAP_FEATURES
from engine.train.metrics_store import update

CELLS = "engine/data/processed/hust_cells.parquet"
OUT = "engine/artifacts/early_life.json"
DQ_OLD = ["dQ_var", "dQ_min", "dQ_mean", "dQ_skew"]
DQ3 = ["dQ3_var", "dQ3_min", "dQ3_mean"]
SEED = 0


def _en():
    return make_pipeline(StandardScaler(), ElasticNetCV(l1_ratio=[.1, .5, .9], cv=5, max_iter=50000))


def candidates():
    # ordered from simplest to most complex
    return [
        ("mean only", [], None),
        ("ElasticNet capacity features", CAP_FEATURES, _en),
        ("ElasticNet + dQ(V) all-discharge (Phase 0)", CAP_FEATURES + DQ_OLD, _en),
        ("ElasticNet + dQ(V) discharge_3 step", CAP_FEATURES + DQ3, _en),
        ("GradientBoosting capacity features", CAP_FEATURES,
         lambda: make_pipeline(StandardScaler(), HistGradientBoostingRegressor(max_iter=150, learning_rate=0.05, max_depth=3, random_state=SEED))),
    ]


def main() -> None:
    d = pd.read_parquet(CELLS).dropna(subset=["life"]).reset_index(drop=True)
    y = np.log(d.life.values)
    rng = np.random.default_rng(SEED)
    boots = rng.integers(0, len(d), size=(1000, len(d)))
    rows, errs = [], {}
    for name, cols, make in candidates():
        if not cols:
            p = np.array([np.mean(np.delete(y, i)) for i in range(len(y))])
        else:
            p = cross_val_predict(make(), d[cols].values, y, cv=LeaveOneOut())
        e = np.abs(np.exp(p) - d.life.values) / d.life.values
        errs[name] = e
        bm = e[boots].mean(1)
        rows.append(dict(model=name, mape=float(e.mean() * 100), se=float(bm.std() * 100), within15=float((e < .15).mean() * 100),
                         n_features=len(cols)))
    res = pd.DataFrame(rows)
    best = res.mape.min()
    best_se = res.loc[res.mape.idxmin(), "se"]
    eligible = res[res.mape <= best + best_se]
    winner = eligible.iloc[0]  # list is ordered simplest first
    print(res.round(2).to_string())
    print("winner:", winner.model)
    # paired difference winner vs mean-only
    diff = errs["mean only"] - errs[winner.model]
    db = diff[boots].mean(1)
    print("improvement over mean-only (pct points): %.2f, 95%% CI [%.2f, %.2f]" % (diff.mean() * 100, np.percentile(db, 2.5) * 100, np.percentile(db, 97.5) * 100))
    name, cols = winner.model, dict((n, c) for n, c, _ in candidates())[winner.model]
    art = None
    if cols:
        pipe = _en().fit(d[cols].values, y) if "ElasticNet" in name else None
        if pipe is None:
            raise SystemExit("selected model is not linear; extend the artifact writer before using it")
        sc, en = pipe.steps[0][1], pipe.steps[1][1]
        art = dict(model=name, features=cols, scaler_mean=sc.mean_.tolist(), scaler_scale=sc.scale_.tolist(),
                   coef=en.coef_.tolist(), intercept=float(en.intercept_), alpha=float(en.alpha_), l1_ratio=float(en.l1_ratio_),
                   target="log(cycle life)", n_cells=len(d), loo_mape=float(winner.mape), seed=SEED, synthetic_data=False,
                   importance={c: float(w) for c, w in zip(cols, en.coef_)})
        json.dump(art, open(OUT, "w"), indent=1, sort_keys=True)
    update("early_life", dict(candidates=res.round(3).to_dict("records"), winner=name,
                              improvement_vs_mean_pct_points=float(diff.mean() * 100),
                              improvement_ci95=[float(np.percentile(db, 2.5) * 100), float(np.percentile(db, 97.5) * 100)]))
    if art:
        print(json.dumps(art["importance"], indent=1))


if __name__ == "__main__":
    main()
