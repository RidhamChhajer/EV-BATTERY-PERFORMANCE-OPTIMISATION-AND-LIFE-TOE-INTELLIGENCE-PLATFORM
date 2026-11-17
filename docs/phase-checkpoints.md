# Phase checkpoints

Records of each phase's completion checkpoint (the tables in `docs/development-playbook.md` stay as blank templates).
Phases 4 to 6 are recorded here so far; earlier phases are identifiable by their `cp-*` git tags.

## Phase 4: Backend API (complete)

| Item | Record |
|---|---|
| Completed milestones | 4.1 skeleton (`cp-4.1` = 3d61e30), 4.2 `/predict` (`cp-4.2` = bc8aab1), 4.3 compare/presets/zones/evidence (`cp-4.3` = ca6ddc7) |
| Tests passed | 181 / 181 in the whole repository (65 of them are API tests: 17 skeleton, 32 predict, 16 reference) |
| Overall verification | `scripts/smoke_api.sh` passes against a live server; `uvicorn` starts in about 0.5 s; `/docs` loads; chunked and Content-Length oversized bodies give 413 on a live server |
| Go/No-Go | **GO**: `docs/openapi.json` is generated from the app and a test fails if it drifts; the label-coverage test passes for both archetypes in all four zones |

### Deviations from the playbook (all intentional)
- Routes live in one file `backend/app/routes.py` (not a `routes/` package) and API tests are in `tests/test_api_*.py` (not `backend/tests/`), to keep one pytest root.
- The playbook says 413 for oversized bodies; the limit is a streaming ASGI middleware so it also covers chunked uploads, which a Content-Length check alone misses.
- Added an optional `mode` request field so an unsupported mode returns 400 (SDD section 6.2); only `"prior"` exists in v1.
- T4.3-3 needed the EVBattery capacity error in `metrics.json`; added `engine/train/fit_evb_baseline.py` (run by `scripts/train_all.sh`) which stores it. It reproduces Phase 0 (2.50 % mileage only, 2.30 % with snippet features; the Phase 0 report quotes 2.29 % from truncation).
- `/evidence`, `/presets` and `/zones` read their files on every request, so a changed `metrics.json` shows up without a restart (T4.3-8). `model_version` and `/health` hashes are taken at startup.

### Known issues carried into the frontend phases
- No authentication (by design); the prediction cache is in memory and per process.
- Unhandled-exception 500 responses come from Starlette's outermost handler, which sits outside CORS: a browser may show them as a CORS error instead of the JSON message. The frontend error UI should treat a failed fetch with no response as "server error".
- Requests with a horizon shorter than the time to threshold produce percentile warnings from numpy (harmless; the API returns `null` for percentiles beyond the horizon).
- Port 8765 was occupied by an unrelated local Python process during testing; `smoke_api.sh` now picks a free port.


## Phase 4.4: `/recommend` and demo login (complete, `cp-4.4`)

| Item | Record |
|---|---|
| What was added | `POST /recommend` (goal presets from a search over charge cap and charging start time, with a separate "needs confirmation" step for cooling and energy use); bearer-token demo login (`/auth/login`, `/auth/me`) with a login rate limit |
| Tests passed | 200 / 200 in the whole repository |
| Go/No-Go | **GO** |

### Findings that shaped the design
- **Levers were chosen from measured effect, not guessed.** Charge cap and charging start time move battery life in the model; charger power moves it by at most 0.2 months (the cycling data show no charge-speed effect); minimum charge has no depth-of-discharge effect in the training cells, so it would look free and is never suggested; daily distance is a service level. The last three are listed in the response as `not_used`, with reasons.
- **The default 12 m bus (200 km a day, 350 kWh) fails the 20 % reserve rule on its own**: about 210 km of range at replacement against 240 km needed. When Bus A already fails, suggestions are held to Bus A's own range and the UI says so in plain words.
- **Several goals can land on identical advice** on a range-tight route. The API returns `same_as` and the UI shows a short pointer instead of repeated cards.

## Phase 5 and 6: Frontend (complete for the build; visual polish is a separate pass)

| Item | Record |
|---|---|
| Completed milestones | 5.1-5.3 scaffold, login, floating glass nav, scenario panel with CSV import, Health / Replacement / Range / Cost / Evidence (`cp-5.3`); 6.x 3D Overview and Optimise compare (`cp-6.2`) |
| Tests passed | 82 frontend tests (colour ramp, Bus B overrides and preset helpers on the real `/recommend` result, wording helpers, page tests including the Optimise flow and the no-WebGL fallback) |
| Checks | `npm run lint`, `npm run typecheck`, `npm test -- --run`, `npm run build` all clean; checked live against the backend in the browser pane at desktop width and 390 px |

