"""Calibrated mode, as a method: a fleet model (the prior) plus a shrunken per-vehicle offset learned from a vendor's labels.

    capacity = fleet_model(mileage, snippet features) + b_vehicle,   b_vehicle ~ N(0, tau^2)

The fleet model is a gradient-boosted regressor. Its residuals on vehicles it has not seen give the two variance
components (between vehicles tau^2, within a vehicle sigma^2) through a mixed model with a vehicle random intercept.
A vendor vehicle with n labelled rows then gets the standard partial-pooling estimate

    b = n tau^2 / (n tau^2 + sigma^2) * mean(residual over its n labelled rows)

so few labels move the prediction a little, many labels move it a lot, and zero labels leave the prior untouched.
Labels are the dataset's own derived capacity, not measured ground truth. Not LFP, not validated on buses.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold

from engine.calibrate.features import LABEL, MILEAGE_ONLY, SNIPPET_FEATURES, prepare

CAVEAT = "NMC-like field data, capacity labels derived by the dataset authors: a method demonstration, not a result for LFP buses."


def _gbm(seed: int) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08, random_state=seed)


def variance_components(resid: np.ndarray, vehicle: np.ndarray) -> tuple[float, float]:
    """(tau^2, sigma^2) from residuals that were NOT used to fit the model that produced them."""
    df = pd.DataFrame({"r": resid, "v": vehicle})
    fit = smf.mixedlm("r ~ 1", df, groups=df["v"]).fit(reml=True, method="lbfgs")
    tau2 = max(float(fit.cov_re.iloc[0, 0]), 1e-9)
    return tau2, max(float(fit.scale), 1e-9)


@dataclass
class FleetPrior:
    model: HistGradientBoostingRegressor
    features: list[str]
    tau2: float
    sigma2: float
    n_vehicles: int
    n_rows: int

    def predict(self, d: pd.DataFrame) -> np.ndarray:
        return self.model.predict(d[self.features])

    def weight(self, n: int) -> float:
        """Share of a vehicle's own average residual that is trusted when it has n labelled rows."""
        return 0.0 if n <= 0 else n * self.tau2 / (n * self.tau2 + self.sigma2)


def fit_prior(frame: pd.DataFrame, features: list[str] | None = None, seed: int = 0, inner_folds: int = 5) -> FleetPrior:
    """Fit the fleet model and its variance components. Residuals for the components come from an inner vehicle-grouped
    cross-fit, because a boosted model's residuals on its own training vehicles are far too small."""
    feats = features or SNIPPET_FEATURES
    d = prepare(frame)
    d = d[d[LABEL] > 0].reset_index(drop=True)
    if d.vehicle.nunique() < inner_folds:
        raise ValueError(f"need labelled rows from at least {inner_folds} vehicles to fit a prior")
    y, g = d[LABEL].to_numpy(), d.vehicle.to_numpy()
    oof = np.zeros(len(d))
    for tr, te in GroupKFold(inner_folds).split(d, y, g):
        oof[te] = _gbm(seed).fit(d.iloc[tr][feats], y[tr]).predict(d.iloc[te][feats])
    tau2, sigma2 = variance_components(y - oof, g)
    return FleetPrior(_gbm(seed).fit(d[feats], y), feats, tau2, sigma2, int(d.vehicle.nunique()), len(d))


@dataclass
class Calibration:
    prior: FleetPrior
    offsets: dict[str, float] = field(default_factory=dict)
    n_labels: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def predict(self, frame: pd.DataFrame) -> pd.DataFrame:
        """Capacity (Ah) per usable row: the prior, the vehicle offset, and the calibrated value."""
        d = prepare(frame)
        base = self.prior.predict(d)
        off = d.vehicle.map(self.offsets).fillna(0.0).to_numpy()
        return pd.DataFrame({"vehicle": d.vehicle, "prior_ah": base, "offset_ah": off, "calibrated_ah": base + off})


def calibrate(prior: FleetPrior, vendor_frame: pd.DataFrame, pooling: bool = True) -> Calibration:
    """Adjust the prior with a vendor's labelled rows. An empty file returns the prior unchanged, with a warning.
    pooling=False gives the plain per-vehicle average residual (kept so the demo can show why shrinkage helps)."""
    out = Calibration(prior)
    if len(vendor_frame) == 0:
        out.warnings.append("vendor file has no rows: the prior is returned unchanged")
        return out
    d = prepare(vendor_frame)
    lab = d[d[LABEL] > 0]
    if lab.empty:
        out.warnings.append("vendor file has no labelled rows (capacity): the prior is returned unchanged")
        return out
    r = lab[LABEL].to_numpy() - prior.predict(lab)
    for v, idx in lab.groupby("vehicle").indices.items():
        n = len(idx)
        m = float(r[idx].mean())
        out.offsets[str(v)] = prior.weight(n) * m if pooling else m
        out.n_labels[str(v)] = n
    few = [v for v, n in out.n_labels.items() if n < 5]
    if few:
        out.warnings.append(f"{len(few)} vehicle(s) have fewer than 5 labelled rows; their offsets are heavily shrunk toward the prior")
    return out
