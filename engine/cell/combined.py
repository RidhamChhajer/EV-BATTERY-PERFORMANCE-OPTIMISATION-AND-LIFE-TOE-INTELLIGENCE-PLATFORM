"""Additive combination of calendar and cycle loss (documented assumption: the two mechanisms add)."""
from __future__ import annotations

import numpy as np

from engine.cell.calendar import CalendarParams, calendar_loss
from engine.cell.calendar import is_extrapolated as cal_extrap
from engine.cell.cycle import CycleParams, cycle_loss
from engine.cell.cycle import is_extrapolated as cyc_extrap


def total_loss(t_days, efc, temp_c, soc_pct, c_rate, cal: CalendarParams, cyc: CycleParams):
    """Returns (total, calendar, cycle) fractional loss, total clipped to [0, 1]."""
    lc = calendar_loss(t_days, temp_c, soc_pct, cal)
    ly = cycle_loss(efc, temp_c, c_rate, cyc)
    return np.clip(lc + ly, 0.0, 1.0), lc, ly


def extrapolated(t_days, efc, temp_c, soc_pct, c_rate, cal: CalendarParams, cyc: CycleParams):
    return cal_extrap(temp_c, soc_pct) | cyc_extrap(efc, temp_c, c_rate, cyc)