### Deviations from the SDD and playbook (all intentional)
- **Plain CSS with design tokens instead of Tailwind.** The visual design is a small set of hand-tuned tokens and a custom glass navigation bar; a utility framework added more than it saved.
- **Charts are custom SVG, not Recharts or visx** (this closes the open item in SDD section 13). The charts need a shared year crosshair, tweening between scenarios and a table alternative for every chart, which was simpler to build directly than to bend a library to.
- **No zustand.** React context for scenario, year and sign-in, plus react-query for every API call, was enough.
- **The 3D chunk is large (about 240 kB gzipped)** because of three.js. It is loaded only on Overview and Optimise; the rest of the app is under 100 kB gzipped. `chunkSizeWarningLimit` is raised for that one chunk.

### Honest limits of the 3D view
- The model predicts one health figure for the whole pack, so every module shows the same colour. The inspector says this. Module layout and the cell grid are a schematic, not a real design.
- The roof air-conditioning unit is drawn for context only; the model has no air-conditioning data.
- On the Optimise page, Bus B's slider changes are checked against the engine's own warnings (for example "charging not finished before departure") and against the route rule, and both are shown in plain words.

### Known issues carried into the next phases
- Visual polish is still to do (the user asked for a separate pass once the build is complete).
- Accessibility audit, `npm audit` and packaging (Phase 8) are not done yet.
- (Done in Phase 7.2: the calibration demo is on the Evidence page.)
- Docker is not installed on the development machine, so optional container packaging is untested.

## Phase 6.3: Visual polish pass (`cp-6.3`)

- Bus B and 3D-view sliders now share the scenario panel's slider style; keyboard users can select a battery pack with buttons (3D picking was mouse-only); the idle inspector card that sat on top of the bus is replaced by a hint line.
- Fixed: allowing cooling and energy-use changes while a goal was on Bus B left Bus B on the old settings and dropped the goal highlight. The toggle now re-applies the active goal (test added).
- Phone layout for the 3D view: toolbar rows scroll sideways, shorter stage, inspector as a bottom sheet, camera backs off on narrow screens, legend inside the canvas.
- Browser surfaces themed (scrollbars, caret), balanced headings, larger touch targets on coarse pointers, and the overshooting "spring" easing replaced with exponential ease-out (design detector: clean).
- Removed at the user's request (follow-up commit): the small section label above each page heading; the top bar already shows the current page.

## Phase 6.5: Full-screen 3D pages (`cp-6.5`)

- Overview and Optimise are now full-viewport 3D scenes. Everything else floats over the scene: the two honesty chips and a vertical dock of panel buttons at top left, a key-number strip at top right, the year scrubber and colour legend at the bottom.
- Settings moved into drawers opened from the dock (Bus A, Bus B, Goals, Details, View) so the page starts uncluttered. Opening a drawer slides the 3D picture sideways so the bus stays centred in the free space; adopting a goal closes the drawer so the change on Bus B is visible at once.
- Optimise: the route-check sentence sits in the Goals drawer (and as an orange chip when the route is already tight); the health chart and the "what we did not change" list moved into Details.
- Phones: drawers become bottom sheets, the dock is a single row, the stat strip scrolls sideways, non-essential 3D labels are hidden.
- Removed the old card grid, toolbar, per-page intro text and footer on these two pages. The other pages are unchanged.
- Tests rewritten to open the drawers (84 frontend tests pass). Design detector: clean.

## Phase 7.2: Calibration method demonstration (`cp-7.2`)

- New `engine/calibrate/` (`features.py`, `model.py`): `fit_prior` (gradient-boosted fleet model plus mixed-model variance components from cross-fitted residuals) and `calibrate(prior, vendor_frame)` (per-vehicle offset, shrunk toward the prior). Bad vendor files are refused with a message naming the problem; an empty or unlabelled file returns the prior unchanged with a warning.
- `python -m engine.train.fit_calibration_demo` runs a vehicle-grouped experiment on EVBattery and stores it as `calibration_demo` in `metrics.json` (served by `/evidence`). Result: capacity error 2.19 % with no labels, 1.55 % with 5 labelled records, 1.41 % with 100; no worse for 75 % of vehicles at 5 labels. Shrinkage helps only slightly on average (1.55 % vs 1.57 %).
- The Evidence page has a new "What vendor data would change" card driven entirely by the API, with the not-LFP, derived-label caveat beside it.
- `docs/calibration-interface.md` documents the vendor file contract and the honest reading of the numbers.
- Deviation: a script instead of a notebook, because Jupyter is not installed (noted in the interface doc).
- Tests: 210 backend (9 new in `tests/test_calibrate.py`, 1 new API test), 85 frontend (1 new). Calibrated mode stays out of the app by design.

