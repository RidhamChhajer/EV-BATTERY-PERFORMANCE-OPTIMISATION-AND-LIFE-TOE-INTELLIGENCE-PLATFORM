#!/usr/bin/env bash
# Rebuilds processed data and all model artifacts. Deterministic (fixed seeds).
set -euo pipefail
cd "$(dirname "$0")/.."
PY=.venv/bin/python
$PY -m engine.data.build
$PY -m engine.train.fit_calendar >/dev/null
$PY -m engine.train.validate_calendar >/dev/null
$PY -m engine.train.fit_cycle >/dev/null
$PY -m engine.train.fit_early_life >/dev/null
$PY -m engine.train.fit_uncertainty >/dev/null
$PY -m engine.train.fit_evb_baseline >/dev/null
$PY -m engine.train.fit_calibration_demo >/dev/null
echo "artifacts rebuilt"
