#!/usr/bin/env bash
# Builds the frontend (unless it is already built) and serves the API and the app together on one port.
# Usage: scripts/run_all.sh            (port 8000)    PORT=8010 scripts/run_all.sh    REBUILD=1 scripts/run_all.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8000}"
[ -x .venv/bin/uvicorn ] || { echo "No .venv found. Run scripts/setup_env.sh first." >&2; exit 1; }
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  echo "Port $PORT is already in use. Stop the other program or choose another port: PORT=8010 scripts/run_all.sh" >&2
  exit 1
fi
if [ "${REBUILD:-}" = "1" ] || [ ! -f frontend/dist/index.html ]; then
  command -v npm >/dev/null || { echo "npm is needed to build the frontend (install Node 20 or newer)." >&2; exit 1; }
  (cd frontend && { [ -d node_modules ] || npm ci; } && npm run build)
fi
echo "Pack Horizon is starting on http://localhost:$PORT  (health check: /api/v1/health)"
exec .venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port "$PORT"
