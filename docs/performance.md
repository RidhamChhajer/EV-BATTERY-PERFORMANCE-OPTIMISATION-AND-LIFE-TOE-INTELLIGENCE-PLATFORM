# Performance (Phase 8.2)

Measured on the development laptop (Apple silicon, other applications running), in-process with no network, by `python scripts/perf_check.py`.

| Check | Result | Budget |
|---|---|---|
| `/predict`, 50 sequential calls, a different scenario each time so the response cache cannot help (reference engine: 50 runs per scenario; the lab engine measured 0.07 s) | median 0.22 s, p95 0.22 s, max 0.22 s | p95 under 2 s |
| 20 parallel workers × 5 calls (100 requests) | all 200, zero 5xx, slowest request 9.6 s, 21.7 s wall | zero 5xx |
| `/recommend`, one uncached call on the default 12 m bus (Optimise page) | 0.75 s | none set |
| Frontend first load (built) | app code 85 kB gzipped; the 3D scene (three.js, 240 kB gzipped) loads only on Overview and Optimise | no hard budget set |

Notes
- The 9.6 s slowest request under 20-way parallel load is requests queueing behind each other on one process, not a slow request; one call alone takes about 0.2 s. With the NREL engine each uncached prediction simulates the scenario and its sensitivity variants, so it is about three times slower than the lab model was. Repeated inputs are served from a cache. A small hosted server (Render free plan, about a tenth of a CPU) will be slower still, probably several seconds for `/recommend`; that was not measured.
- **Lighthouse was not run.** It needs a headless Chrome and a download of the tool. Bundle size and load behaviour are reported above instead. Run `npx lighthouse http://localhost:8000 --preset=desktop` against the packaged app (Phase 8.3) if a score is wanted.
- These numbers are from one machine and one run. They show the sequential budget is met with a wide margin; the parallel worst case is long and was not tuned. They are not a guaranteed figure for other hardware.
