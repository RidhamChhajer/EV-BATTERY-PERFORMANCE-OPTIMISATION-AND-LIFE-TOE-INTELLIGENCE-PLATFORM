"""Latency and load check against an in-process app (no network). Run: python scripts/perf_check.py
50 sequential /predict calls with a different km_per_day each (so the response cache cannot hide the cost), then 20 workers x 5 calls."""
import os
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.getcwd())
os.environ["EV_AUTH_REQUIRED"] = "false"
from fastapi.testclient import TestClient

from backend.app.main import create_app
from engine.bus.scenario import Scenario

base = Scenario.from_preset("12m", battery_cost_per_kwh_inr=12000).model_dump()


def call(c, i, n_draws=2000):
    t = time.perf_counter()
    r = c.post("/api/v1/predict", json={"scenario": {**base, "km_per_day": 150 + (i % 97) * 1.3}, "n_draws": n_draws})
    return r.status_code, time.perf_counter() - t


def p95(xs):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(0.95 * (len(xs) - 1))))]


with TestClient(create_app()) as c:
    call(c, 0)  # warm-up
    seq = [call(c, i + 1) for i in range(50)]
    t = [x[1] for x in seq]
    print(f"sequential x50  statuses={sorted({s for s, _ in seq})} median={statistics.median(t):.2f}s p95={p95(t):.2f}s max={max(t):.2f}s")
    t0 = time.perf_counter()
    with ThreadPoolExecutor(20) as ex:
        res = list(ex.map(lambda i: call(c, 1000 + i), range(100)))
    el = time.perf_counter() - t0
    st = [s for s, _ in res]
    print(f"parallel 20x5   statuses={sorted(set(st))} 5xx={sum(s >= 500 for s in st)} wall={el:.1f}s slowest={max(x[1] for x in res):.1f}s")
