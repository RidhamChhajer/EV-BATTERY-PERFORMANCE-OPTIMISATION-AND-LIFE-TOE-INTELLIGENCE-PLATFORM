"""NREL BLAST-Lite LFP degradation models, re-implemented (see NOTICE for source and licence).

Two cell models, both empirical capacity-fade laws fitted by NREL to laboratory ageing tests:

* ``lfp250``  Lfp_Gr_250AhPrismatic: calendar loss ~ time**0.526, cycling loss ~ (equivalent full cycles)**0.828 (both sublinear).
* ``lfpsony`` Lfp_Gr_SonyMurata3Ah_Battery: calendar loss is a saturating sigmoid in time, cycling loss is
  (q5 * EFC)**1.13 (slightly superlinear), plus a break-in term that only acts above 3 full cycles a day.

Capacity = 1 - calendar loss - cycling loss. Rates depend on temperature, state of charge (through the graphite
half-cell potential Ua), depth of discharge and C-rate; the state is advanced step by step.

Differences from the package, on purpose:
* vectorised over a set of "degradation scalars" (BLAST-Lite's own way of expressing cell-to-cell spread);
* stressors may be given as weighted samples (a representative day plus rest days), so a bus year needs no hourly series;
* the Sony resistance model is not ported (the app shows capacity only).
Everything else (equations, parameter values, the y0 == 0 start rules, the "conserve energy throughput" rescaling that
raises depth of discharge as capacity falls) follows the package.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.special import ndtr

SOURCE_URL = "https://github.com/NatLabRockies/BLAST-Lite"
SOURCE_VERSION = "1.1.3"


# ------------------------------------------------------------------ shared helpers
def graphite_potential(soc) -> np.ndarray:
    """Anode-to-reference potential Ua (V) from state of charge (BLAST-Lite ``_get_Ua``: Safari & Delacourt 2011)."""
    xa = 8.5e-3 + np.asarray(soc, dtype=float) * (0.78 - 8.5e-3)
    return (0.6379 + 0.5416 * np.exp(-305.5309 * xa) + 0.044 * np.tanh(-1 * (xa - 0.1958) / 0.1088)
            - 0.1978 * np.tanh((xa - 1.0571) / 0.0854) - 0.6875 * np.tanh((xa + 0.0117) / 0.0529)
            - 0.0175 * np.tanh((xa - 0.5692) / 0.0875))


def _bc(*xs):
    return np.broadcast_arrays(*[np.asarray(x, dtype=float) for x in xs])


def power_state(y0, dx, k, p):
    """dy for y = k * x**p advanced by dx from state y0 (``_update_power_state``)."""
    y0, dx, k, p = _bc(y0, dx, k, p)
    with np.errstate(all="ignore"):
        fresh = k * dx ** p
        later = k * p * (y0 / k) ** ((p - 1) / p) * dx
    return np.where(dx == 0, 0.0, np.where(y0 == 0, fresh, later))


def power_b_state(y0, dx, k, p):
    """dy for y = (k * x)**p (``_update_power_B_state``)."""
    y0, dx, k, p = _bc(y0, dx, k, p)
    with np.errstate(all="ignore"):
        fresh = (k * dx) ** p
        z = (y0 ** (1.0 / p)) / k
        later = (p * (k * z) ** p) / z * dx
    return np.where(dx == 0, 0.0, np.where(y0 == 0, fresh, later))


def sigmoid_state(y0, dx, y_inf, k, p):
    """dy for y = 2 y_inf (1/2 - 1/(1 + exp((k x)**p))) (``_update_sigmoid_state``). NaN steps count as zero, as in the package."""
    y0, dx, y_inf, k, p = _bc(y0, dx, y_inf, k, p)
    with np.errstate(all="ignore"):
        fresh = 2 * y_inf * (0.5 - 1.0 / (1.0 + np.exp((k * dx) ** p)))
        x_inv = (1.0 / k) * (np.log(-(2 * y_inf / (y0 - y_inf)) - 1.0)) ** (1.0 / p)
        z = (k * x_inv) ** p
        later = (2 * y_inf * p * np.exp(z) * z) / (x_inv * (np.exp(z) + 1.0) ** 2) * dx
    later = np.nan_to_num(later, nan=0.0, posinf=0.0, neginf=0.0)
    return np.where(dx == 0, 0.0, np.where(y0 == 0, fresh, later))


def _wavg(x: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Weighted time average over the sample axis (last axis). Weights sum to one."""
    return np.sum(x * w, axis=-1)


