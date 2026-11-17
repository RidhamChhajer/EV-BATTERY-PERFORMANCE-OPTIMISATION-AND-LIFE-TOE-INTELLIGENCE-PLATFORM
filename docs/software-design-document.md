# Software Design Document (SDD): E-Bus Battery Lifecycle Intelligence Tool
Version 0.1 | 2026-11-07 | Course project (non-commercial) | Approved by user 2026-11-07

> **Update (after v1.0.0): the ageing engine changed.** The app now runs a port of NREL's BLAST-Lite LFP models (`engine/reference/`, 50-run ensemble; see `docs/model-card.md`). Sections 5.2 and 5.4 below describe the project's own laboratory-fitted model and its Monte Carlo, which stay in the code behind `EV_ENGINE=lab` but are not shown in the app. Where this document says HUST-fitted cycling, bootstrap draws, N=2000 or a widened band, read it as that retained model.

## 1. Introduction
### 1.1 Purpose
Specify the architecture, data, models, interfaces and UI of a decision tool that forecasts battery health and replacement timing for Indian city e-bus fleets, designed like a B2B product but built as a course project.
### 1.2 Scope
Vehicle category: Indian city e-buses (12 m primary, 9 m secondary), LFP packs ~250-370 kWh, overnight depot charging, per-km (GCC-style) contracts. No named client, city or operator. v1 delivers a standalone Prior mode (no vendor data); Calibrated mode is designed and demonstrated as a method, not wired into the UI.
### 1.3 Hard constraints (from user)
C1 Real, free-to-download data only; no synthetic or simulator-generated training data. C2 The system works fully standalone using models trained on public data. C3 Scenario inputs are labelled assumptions; every output is labelled "not yet validated on buses". C4 Vendor data may only calibrate, never be required. C5 BMS-reported SOH is not treated as ground truth. C6 Operator-agnostic configuration.
### 1.4 Definitions
LFP: lithium iron phosphate chemistry. SOH/retention: capacity relative to new. EFC: equivalent full cycle. Prior mode: predictions from public lab data + stated assumptions. Calibrated mode: Prior adjusted with a vendor's own data. Conformal prediction: distribution-free method turning validation errors into prediction ranges.
### 1.5 References
docs/business-case.md; docs/data-inventory-and-blueprint.md; docs/parameters-and-data-fit.md; docs/phase0-report.md.

## 2. Evidence base (what Phase 0 established)
| Fact | Source | Implication |
|---|---|---|
| Calendar fade rises with temperature and SOC, consistent across two labs | Stanford (80 LFP cells), Naumann (17 conditions) | Fit and cross-validate calendar model |
| Cycle life from first 100 cycles: 12.7% error vs 17.7% naive (LOO, 77 cells) | HUST | Wide cycle-life bands; no single dates |
| EVBattery is NMC-like (4.29 V); capacity labels exist for 191 vehicles; mileage alone 2.50%, +snippets 2.29% | EVBattery | Calibration method demo only; mileage is backbone |
| No public LFP bus-pack, hot-cycling (>35 C) or idle-time data | Phase 0 gaps | Extrapolation badges; assumptions exposed |

## 3. System overview
### 3.1 Context
User (student/analyst acting as fleet planner) -> Web UI -> API -> Engine (models) -> read-only model artifacts + processed public data. No external runtime services; no database in v1.
### 3.2 Layered architecture
L1 Cell ageing -> L2 Bus translation (+ pack penalty) -> L4 Decisions; L3 Calibration (designed, offline demo). Data flows left to right; every number carries provenance metadata end to end.
### 3.3 Technology choices
| Concern | Choice | Reason |
|---|---|---|
| Language | Python 3.14 (existing venv) | Matches Phase 0 |
| Numerics/ML | numpy, pandas, scipy (least_squares), scikit-learn (ElasticNet, GBM), statsmodels (mixed model), optional lightgbm | Small data, explainable |
| API | FastAPI + pydantic v2 + uvicorn | Typed contracts, auto docs |
| Frontend | React 18, TypeScript, Vite, Tailwind | Standard, fast |
| 3D | three.js via react-three-fiber + drei | Installed skills; procedural bus, no external assets |
| Charts | Recharts (or visx) following dataviz skill | Accessible, themeable |
| Testing | pytest, property tests, vitest, Playwright (browser pane) | Coverage of model + UI |
| Packaging | uv/venv, Docker for optional deploy | Local first |

