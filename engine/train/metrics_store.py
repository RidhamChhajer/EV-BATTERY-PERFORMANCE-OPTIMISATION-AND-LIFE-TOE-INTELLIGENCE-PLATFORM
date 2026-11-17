"""Machine-readable metrics written by training/validation scripts (read by the API /evidence endpoint)."""
from __future__ import annotations

import json
import os

PATH = "engine/artifacts/metrics.json"


def update(key: str, value: dict) -> None:
    data = json.load(open(PATH)) if os.path.exists(PATH) else {}
    data[key] = value
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    json.dump(data, open(PATH, "w"), indent=1, sort_keys=True)