# ------------------------------------------------------------------ model definitions
@dataclass(frozen=True)
class LfpModel:
    key: str
    label: str
    package_class: str
    nominal_ah: float
    params: dict
    # tested range, as stated in the package (``experimental_range``)
    cycling_temperature_c: tuple[float, float]
    dod: tuple[float, float]
    max_rate_charge: float
    max_rate_discharge: float
    data_note: str
    data_sources: tuple[str, ...]
    state_names: tuple[str, ...]
    calendar_states: tuple[str, ...]            # which states count as time-driven (calendar) loss


LFP250 = LfpModel(
    key="lfp250", label="LFP/graphite 250 Ah prismatic", package_class="Lfp_Gr_250AhPrismatic", nominal_ah=250.0,
    params={"p1": 8.37e+04, "p2": -5.21e+03, "p3": -3.56e+03, "pcal": 0.526, "p4": 4.38e-08, "p5": 1.55e-08, "p6": 1.68e-07,
            "p7": 2.19e+03, "p8": 1.55e+05, "pcyc": 0.828},
    cycling_temperature_c=(10.0, 45.0), dod=(0.8, 1.0), max_rate_charge=0.65, max_rate_discharge=1.0,
    data_note="NREL tests on a large commercial prismatic LFP/graphite cell (>250 Ah, energy-to-power 6 per hour). Charging was "
              "limited to 0.65 C (0.16 C at 10 degC), so it is only fitted on low-rate data.",
    data_sources=("https://doi.org/10.1016/j.est.2023.109042",),
    state_names=("loss_t", "loss_efc"), calendar_states=("loss_t",))

LFPSONY = LfpModel(
    key="lfpsony", label="LFP/graphite 3 Ah cylindrical (Sony-Murata)", package_class="Lfp_Gr_SonyMurata3Ah_Battery", nominal_ah=3.0,
    params={"q2": 0.000130510034211874, "q1_b0": 0.989687151293590, "q1_b1": -2881067.56019324, "q1_b2": 8742.06309157261,
            "q3_b0": 0.000332850281062177, "q3_b1": 734553185711.369, "q3_b2": -2.82161575620780e-06, "q3_b3": -3284991315.45121,
            "q3_b4": 0.00127227593657290, "q8": 0.00303553871631028, "q9": 1.43752162947637, "q7_b0": 0.582258029148225,
            "q7_soc_skew": 0.0583128906965484, "q7_soc_width": 0.208738181522897, "q7_dod_skew": -3.80744333129564,
            "q7_dod_width": 1.16126260428210, "q7_dod_growth": 25.4130804598602, "q6": 1.12847759334355,
            "q5_b0": -6.81260579372875e-06, "q5_b1": 2.59615973160844e-05, "q5_b2": 2.11559710307295e-06},
    cycling_temperature_c=(20.0, 40.0), dod=(0.8, 1.0), max_rate_charge=1.0, max_rate_discharge=2.0,
    data_note="Technical University of Munich tests on Sony-Murata 3 Ah LFP/graphite cylindrical cells (high power, long life). "
              "Cycling only at 25 and 45 degC, and no temperature effect on cycling fade because of limited data.",
    data_sources=("https://doi.org/10.1016/j.est.2018.01.019", "https://doi.org/10.1016/j.jpowsour.2019.227666",
                  "https://doi.org/10.1149/1945-7111/ac86a8"),
    state_names=("loss_t", "loss_efc", "loss_breakin"), calendar_states=("loss_t",))

MODELS = {m.key: m for m in (LFP250, LFPSONY)}


def initial_state(model: LfpModel, n: int) -> dict[str, np.ndarray]:
    s = {k: np.zeros(n) for k in model.state_names}
    if model.key == "lfpsony":
        s["loss_breakin"] = np.full(n, 1e-10)           # package start value
    return s


def capacity(state: dict[str, np.ndarray]) -> np.ndarray:
    return 1.0 - sum(state.values())


