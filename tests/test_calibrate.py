import json
import os

import numpy as np
import pandas as pd
import pytest

from engine.calibrate.features import REQUIRED, VendorFileError, prepare, validate
from engine.calibrate.model import calibrate, fit_prior


def frame(n_veh=6, n=40, seed=0, with_label=True) -> pd.DataFrame:
    """Interface-test frame only. Never used to train anything that ships."""
    r = np.random.default_rng(seed)
    rows = []
    for v in range(n_veh):
        off = r.normal(0, 1.0)
        m = r.uniform(5e3, 2e5, n)
        dsoc = r.uniform(5, 40, n)
        rows.append(pd.DataFrame({"vehicle": f"1_{v}", "mileage": m, "dsoc": dsoc, "soc0": r.uniform(20, 80, n),
                                  "vmean": r.uniform(3.6, 4.1, n), "v0": r.uniform(3.6, 4.1, n), "v1": r.uniform(3.6, 4.1, n),
                                  "imean": r.uniform(-100, -5, n), "dvm": r.uniform(.01, .05, n), "dvx": r.uniform(.02, .08, n),
                                  "tmean": r.uniform(5, 35, n), "tspan": r.uniform(1, 6, n), "ah": dsoc * 0.41,
                                  "capacity": 42 - m / 1e5 + off + r.normal(0, .5, n) if with_label else np.nan}))
    return pd.concat(rows, ignore_index=True)


def test_missing_column_is_named():
    bad = frame().drop(columns=["vmean", "tspan"])
    with pytest.raises(VendorFileError, match="vmean, tspan"):
        validate(bad)


def test_milliamp_hours_are_rejected():
    d = frame()
    d["capacity"] = d["capacity"] * 1000
    with pytest.raises(VendorFileError, match="mAh"):
        validate(d)


def test_unusable_rows_are_dropped():
    d = frame()
    d.loc[0, "dsoc"] = 1.0
    d.loc[1, "ah"] = np.nan
    assert len(prepare(d)) == len(d) - 2


def test_empty_vendor_file_returns_prior_unchanged_with_warning():
    prior = fit_prior(frame())
    c = calibrate(prior, frame().iloc[0:0])
    assert c.offsets == {} and any("no rows" in w for w in c.warnings)
    probe = frame(seed=3).iloc[:20]
    out = c.predict(probe)
    assert np.allclose(out.calibrated_ah, out.prior_ah)


def test_unlabelled_vendor_file_returns_prior_unchanged_with_warning():
    prior = fit_prior(frame())
    c = calibrate(prior, frame(seed=2, with_label=False))
    assert c.offsets == {} and any("no labelled rows" in w for w in c.warnings)


def test_weight_grows_with_labels_and_never_reaches_one():
    p = fit_prior(frame())
    w = [p.weight(n) for n in (0, 1, 5, 20, 100, 10_000)]
    assert w[0] == 0 and all(a < b for a, b in zip(w, w[1:])) and w[-1] < 1


def test_partial_pooling_moves_less_than_plain_average():
    prior = fit_prior(frame())
    v = frame(n_veh=1, n=5, seed=9)
    v["vehicle"] = "x"
    v["capacity"] += 3.0                       # a vehicle that is clearly different from the fleet
    pooled, plain = calibrate(prior, v, True), calibrate(prior, v, False)
    assert 0 < pooled.offsets["x"] < plain.offsets["x"]
    assert pooled.n_labels["x"] == 5


def test_few_labels_raise_a_warning():
    prior = fit_prior(frame())
    v = frame(n_veh=1, n=3, seed=4)
    assert any("fewer than 5" in w for w in calibrate(prior, v).warnings)


@pytest.mark.data
def test_demo_metrics_are_stored_with_the_caveat_and_show_the_expected_pattern():
    if not os.path.exists("engine/artifacts/metrics.json"):
        pytest.skip("run scripts/train_all.sh")
    m = json.load(open("engine/artifacts/metrics.json")).get("calibration_demo")
    if m is None:
        pytest.skip("run python -m engine.train.fit_calibration_demo")
    assert "not LFP" in m["chemistry"] and "method demonstration" in m["caveat"]
    r = {x["n_labels"]: x for x in m["with_snippet_features"]["results"]}
    assert r[0]["partial_pooling_mape"] == pytest.approx(r[0]["prior_mape"])
    assert r[5]["partial_pooling_mape"] < r[0]["prior_mape"]
    assert r[100]["partial_pooling_mape"] <= r[5]["partial_pooling_mape"]
    assert r[5]["partial_pooling_mape"] <= r[5]["no_pooling_mape"] + 1e-6   # shrinkage is never worse on average
