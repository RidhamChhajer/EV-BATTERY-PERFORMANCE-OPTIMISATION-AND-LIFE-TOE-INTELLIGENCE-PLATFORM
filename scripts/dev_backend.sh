#!/usr/bin/env bash
cd "$(dirname "$0")/.." && exec .venv/bin/uvicorn backend.app.main:app --port "${PORT:-8000}" --reload
