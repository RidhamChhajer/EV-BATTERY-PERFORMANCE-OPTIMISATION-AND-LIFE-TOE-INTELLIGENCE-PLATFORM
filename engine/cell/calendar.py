"""Semi-empirical calendar ageing: loss = A * exp(-(Ea/R)(1/T - 1/Tref)) * g(SOC) * t^z.

loss is the fraction of capacity lost (retention = 1 - loss). t in days, T in deg C.
g(SOC) is piecewise linear on SOC_NODES with g(50) = 1, so A is the loss rate at 25 C and 50 % SOC.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

R = 8.314
TREF = 298.15
SOC_NODES = np.array([0.0, 25.0, 50.0, 75.0, 100.0])
VALID_T = (0.0, 85.0)
VALID_SOC = (0.0, 100.0)


@dataclass(frozen=True)
class CalendarParams:
    logA: float
    Ea: float          # J/mol
    z: float
    g0: float
    g25: float
    g75: float
    g100: float

    def vector(self) -> np.ndarray:
        return np.array([self.logA, self.Ea, self.z, self.g0, self.g25, self.g75, self.g100])

    @staticmethod
    def from_vector(v) -> "CalendarParams":
        return CalendarParams(*[float(x) for x in v])

    def to_dict(self) -> dict:
        return asdict(self)


def g_soc(soc, p: CalendarParams):
    vals = np.array([p.g0, p.g25, 1.0, p.g75, p.g100])
    return np.interp(np.asarray(soc, dtype=float), SOC_NODES, vals)


def calendar_loss(t_days, temp_c, soc_pct, p: CalendarParams):
    """Fractional capacity loss from storage. Raises ValueError for negative time."""
    t = np.asarray(t_days, dtype=float)
    if np.any(t < 0):
        raise ValueError("time must be >= 0")
    T = np.asarray(temp_c, dtype=float) + 273.15
    arr = np.exp(p.logA) * np.exp(-(p.Ea / R) * (1.0 / T - 1.0 / TREF))
    return arr * g_soc(soc_pct, p) * t ** p.z


def is_extrapolated(temp_c, soc_pct) -> np.ndarray:
    T, S = np.asarray(temp_c, dtype=float), np.asarray(soc_pct, dtype=float)
    return (T < VALID_T[0]) | (T > VALID_T[1]) | (S < VALID_SOC[0]) | (S > VALID_SOC[1])


def calendar_loss_flagged(t_days, temp_c, soc_pct, p: CalendarParams):
    """Return (loss, extrapolated). Never silently extrapolates."""
    return calendar_loss(t_days, temp_c, soc_pct, p), is_extrapolated(temp_c, soc_pct)
