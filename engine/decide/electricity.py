"""Electricity cost per km (Layer 4): what the operator pays the utility to charge the bus, from a regulator-published tariff.

Rupees per km = energy used per km / charger efficiency x price per unit. The price is the energy charge shifted by the
time-of-day rule for the hours the bus actually charges, plus the wheeling charge. Every tariff figure comes from
engine/bus/tariffs.json, each with its source. Not included: electricity duty, fuel adjustment charge, taxes and
power-factor penalties. The tariff is per kVAh and is treated as per kWh (unity power factor). Rates are held flat
over the bus's life (undiscounted, same as the battery side)."""
from __future__ import annotations

import json
from dataclasses import dataclass

from pydantic import BaseModel

from engine.bus.scenario import Scenario
from engine.labels import Labelled, L

_DATA = json.load(open("engine/bus/tariffs.json"))
TARIFFS: dict = _DATA["tariffs"]
TOD: dict = _DATA["time_of_day"]
NOT_INCLUDED: list[str] = _DATA["not_included"]


class ElectricityResult(BaseModel):
    tariff: str
    price_inr_per_kwh: Labelled  # effective, after the time-of-day shift
    energy_charge_inr_per_kwh: Labelled
    wheeling_charge_inr_per_kwh: Labelled
    tod_change_pct: Labelled  # change of the energy charge from the hours the bus charges (+ is a premium)
    cost_per_km: Labelled
    grid_kwh_per_km: Labelled
    charge_window: str
    note: str


@dataclass(frozen=True)
class Window:
    start: float
    hours: float


def tod_change(start_hour: float, charge_hours: float) -> float:
    """Average change of the energy charge over a charge that starts at `start_hour` and lasts `charge_hours` at constant power."""
    if charge_hours <= 0:
        return 0.0
    h = min(charge_hours, 24.0)
    total = 0.0
    for day in (0.0, 24.0):  # a charge can run past midnight into the next day's slots
        for slot in TOD["slots"]:
            a, b = slot["from_hour"] + day, slot["to_hour"] + day
            overlap = max(0.0, min(b, start_hour + h) - max(a, start_hour))
            total += overlap * slot["change"]
    return total / h


def hhmm(h: float) -> str:
    t = round((h % 24.0) * 60) % 1440
    return f"{t // 60:02d}:{t % 60:02d}"


def electricity_cost(s: Scenario, charge_hours: float) -> ElectricityResult | None:
    """None when no electricity price is chosen. `charge_hours` is the daily charging time the bus translation already computed."""
    if s.electricity_tariff == "none":
        return None
    if s.electricity_tariff == "custom":
        if s.electricity_custom_inr_per_kwh is None:
            return None
        ec, wc, change, name = s.electricity_custom_inr_per_kwh, 0.0, 0.0, "your own price per kWh, flat all day"
        src = "Your own all-in price per kWh, applied flat: no time-of-day shift."
    else:
        t = TARIFFS[s.electricity_tariff]
        ec, wc, name = t["energy_inr_per_unit"], t["wheeling_inr_per_unit"], t["label"]
        change = tod_change(s.charge_start_hour, charge_hours)
        src = f"{t['source']}. {TOD['notes']}"
    price = ec * (1.0 + change) + wc
    grid = s.kwh_per_km / s.charger_efficiency
    end = s.charge_start_hour + charge_hours
    mk = lambda v, u, lvl="assumption", n="": L(float(v), u, lvl, n)
    return ElectricityResult(
        tariff=name,
        price_inr_per_kwh=mk(price, "INR/kWh", "assumption", "energy charge shifted by the time-of-day rule for the hours the bus charges, plus wheeling charge; per kVAh treated as per kWh"),
        energy_charge_inr_per_kwh=mk(ec, "INR/kWh", "assumption", src),
        wheeling_charge_inr_per_kwh=mk(wc, "INR/kWh", "assumption"),
        tod_change_pct=mk(change * 100.0, "%", "derived", "average change of the energy charge over the hours the bus charges: + premium, - rebate"),
        cost_per_km=mk(grid * price, "INR/km", "derived", "energy per km / charger efficiency x price per unit"),
        grid_kwh_per_km=mk(grid, "kWh/km", "derived", "energy per km / charger efficiency"),
        charge_window=f"{hhmm(s.charge_start_hour)} to {hhmm(end)}",
        note="Not included: " + ", ".join(NOT_INCLUDED) + ".")
