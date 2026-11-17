"""Evidence labels attached to every number the engine returns (project constraint C3)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

EvidenceLevel = Literal["lab", "assumption", "derived"]


class Labelled(BaseModel):
    """A number (or list of numbers) with its unit and what it rests on.

    lab        = fitted on public laboratory data (never validated on buses)
    assumption = a scenario input or default with no data behind it for buses
    derived    = computed from the above; inherits the weakest evidence of its inputs
    """
    model_config = ConfigDict(frozen=True)
    value: float | list[float]
    unit: str
    evidence_level: EvidenceLevel
    validated_on_buses: Literal[False] = False
    note: str = ""


def L(value, unit: str, level: EvidenceLevel, note: str = "") -> Labelled:
    return Labelled(value=value, unit=unit, evidence_level=level, note=note)


def walk_numbers(obj):
    """Yield every Labelled found in a nested pydantic/dict/list structure (used by label-coverage tests)."""
    if isinstance(obj, Labelled):
        yield obj
    elif isinstance(obj, BaseModel):
        for v in obj.__dict__.values():
            yield from walk_numbers(v)
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from walk_numbers(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from walk_numbers(v)