## 4. Data design
### 4.1 Sources
HUST (cycling), Stanford + Naumann (calendar), EVBattery (field method demo), weather: NASA POWER / Open-Meteo archive for four Indian climate zones (hot-dry, hot-humid, composite, cool) at representative grid points; no city names in UI.
### 4.2 Pipeline
raw (`data/`, git-ignored, not redistributed) -> `engine/data/ingest_*.py` -> processed parquet `engine/data/processed/` -> training scripts -> versioned artifacts `engine/artifacts/*.json|joblib`. Each dataset has `provenance.json` {source URL, licence, retrieved date, sha256, rows, known limitations}.
### 4.3 Key entities
Scenario, BusArchetype, ClimateZone, ChargingPlan, CellModelParams (with bootstrap draws), PredictionResult, EvidenceRecord, Label. All JSON-serialisable via pydantic.

## 5. Model design
### 5.1 L1 Cell ageing
- Calendar: Q_cal(t,T,SOC) = A * exp(-(Ea/R)(1/T - 1/Tref)) * g(SOC) * t^z; g piecewise-linear in SOC. Fit by non-linear least squares; parameter uncertainty via bootstrap over cells; validation: fit one lab, predict the other, report error.
- Cycle: Q_cyc(EFC,T,C) = B * exp(-(Eb/R)(1/T-1/Tref)) * h(C) * EFC^m; fit on HUST by cell. Early-life cycle-life predictor: ElasticNet on early capacity-fade features vs GBM, choose by leave-one-cell-out MAPE.
- Combination: additive loss (documented assumption).
- Uncertainty: bootstrap draws + split-conformal residual quantiles -> p10/p50/p90 band; report empirical coverage of the nominal 80% band.
### 5.2 L2 Bus translation
Inputs -> EFC/yr, mean C-rate, time-at-SOC, cell temperature (ambient monthly mean and diurnal range from weather + lumped heating/cooling term). Pack penalty: earlier end-of-life factor sampled from user-visible range (default 0-8%), flagged "assumption, no public data".
### 5.3 L3 Calibration (design)
Interface `calibrate(prior, vendor_frame) -> posterior`: per-vehicle capacity from charging segments (fixed voltage window features, mileage backbone), partial pooling via mixed-effects model, shrinkage toward Prior. v1 demonstrates on EVBattery with vehicle-grouped CV in `notebooks/calibration_demo.ipynb`.
### 5.4 L4 Decisions
- Replacement window (retained lab engine; the reference engine uses a fixed 50-run ensemble of 2 models x 5 degradation scalars x 5 pack penalties): Monte Carlo (N=2000) over bootstrap draws x residual quantiles x pack penalty -> time to threshold (default 80%) -> P(replace by month), p10/p50/p90 dates.
- Seasonal range: monthly usable range = retention x temperature factor; the factor is used only if a measured source is found, else a clearly labelled user assumption.
- Cost per km: battery cost (user input) / lifetime km to threshold with sensitivity.
- Charging what-ifs: charge rate, SOC cap, start time; re-run L1-L4; paired comparison on shared random draws so differences are not noise.
- Extrapolation guard: inputs beyond training coverage (e.g. cycling >35 C, C-rate beyond HUST range) raise a badge and widen the band.

## 6. Interface design
### 6.1 REST API (JSON, versioned `/api/v1`)
| Endpoint | Purpose |
|---|---|
| POST /predict | Scenario -> curves (p10/50/90), replacement dates, probabilities, monthly range, cost/km, driver split, labels |
| POST /compare | List of scenarios -> aligned results + deltas |
| GET /presets | Bus archetypes and default duty cycles |
| GET /zones | Climate zones with monthly stats and data provenance |
| GET /evidence | Datasets, Phase 0 metrics, coverage limits, model versions |
| GET /health | Liveness and artifact versions |
Every number: `{value, unit, evidence_level: lab|assumption|derived, validated_on_buses:false}`. Response includes `mode:"prior"`, `model_version`, `warnings[]`.
### 6.2 Errors
422 with field-level messages for invalid scenarios (pydantic); 400 for unsupported mode; 500 never leaks stack traces.