def calendar_loss(model: LfpModel, state: dict[str, np.ndarray]) -> np.ndarray:
    return sum(state[k] for k in model.calendar_states)


# ------------------------------------------------------------------ rates
def rates(model: LfpModel, st: dict) -> dict[str, np.ndarray]:
    """Degradation-rate coefficients from stressors.

    ``st`` holds sample arrays ``t_k`` (K), ``ua`` (V), ``soc`` (shape (..., n)) with ``w`` weights summing to one,
    and scalar-per-member ``dod`` and ``crate`` (shape (...,)). Rates that vary with T and Ua are time-averaged with the
    weights, as the package does with a trapezoid over the segment.
    """
    p, T, Ua, soc, w = model.params, st["t_k"], st["ua"], st["soc"], st["w"]
    dod, crate = np.asarray(st["dod"], dtype=float)[..., None], np.asarray(st["crate"], dtype=float)[..., None]
    if model.key == "lfp250":
        kcal = np.abs(p["p1"]) * np.exp(p["p2"] / T) * np.exp(p["p3"] * Ua / T)
        kcyc = (p["p4"] + p["p5"] * dod + p["p6"] * crate) * (np.exp(p["p7"] / T) + np.exp(-p["p8"] / T))
        return {"kcal": _wavg(kcal, w), "kcyc": _wavg(kcyc, w)}
    sq = np.sqrt(Ua)
    q1 = np.abs(p["q1_b0"] * np.exp(p["q1_b1"] * (1 / T ** 2) * sq) * np.exp(p["q1_b2"] * (1 / T) * sq))
    q3 = np.abs(p["q3_b0"] * np.exp(p["q3_b1"] * (1 / T ** 4) * Ua ** (1 / 3)) * np.exp(p["q3_b2"] * (T ** 3) * Ua ** (1 / 4))
                * np.exp(p["q3_b3"] * (1 / T ** 3) * Ua ** (1 / 3)) * np.exp(p["q3_b4"] * (T ** 2) * Ua ** (1 / 4)))
    q5 = np.abs(p["q5_b0"] + p["q5_b1"] * dod[..., 0] + p["q5_b2"] * np.exp((dod[..., 0] ** 2) * (crate[..., 0] ** 3)))

    def skew(x, skew_, width):
        xp = (x - 0.5) / width
        return 2 * (np.exp(-0.5 * xp * xp) / np.sqrt(2 * np.pi)) * ndtr(skew_ * xp)      # skew-normal density, without scipy.stats overhead

    q7 = np.abs(p["q7_b0"] * skew(soc, p["q7_soc_skew"], p["q7_soc_width"]) * skew(dod, p["q7_dod_skew"], p["q7_dod_width"])
                * (2 * 1 * (0.5 - 1.0 / (1.0 + np.exp((p["q7_dod_growth"] * dod) ** 1)))))
    return {"q1": _wavg(q1, w), "q3": _wavg(q3, w), "q5": q5, "q7": _wavg(q7, w)}


# ------------------------------------------------------------------ state update
def advance(model: LfpModel, state: dict[str, np.ndarray], r: dict[str, np.ndarray], dt_days: float, d_efc, scalar) -> dict[str, np.ndarray]:
    """Advance every member's state by dt_days and d_efc equivalent full cycles."""
    p, s = model.params, state
    d_efc = np.asarray(d_efc, dtype=float)
    if model.key == "lfp250":
        return {"loss_t": s["loss_t"] + scalar * power_state(s["loss_t"], dt_days, r["kcal"], p["pcal"]),
                "loss_efc": s["loss_efc"] + scalar * power_state(s["loss_efc"], d_efc, r["kcyc"], p["pcyc"])}
    d_t = scalar * sigmoid_state(s["loss_t"], dt_days, r["q1"], p["q2"], r["q3"])
    d_e = scalar * power_b_state(s["loss_efc"], d_efc, r["q5"], p["q6"])
    on = (d_efc / dt_days) > 3.0                         # break-in only above 3 full cycles a day
    d_b = np.where(on, scalar * sigmoid_state(s["loss_breakin"], d_efc, r["q7"], p["q8"], p["q9"]), 0.0)
    return {"loss_t": s["loss_t"] + d_t, "loss_efc": s["loss_efc"] + d_e, "loss_breakin": s["loss_breakin"] + d_b}
