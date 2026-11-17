"""Scenario schema: every field is a user input or archetype default, i.e. an ASSUMPTION about a bus."""
from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ZONES = ("hot_dry", "hot_humid", "composite", "cool")
_ARCH = json.load(open("engine/bus/archetypes.json"))["archetypes"]


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid")
    archetype: Literal["12m", "9m"] = "12m"
    pack_kwh: float = Field(gt=20, le=700, description="nominal pack energy, kWh")
    kwh_per_km: float = Field(gt=0.2, le=3.0)
    km_per_day: float = Field(gt=0, le=700)
    operating_days_per_year: float = Field(gt=50, le=366)
    soc_min_pct: float = Field(ge=0, le=60, default=10.0)
    soc_max_pct: float = Field(ge=40, le=100, default=100.0)
    charge_power_kw: float = Field(gt=1, le=500)
    charge_start_hour: float = Field(ge=0, lt=24, default=22.0)
    departure_hour: float = Field(ge=0, lt=24, default=5.0)
    zone: Literal["hot_dry", "hot_humid", "composite", "cool"] = "hot_dry"
    heat_rise_c: float = Field(ge=0, le=20, default=3.0, description="ASSUMED average cell temperature above ambient")
    pack_penalty_min: float = Field(ge=0, le=0.5, default=0.20, description="ASSUMED weakest-cell earlier-end-of-life fraction (NREL: pack life is 20-30 % shorter than cell life)")
    pack_penalty_max: float = Field(ge=0, le=0.5, default=0.30)
    battery_cost_per_kwh_inr: float | None = Field(default=None, gt=0)
    charger_efficiency: float = Field(ge=0.7, le=1.0, default=0.92, description="ASSUMED share of grid energy that reaches the battery (charger and cable losses)")
    electricity_tariff: Literal["none", "msedcl_ht_ix", "msedcl_lt_viii", "custom"] = Field(default="none", description="Electricity tariff the operator pays; 'none' leaves electricity out of the cost per km")
    electricity_custom_inr_per_kwh: float | None = Field(default=None, gt=0, le=50, description="All-in price per kWh, used only when electricity_tariff is 'custom'")
    threshold: float = Field(gt=0.5, lt=0.95, default=0.8, description="replace when retention falls to this")
    horizon_years: int = Field(ge=1, le=20, default=15)

    @model_validator(mode="after")
    def _checks(self):
        if self.soc_max_pct - self.soc_min_pct < 10:
            raise ValueError("soc_max_pct must exceed soc_min_pct by at least 10 points")
        if self.pack_penalty_max < self.pack_penalty_min:
            raise ValueError("pack_penalty_max must be >= pack_penalty_min")
        return self

    @classmethod
    def from_preset(cls, archetype: str = "12m", **overrides) -> "Scenario":
        if archetype not in _ARCH:
            raise ValueError(f"unknown archetype {archetype!r}")
        a = _ARCH[archetype]
        base = dict(archetype=archetype, **{k: a[k]["value"] for k in
                    ("pack_kwh", "kwh_per_km", "km_per_day", "charge_power_kw", "operating_days_per_year")})
        base.update(overrides)
        return cls(**base)
