#!/usr/bin/env bash
# Creates .venv at repo root and installs the package. Requires Python >= 3.12.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"
if ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)'; then
  echo "need Python >= 3.12 (got: $("$PY" --version 2>&1))" >&2; exit 1
fi
"$PY" -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
.venv/bin/pip install -q -e .
echo "ok: activate with 'source .venv/bin/activate'"