## 7. Frontend design
### 7.1 Pages and panels
1. Scenario builder: archetype, km/day, energy/km, charges/day, window, rate, SOC cap, zone, battery cost; each field shows unit, default source and "assumption" badge.
2. 3D bus: procedural bus; roof and under-floor pack zones coloured by projected health; year scrubber; hover shows numbers.
3. Health curve: retention vs years with p10-p90 band, threshold line, calendar vs cycle split toggle.
4. Replacement window: probability curve + p10/p50/p90 dates.
5. Seasonal range: monthly usable range bars for chosen zone.
6. Cost per km: value with sensitivity tornado.
7. What-if compare: A vs B (e.g. 100% vs 90% charge cap), delta cards.
8. Evidence and Method: datasets, measured errors, coverage gaps, how Calibrated mode will plug in.
### 7.2 Global behaviour
Persistent chips: "Prior mode (no vendor data)" and "Not yet validated on buses"; extrapolation badges; light/dark; responsive at 375 px; keyboard accessible; export results as CSV/PDF. Visual design guided by impeccable, dataviz and web-design-guidelines skills.
### 7.3 State
Scenario in URL query + local state (zustand/react-query); results cached by scenario hash.

## 8. Repository structure
`engine/{cell,bus,calibrate,decide,data,train,artifacts}`, `backend/{app,routes,schemas}`, `frontend/src/{pages,components,three,api}`, `notebooks/`, `docs/`, `phase0/` (kept), `data/` (ignored), `scripts/`.

## 9. Quality, testing and verification
- Unit: unit conversions, monotonicity (hotter/fuller never less fade; more EFC never less fade), band ordering p10<=p50<=p90, reproducibility with fixed seeds.
- Model validation: leave-one-cell-out coverage of the 80% band (target 70-90%), cross-lab calendar error, Phase 0 numbers reproduced by `scripts/train_all`.
- API: schema/contract tests; label presence on every numeric field.
- UI: vitest components; browser-pane run at desktop and mobile, light/dark, each preset and what-if.
- Honesty checks (acceptance): no synthetic training data; every output labelled; assumptions adjustable.

## 10. Non-functional requirements
Predict latency under 2 s locally (Monte Carlo vectorised, N=2000); deterministic given seed; works offline; memory under 1 GB; no personal data; datasets cited in-app and not redistributed.

## 11. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Cycle model weak (77 cells, one type) | Wide bands, cell-lab evidence label |
| Pack penalty, thermal coefficients ungrounded | Exposed assumptions with sensitivity |
| Seasonal range factor lacks LFP data | Measured source only, else labelled assumption |
| Over-reading Phase 0 error numbers | Own splits; stated not comparable to published |
| Schedule | Trim order: M8 notebook, M7 what-ifs polish, optional deployment |

## 12. Milestones
M1 data + weather ingest + provenance; M2 calendar model + cross-lab validation; M3 cycle model + early-life predictor + conformal bands; M4 bus translation + Monte Carlo decisions; M5 API + tests; M6 frontend core (scenario, curve, replacement); M7 3D bus, range, cost, what-if compare; M8 Evidence/Method + calibration notebook; M9 polish, docs, model card, optional Docker deployment.

## 13. Open items
Chart library: decided at M6, custom SVG (see `docs/phase-checkpoints.md`); source for temperature effect on range (search at M4; fall back to assumption); optional hosting target.

## 14. Deviations from this design (as built, v1.0.0)
| Design said | As built | Why |
|---|---|---|
| Frontend with Tailwind, Recharts or visx | Plain CSS with design tokens; charts drawn as inline SVG | Fewer dependencies, full control of accessibility and the 3D overlay look |
| Scenario in the URL plus zustand | Scenario in React context with the archetype and climate zone in the URL; results cached by react-query | Simpler; shareable links keep the two choices that matter |
| Pages: scenario builder, 3D bus, curve, replacement window, range, cost, what-if, Evidence and Method | Seven pages: Overview and Optimise are full-screen 3D with the scenario and settings in side drawers; no separate Method page (the Evidence page carries the method and its numbers) | User-requested redesign for a less cluttered, seamless build |
| Optional export of results as CSV or PDF | Not built | Cut to keep scope; the tables behind each chart are on the page |
| Light and dark themes | Dark only | One designed theme, checked for contrast |
| Playwright end-to-end tests | axe-core scans in the unit test suite plus real-browser scans by hand (`docs/accessibility.md`) | Avoided a large browser download |
| Calibration notebook | Script `engine/train/fit_calibration_demo.py` (Jupyter not installed) | Same experiment, results served by `/evidence` |
| Optional hosted deployment and Docker | Not done; one-command local run instead | No hosting choice made; Docker not installed |
| Demo had no login | One shared demo account with signed, expiring tokens | Keeps the API closed to anonymous callers for assessment |
| Compare as a separate what-if page | Bus A against an adjustable Bus B, with goal presets from `/recommend` | Same paired-draw comparison, easier to read |
