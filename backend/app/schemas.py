"""HTTP contracts. Engine result models are reused as-is so every number keeps its evidence label."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from engine.bus.scenario import Scenario
from engine.bus.translate import CellConditions
from engine.decide.cost import CostResult
from engine.decide.range import RangeResult
from engine.decide.replacement import ReplacementResult
from engine.labels import Labelled
from engine.decide.compare import Delta
from engine.decide.fleet import FleetResult
from engine.decide.recommend import RecommendResult

DISCLAIMER = ("Prior mode: capacity curves come from published laboratory-fitted LFP cell models (NREL BLAST-Lite) and scenario inputs "
              "are assumptions. Nothing here has been validated on buses.")
MAX_DRAWS = 5000


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: str = Field(default="prior", description="Only 'prior' exists in v1; anything else gets a 400")
    scenario: Scenario
    n_draws: int = Field(default=2000, ge=200, le=MAX_DRAWS, description="Monte Carlo draws (lab engine only; the default reference engine runs a fixed 50-run ensemble and ignores n_draws and seed)")
    seed: int = Field(default=0, ge=0, le=2**31 - 1, description="Lab engine only; ignored by the reference engine, which has nothing random")
    range_temperature_mode: Literal["none", "datasheet_example"] = "none"


class DriverSplit(BaseModel):
    calendar_share: Labelled
    cycling_share: Labelled


class PredictionResult(BaseModel):
    mode: Literal["prior"] = "prior"
    model_version: str
    disclaimer: str = DISCLAIMER
    scenario: Scenario
    conditions: CellConditions
    replacement: ReplacementResult
    range: RangeResult
    cost: CostResult
    driver_split: DriverSplit
    warnings: list[str]


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: str = Field(default="prior", description="Only 'prior' exists in v1; anything else gets a 400")
    scenarios: list[Scenario] = Field(min_length=2, max_length=4, description="first scenario is the base; the rest are variants")
    n_draws: int = Field(default=2000, ge=200, le=MAX_DRAWS)
    seed: int = Field(default=0, ge=0, le=2**31 - 1)


class CompareResult(BaseModel):
    mode: Literal["prior"] = "prior"
    model_version: str
    disclaimer: str = DISCLAIMER
    scenarios: list[Scenario]
    replacements: list[ReplacementResult] = Field(description="aligned with `scenarios`; computed on shared random draws")
    deltas: list[Delta] = Field(description="variant minus base, one per variant (months to threshold)")
    notes: list[str]
    warnings: list[str]


class ReportRequest(BaseModel):
    """Two scenarios to compare in the report. The server runs the model itself; nothing the client sends ends up in the document except these inputs."""
    model_config = ConfigDict(extra="forbid")
    scenario_a: Scenario
    scenario_b: Scenario
    fleet_size: int = Field(default=50, ge=1, le=5000, description="buses, only used to scale the money line")


class ReportEmailRequest(ReportRequest):
    to: str = Field(min_length=3, max_length=254, description="one recipient address")


class ReportStatus(BaseModel):
    email_enabled: bool


class ReportSent(BaseModel):
    sent: Literal[True] = True
    to: str = Field(description="the address with its name part masked")


class RecommendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: str = Field(default="prior", description="Only 'prior' exists in v1; anything else gets a 400")
    scenario: Scenario = Field(description="Bus A: the client's current usage")
    reserve_fraction: float = Field(default=0.2, ge=0.0, le=0.5, description="safety reserve on the daily route, at replacement time")
    n_draws: int = Field(default=2000, ge=200, le=MAX_DRAWS)
    seed: int = Field(default=0, ge=0, le=2**31 - 1)


class RecommendResponse(RecommendResult):
    model_version: str
    disclaimer: str = DISCLAIMER


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="seconds")
    username: str


MAX_FLEET_CLASSES = 50
MAX_FLEET_BUSES = 5000


class FleetClass(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64, description="the caller's name for this duty class")
    scenario: Scenario = Field(description="how the buses of this class are driven; its own horizon is replaced by 20 years")


class FleetBus(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64)
    class_id: str = Field(min_length=1, max_length=64)
    in_service: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM the pack entered service; omit if unknown (the bus is then counted as new and flagged)")
    pack_price_inr: float | None = Field(default=None, gt=0, le=1e8, description="this bus's pack price; defaults to the class's pack kWh x price per kWh")


class FleetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: str = Field(default="prior", description="Only 'prior' exists in v1; anything else gets a 400")
    classes: list[FleetClass] = Field(min_length=1, max_length=MAX_FLEET_CLASSES)
    buses: list[FleetBus] = Field(min_length=1, max_length=MAX_FLEET_BUSES)
    as_of: date = Field(default_factory=date.today, description="forecast from this month; financial years run April to March")
    forecast_years: int = Field(default=10, ge=1, le=15, description="the oldest bus's age plus this window must fit inside the model's 20-year horizon")

    @model_validator(mode="after")
    def _consistent(self):
        ids = [c.id for c in self.classes]
        if len(set(ids)) != len(ids):
            raise ValueError("duty class ids must be unique")
        bus_ids = [b.id for b in self.buses]
        if len(set(bus_ids)) != len(bus_ids):
            raise ValueError("bus ids must be unique")
        unknown = sorted({b.class_id for b in self.buses} - set(ids))
        if unknown:
            raise ValueError(f"unknown class_id: {', '.join(unknown[:3])}")
        return self


class FleetReportRequest(FleetRequest):
    """The same body as /fleet, plus an optional name for the cover. The server forecasts the fleet itself; depots and routes never reach it, so they are not in the document."""
    name: str | None = Field(default=None, max_length=80, description="shown on the cover")


class FleetResponse(FleetResult):
    mode: Literal["prior"] = "prior"
    model_version: str
    disclaimer: str = DISCLAIMER