## Phase 8.1: Accessibility (`cp-8.1`, fix `cp-8.1.1`)

- axe-core scans of every page in a real browser: 0 violations after fixes (heading order, landmarks, account-button name). The same scans run in the test suite (`a11y.test.tsx`) with keyboard checks (skip link, drawer focus in and out). Contrast ratios computed from the tokens: all at least 5.2:1.
- Fixed: Evidence page overflow at 375 px, `transition: all`, scroll containment in panels, tabular numerals, safe-area padding, theme colour. Notes and what was not done (Playwright, screen-reader listening) in `docs/accessibility.md`.
- `cp-8.1` shipped a stylesheet typo that broke the production build (tests do not parse CSS); `cp-8.1.1` fixes it. From here the full check list includes `npm run build`.
- Test suite timeouts raised to 5 s because slow lazy chunks made tests flaky on a busy machine.

## Phase 8.2: Performance and security (`cp-8.2`)

- `/predict` p95 0.08 s over 50 calls (budget 2 s); 100 requests at 20-way parallel gave zero 5xx (`scripts/perf_check.py`, `docs/performance.md`). Lighthouse not run.
- Security: the token key no longer has a public default (random per process unless `EV_AUTH_SECRET` is set); security headers on every response; `pip-audit` and `npm audit --omit=dev` clean; `gitleaks` over history clean. Ten moderate advisories remain in dev-only linting tools, accepted (`docs/security-review.md`).
- Tests: 216 backend (6 new), 95 frontend.

## Phase 8.3: One-command local run (`cp-8.3`)

- `scripts/run_all.sh` builds the frontend if needed and serves the API and the built app together on one port (`PORT=8010 scripts/run_all.sh` to change it). It refuses to start, with a clear message and a non-zero exit, when the port is taken or `.venv` is missing.
- `backend/app/static.py`: the API serves `frontend/dist` (override with `EV_STATIC_DIR`), with single-page-app fallback, a year of caching for hashed assets, no caching for `index.html`, and path-traversal protection. Without a build folder it stays API-only.
- Checked by running it: health 200, `/optimise` reload 200, traversal attempts 404, security headers present, and `/predict` works with the `data/` folder moved away (the app needs only the small committed model files). The built page references no external host, so it runs offline.
- Not done: a hosted deployment and `render.yaml` (optional in the playbook, and a hosting choice is yours); Docker is not installed. Marked "not deploying".
- Tests: 226 backend (10 new in `tests/test_static.py`). `cp-8.3` was tagged while two older tests failed (the frontend catch-all route shadowed routes those tests add after startup); `cp-8.3.1` fixes the tests.

## Phase 8.4: Documentation and release (`v1.0.0`)

- README rewritten: purpose, screenshots from the running app, quick start verified from a fresh clone (setup, `run_all.sh`, sign in, `/predict` gives the same result as the development copy with the same model version), tests, limits, licence and authorship. New `CHANGELOG.md` and `docs/data-attribution.md`; SDD gets a deviations table; model card status updated.
- Claims audit: every figure in the README limits section (12.7 % and 17.7 % cycle-life error, 72.5 % and 79.6 % band coverage, factor 1.5, 77 cells) matches `metrics.json` and the model card. No dead local links.
- Authorship: `git log` shows one author (RidhamChhajer) and no co-author or generated-with lines.
- Licence: no licence file, by the owner's choice (all rights reserved; datasets keep their own licences).
- Not done: dead-link check of external URLs (`markdown-link-check` not run), hosted deployment, screen-reader listening tests, Lighthouse score.

## Phase 8 completion
- Milestones 8.1 to 8.4 done. Tests at release: 226 backend, 95 frontend; lint, typecheck and production build clean.
- Known issues: ten moderate advisories in dev-only linting tools; the Stanford dataset has no declared licence (coursework use only); the cycle model probably over-states fade for slow-charging buses; two checkpoint tags (`cp-8.1`, `cp-8.3`) were cut before a failure was caught and have fixes at `cp-8.1.1` and `cp-8.3.1`.
