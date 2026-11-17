# Development Playbook: E-Bus Battery Lifecycle Intelligence Tool

Companion to `docs/software-design-document.md` (SDD). Follow top to bottom. Never start a milestone before its dependencies are DONE. Never push before the milestone's tests and verification pass.

## A. Project facts and the decisions this playbook assumes

Repository setup:
- Repo: `https://github.com/RidhamChhajer/EV-BATTERY-PERFORMANCE-OPTIMISATION-AND-LIFE-TOE-INTELLIGENCE-PLATFORM.git`.
- Confirm GitHub authentication and the local Git identity before pushing.
- Use Python 3.12 or newer and Node 20 or newer. Downloaded datasets stay outside Git.

Assumed (change before Phase 0 if wrong; each is a one-line change):
| # | Assumption | Why | If you disagree |
|---|---|---|---|
| D1 | Branch model: `main` is always stable; work on `phase-N-name` branches; each milestone is one commit (or a few) merged to `main` by fast-forward. | Simple for a solo course project; every push to `main` is a checkpoint. | Tell me; commands change only in section 9 of each milestone. |
| D2 | Raw and processed datasets are **never committed** (public repo, 13 GB, licences). A `scripts/fetch_data.sh` + `data/README.md` documents how to re-download. | Public repo; GitHub file limit 100 MB. | If you want data in the repo, we need Git LFS and a licence review. |
| D3 | Commits are authored only by `RidhamChhajer`. No `Co-Authored-By` trailers, no tool-attribution lines, in commits or PR text. | Your instruction. | n/a |
| D4 | Optional deployment (Phase 8.3) uses a free host without Docker (Render/Railway for API, static host for frontend) unless you install Docker. | Docker missing. | Install Docker Desktop to use the Dockerfile route. |
| D5 | The SDD defaults stand: Prior mode only, Calibrated mode as notebook demo. | Your earlier decisions. | n/a |

Genuinely missing information (needed by the milestone shown; answer when you reach it, nothing blocks Phase 0):
1. Phase 1.2: exact representative lat/lon for the four climate zones (I will propose grid points; you approve).
2. Phase 3.4: source for temperature effect on usable range; if no measured LFP source is found you must accept a labelled assumption.
3. Phase 8.3: where you want to deploy, if at all.

## B. Conventions used in every milestone

- **Test status column**: write `TODO`, then `PASS` or `FAIL` as you run them. Milestone is DONE only when every row is `PASS` (or `N/A` with a reason).
- **Python tests**: `cd <project-directory> && source .venv/bin/activate && pytest -q` (the venv is created in 0.2).
- **Commit message format**: `M<phase>.<n>: <what>`. Example: `M1.1: ingest HUST, Stanford, Naumann to parquet`.
- **Tag after each push**: `git tag -a cp-<phase>.<n> -m "<milestone name>" && git push origin cp-<phase>.<n>`. Tags are the named stable checkpoints used for rollback.
- **Never commit** (enforced by `.gitignore` from M0.1): `data/`, `*.parquet`, `*.pkl`, `*.joblib` (except small whitelisted artifacts under `engine/artifacts/`), `.venv/`, `node_modules/`, `dist/`, `__pycache__/`, `.env*`, API keys, `*.log`, `.DS_Store`, notebook outputs with data, `.claude/`.
- **Safe rollback to a previous checkpoint after a bad push** (used by section 10 of every milestone unless a milestone says more):
  ```bash
  git fetch origin
  git log --oneline --decorate -10          # find the bad commit hash and the previous cp-* tag
  git revert --no-edit <bad-hash>            # creates a NEW commit that undoes it; history stays intact
  # run the previous milestone's verification checklist
  git push origin main
  ```
  If several commits are bad: `git revert --no-edit cp-<prev>..HEAD`. Never use `git push --force` on `main`. To inspect a past state without changing anything: `git switch --detach cp-<prev>`; return with `git switch main`.
- **Regression rule**: from M1.1 onward, every milestone's verification includes `pytest -q` for the whole repo (all earlier tests must still pass).
- **Evidence labelling rule** (project constraint C3): any milestone that produces a user-visible number must include a label test. Any milestone touching training data must include a "no synthetic data" check.

## C. Phase map and dependencies

| Phase | Name | Milestones | Depends on |
|---|---|---|---|
| 0 | Setup and baseline | 0.1 repo, 0.2 environment and package skeleton, 0.3 Phase 0 reproducibility | none |
| 1 | Data layer | 1.1 lab cycling and calendar data, 1.2 weather, 1.3 EVBattery | Phase 0 |
| 2 | Cell ageing models | 2.1 calendar fit, 2.2 cross-lab validation, 2.3 cycle fade fit, 2.4 early-life predictor | Phase 1 |
| 3 | Uncertainty, bus and decisions | 3.1 uncertainty bands, 3.2 bus translation, 3.3 replacement Monte Carlo, 3.4 range, cost and what-if | Phase 2 |
| 4 | Backend API | 4.1 skeleton, 4.2 predict, 4.3 compare, presets, zones, evidence | Phase 3 |
| 5 | Frontend core | 5.1 scaffold, 5.2 scenario builder, 5.3 curve and replacement panels | Phase 4 |
| 6 | Frontend advanced | 6.1 3D bus, 6.2 range and cost panels, 6.3 what-if compare | Phase 5 |
| 7 | Evidence, Method and calibration | 7.1 Evidence and Method pages, 7.2 calibration method demo | Phase 6 (7.2 needs only Phase 1.3 and 2.x) |
| 8 | Hardening and release | 8.1 accessibility and responsive, 8.2 performance and security, 8.3 deployment, 8.4 documentation and release | Phases 0 to 7 |

---

# PHASE 0: Project setup and baseline

## Milestone 0.1: Git repository, structure and ignore rules
**Depends on:** nothing.

### 1. Milestone name
Initialise the repository safely and connect it to GitHub.

### 2. Objective
Create a clean git history in the existing project folder with a `.gitignore` that makes it impossible to commit the 13 GB of data, virtual environments or secrets, then push the first stable checkpoint.

### 3. Tasks to complete
- [ ] `git init -b main` in `<project-directory>`.
- [ ] Write `.gitignore` (see section 5) before any `git add`.
- [ ] Create folders with `.gitkeep`: `engine/ backend/ frontend/ notebooks/ scripts/ tests/`.
- [ ] Add `README.md` (project purpose, status, "course project, non-commercial", data not included, how to fetch).
- [ ] Add `data/README.md` listing each dataset, source URL, licence, expected file sizes (from Phase 0 report) and the fetch commands.
- [ ] Add remote `origin`, make first commit, push `main`, tag `cp-0.1`.

### 4. Files / modules affected
New: `.gitignore`, `README.md`, `data/README.md` (whitelisted in `.gitignore`), empty top-level folders. Existing `docs/` and `phase0/` scripts are included; `phase0/.venv` and `data/*` are not.

### 5. Implementation guidance
`.gitignore` content:
```gitignore
# environments and secrets
.venv/
phase0/.venv/
node_modules/
.env
.env.*
*.pem
*.key
# data and generated artifacts
data/*
!data/README.md
*.parquet
*.pkl
*.joblib
*.npz
engine/artifacts/*
!engine/artifacts/.gitkeep
!engine/artifacts/*.json
# python / node / os
__pycache__/
*.pyc
.pytest_cache/
.ipynb_checkpoints/
dist/
build/
*.log
.DS_Store
.claude/
# phase0 generated outputs
phase0/*.parquet
phase0/*.csv
phase0/extract.*
```
Why `engine/artifacts/*.json` is allowed: trained model parameters are small (KBs), reviewable and make the repo runnable without retraining. Large joblib files stay ignored; they are rebuilt by `scripts/train_all.sh`.
Check size before committing: `du -sh .git` after the first commit must be under 5 MB.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T0.1-1 | Data directory is ignored | `.gitignore` written, data present | `git status --short` | No path under `data/` except `data/README.md` | TODO |
| T0.1-2 | Venv is ignored (negative) | `phase0/.venv` exists | `git check-ignore -v phase0/.venv/bin/python` | Prints the matching ignore rule | TODO |
| T0.1-3 | Secret file blocked | none | `echo X=1 > .env && git status --short \| grep .env; rm .env` | `.env` not listed | TODO |
| T0.1-4 | Repo size small (edge) | First commit made | `du -sh .git` | Under 5 MB | TODO |
| T0.1-5 | Largest tracked file | First commit made | `git ls-files -z \| xargs -0 du -k \| sort -n \| tail -3` | No file over 1 MB | TODO |
| T0.1-6 | Remote reachable (failure handling) | `gh auth status` ok | `git ls-remote origin` | Shows `refs/heads/main` after push; if auth error, run `gh auth login` | TODO |
| T0.1-7 | Authorship | Commit made | `git log -1 --format='%an <%ae>%n%B'` | Author is `RidhamChhajer`; message has no `Co-Authored-By` line | TODO |

### 7. Verification checklist
- [ ] `git ls-files | wc -l` is a small number (tens, not thousands).
- [ ] GitHub page shows README and docs, no `data/` content.
- [ ] No file contains the word `password`, `token` or `key=`: `git grep -nEi "password|token|api[_-]?key" -- . ':!docs'` returns nothing meaningful.

### 8. Completion criteria
All T0.1 rows PASS; `main` exists on GitHub; tag `cp-0.1` pushed.

### 9. Git checkpoint
```bash
cd <project-directory>
git init -b main
git remote add origin https://github.com/RidhamChhajer/EV-BATTERY-PERFORMANCE-OPTIMISATION-AND-LIFE-TOE-INTELLIGENCE-PLATFORM.git
git status                    # confirm no data/ or .venv entries BEFORE adding
git add .
git status                    # re-check staged list
git commit -m "M0.1: initialise repo, ignore rules, docs and phase0 scripts"
git push -u origin main
git tag -a cp-0.1 -m "repo initialised" && git push origin cp-0.1
```
Do NOT commit: `data/`, `.venv`, `.env`, any parquet/pkl, `.claude/`.

### 10. Rollback / recovery
- Committed something large or secret by mistake **before pushing**: `git reset --soft HEAD~1`, fix `.gitignore`, `git rm -r --cached <path>`, recommit.
- Already pushed a secret: treat it as leaked. Revoke/rotate it first; then because the repo is empty of other history, delete and recreate it: `gh repo delete RidhamChhajer/EV-BATTERY-PERFORMANCE-OPTIMISATION-AND-LIFE-TOE-INTELLIGENCE-PLATFORM --yes` is destructive, so do it only deliberately, then `gh repo create` and re-push. (A plain revert does not remove the secret from history.)
- Otherwise use the standard revert procedure in section B.

---

## Milestone 0.2: Python environment and engine package skeleton
**Depends on:** 0.1.

### 1. Milestone name
Reproducible Python environment and an importable, tested package skeleton.

### 2. Objective
One command creates the environment; `pytest` runs (with a trivial test) and `import engine` works. Establishes the project-level structure all later code uses, replacing the throwaway `phase0/.venv`.

### 3. Tasks to complete
- [ ] Create `pyproject.toml` (package `engine`, backend later) with pinned minimum versions.
- [ ] Create `requirements.txt` generated from a working install (`pip freeze` of top-level deps only, see guidance).
- [ ] Create `.venv` at repo root with Python 3.14.
- [ ] Create `engine/__init__.py` with `__version__`, subpackage folders `cell/ bus/ decide/ calibrate/ data/ train/` each with `__init__.py`.
- [ ] Add `tests/test_smoke.py`, `pytest.ini`.
- [ ] Add `scripts/setup_env.sh`.

### 4. Files / modules affected
`pyproject.toml`, `requirements.txt`, `pytest.ini`, `scripts/setup_env.sh`, `engine/**/__init__.py`, `tests/test_smoke.py`.

### 5. Implementation guidance
Dependencies and why: numpy, pandas, pyarrow (parquet storage), scipy (curve fitting), scikit-learn (ElasticNet, gradient boosting, CV), statsmodels (mixed-effects model for calibration demo), openpyxl (read Naumann xlsx), requests (weather download), pytest (tests), hypothesis (property tests for monotonicity). No lightgbm unless 2.4 shows it beats scikit-learn's `HistGradientBoostingRegressor` (avoids an unneeded dependency).
```bash
cd <project-directory>
python3 -m venv .venv && source .venv/bin/activate
pip install numpy pandas pyarrow scipy scikit-learn statsmodels openpyxl requests pytest hypothesis
pip freeze > requirements.lock.txt   # exact versions; requirements.txt lists top-level names only
pip install -e .
```
Backend/frontend dependencies are added in Phases 4 and 5, not now.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T0.2-1 | Package imports | venv active, `pip install -e .` | `python -c "import engine; print(engine.__version__)"` | Prints version string | TODO |
| T0.2-2 | Subpackages import | same | `python -c "import engine.cell, engine.bus, engine.decide, engine.calibrate, engine.data, engine.train"` | No error | TODO |
| T0.2-3 | Smoke test runs | same | `pytest -q` | 1+ passed, 0 failed | TODO |
| T0.2-4 | Fresh environment (integration) | delete `.venv` | `bash scripts/setup_env.sh && pytest -q` | Recreates env, tests pass | TODO |
| T0.2-5 | Wrong Python (failure handling) | `python3.9` if present | run `setup_env.sh` with it | Script exits non-zero with message "need Python >= 3.12" | TODO |
| T0.2-6 | Unneeded deps absent (validation) | env built | `pip list \| grep -Ei "fastapi\|torch\|tensorflow"` | Nothing listed | TODO |

### 7. Verification checklist
- [ ] `.venv` not in `git status`.
- [ ] `pytest -q` green from a fresh clone: `git clone https://github.com/RidhamChhajer/EV-BATTERY-PERFORMANCE-OPTIMISATION-AND-LIFE-TOE-INTELLIGENCE-PLATFORM.git /tmp/evcheck && cd /tmp/evcheck && bash scripts/setup_env.sh && pytest -q` (run after push of this milestone to a scratch location; delete afterwards).

### 8. Completion criteria
T0.2 rows PASS including the fresh-clone check.

### 9. Git checkpoint
```bash
git switch -c phase-0-setup
git status
git add .
git commit -m "M0.2: python env, engine package skeleton, smoke test"
git switch main && git merge --ff-only phase-0-setup
git push origin main
git tag -a cp-0.2 -m "env and skeleton" && git push origin cp-0.2
```
Do NOT commit `.venv`, `*.egg-info/`, `requirements.lock.txt` only if it contains local paths (it should not; commit it).

### 10. Rollback / recovery
Section B revert. If the environment itself is broken locally: `rm -rf .venv && bash scripts/setup_env.sh`.

---

## Milestone 0.3: Phase 0 results become reproducible, tested scripts
**Depends on:** 0.2. Data must be present locally (re-run `scripts/fetch_data.sh` if not).

### 1. Milestone name
Promote the throwaway Phase 0 analysis into reproducible, asserted scripts.

### 2. Objective
Anyone with the downloaded data can reproduce the numbers in `docs/phase0-report.md` (12.7% HUST cycle-life error, 2.29% EVBattery capacity error, calendar retention tables) with one command, and the numbers are checked automatically so later refactors cannot silently change them.

### 3. Tasks to complete
- [ ] Write `scripts/fetch_data.sh` (curl commands with expected byte sizes, resume enabled) and make it print OK/MISMATCH.
- [ ] Move safe loaders to `engine/data/safe_unpickle.py` (allow-list unpicklers from `phase0/evb_load.py` and `phase0/hust_load.py`).
- [ ] Move analysis to `engine/train/phase0_baselines.py` with functions returning metrics dicts.
- [ ] Write `tests/test_phase0_reproduction.py` asserting reported numbers within tolerance, marked `@pytest.mark.data` (skipped if `data/` missing).
- [ ] Write `docs/reproducibility.md`.

### 4. Files / modules affected
`scripts/fetch_data.sh`, `engine/data/safe_unpickle.py`, `engine/train/phase0_baselines.py`, `tests/test_phase0_reproduction.py`, `pytest.ini` (marker), `docs/reproducibility.md`. `phase0/` kept as history.

### 5. Implementation guidance
Security: the datasets are untrusted pickles. The allow-list loader must reject any class outside numpy/pandas, and a test must prove a malicious pickle is blocked. Tolerances: HUST LOO MAPE 12.7% ± 0.3, EVBattery grouped-CV MAPE 2.29% ± 0.15 (random sample, so give a fixed seed), Naumann 25 C/100% SOC retention 89.0% ± 0.1. Record the seed in the code.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T0.3-1 | Download integrity | internet | `bash scripts/fetch_data.sh` | All files print OK sizes | TODO |
| T0.3-2 | HUST baseline reproduces | HUST extracted | `pytest -m data -k hust` | MAPE within 12.4 to 13.0% | TODO |
| T0.3-3 | EVBattery baseline reproduces | EVBattery extracted, `evb_full.parquet` built | `pytest -m data -k evbattery` | MAPE within 2.1 to 2.45% | TODO |
| T0.3-4 | Naumann calendar | xlsx present | `pytest -m data -k naumann` | 25 C/100% retention 88.9 to 89.1% | TODO |
| T0.3-5 | Malicious pickle blocked (security) | none | test creates a pickle calling `os.system` in tmp dir, loads via safe loader | `UnpicklingError`, no command executed | TODO |
| T0.3-6 | Data missing (failure handling) | rename `data/` temporarily | `pytest -q` | Data tests SKIPPED with reason, others pass | TODO |
| T0.3-7 | Truncated download | cut a file short | run fetch script | Reports MISMATCH and resumes | TODO |
| T0.3-8 | Regression | M0.2 tests | `pytest -q` | All previous pass | TODO |

### 7. Verification checklist
- [ ] Numbers printed by the script match `docs/phase0-report.md` sections 2 and 3.
- [ ] `git status` shows no `.pkl`/`.parquet`.
- [ ] Reproduction time recorded in `docs/reproducibility.md`.

### 8. Completion criteria
All rows PASS; reproducibility doc written.

### 9. Git checkpoint
```bash
git switch -c phase-0-baseline
pytest -q && pytest -m data -q
git status
git add .
git commit -m "M0.3: reproducible baselines with safe loaders and asserted metrics"
git switch main && git merge --ff-only phase-0-baseline && git push origin main
git tag -a cp-0.3 -m "baselines reproducible" && git push origin cp-0.3
```
Do NOT commit extracted data, parquet caches, or timing logs with local paths.

### 10. Rollback / recovery
Section B revert. Data issues are local only: re-run the fetch script.

---

## Phase 0 Completion Checkpoint
| Item | Record |
|---|---|
| Completed milestones | 0.1, 0.2, 0.3 |
| Tests passed | all T0.x rows (record counts: ___ / ___) |
| Known issues | write here (for example: EVBattery sample variance, Python 3.14 package availability) |
| Git commit/hash | `git rev-parse --short cp-0.3` = ___ |
| Overall verification | fresh clone builds env and passes `pytest -q`; data tests pass locally |
| Go/No-Go | GO only if all rows PASS and repo size under 5 MB |

---

# PHASE 1: Data layer

## Milestone 1.1: Lab cycling and calendar data to clean tables
**Depends on:** 0.3.

### 1. Milestone name
Ingest HUST, Stanford and Naumann into validated, documented tables.

### 2. Objective
Produce three processed tables: `hust_cycles` (per cell per cycle capacity and early-cycle features, life), `calendar_obs` (cell, temperature C, SOC %, days, retention, source), and a `provenance.json` for each. Model fitting in Phase 2 reads only these.

### 3. Tasks to complete
- [ ] `engine/data/ingest_hust.py`: per cell: cycle count, discharge capacity series, protocol info, cycle life; Q(V) curves at cycles 10 and 100.
- [ ] `engine/data/ingest_calendar.py`: unify Stanford (LFP, 80 usable cells) and Naumann (17 conditions) into one schema with `source` column.
- [ ] Validation module `engine/data/validate.py` (schema, ranges, monotone time, no NaN keys).
- [ ] Provenance JSON per dataset (source URL, licence, retrieved date, sha256, row counts, limitations).
- [ ] `scripts/build_data.sh` runs everything.

### 4. Files / modules affected
`engine/data/ingest_hust.py`, `ingest_calendar.py`, `validate.py`, `engine/data/processed/` (ignored), `engine/data/provenance/*.json` (committed), `tests/test_ingest_*.py`.

### 5. Implementation guidance
Retention is normalised to each cell's first reference capacity. Time unit: days. Keep Naumann hours converted to days. Record that Stanford cell IDs map to conditions via `Joule_cell_id.csv`. Keep the HUST end-of-life definition as found (final capacity ratio about 0.745 median) and store it per cell; do not assume 80%.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T1.1-1 | HUST row counts | HUST extracted | run ingest | 77 cells; life min 1142, max 2689 | TODO |
| T1.1-2 | Calendar row counts | Stanford, Naumann present | run ingest | 80 Stanford LFP cells + 17 Naumann conditions | TODO |
| T1.1-3 | Schema validation | processed tables | `validate.py` | Required columns present, dtypes correct | TODO |
| T1.1-4 | Range validation | same | validate | retention in (0.4, 1.05]; temperature in {0..85}; SOC in [0,100] | TODO |
| T1.1-5 | Monotone time (edge) | same | validate | days strictly non-decreasing per cell | TODO |
| T1.1-6 | Corrupt input (failure) | copy xlsx, delete a column | run ingest | Clear error naming the missing column, no partial output file | TODO |
| T1.1-7 | Idempotent | tables built | run twice | Identical sha256 of outputs | TODO |
| T1.1-8 | No synthetic data (constraint C1) | provenance files | test reads provenance | Every `source_url` is a real dataset host; no field `generated: true` | TODO |
| T1.1-9 | Regression | M0.x | `pytest -q` | All pass | TODO |

### 7. Verification checklist
- [ ] Retention table values match `docs/phase0-report.md` section 2.1 (Naumann 25 C/100% = 89.0%).
- [ ] Provenance JSON present for all three datasets and committed.
- [ ] `git status` shows no parquet.

### 8. Completion criteria
All PASS; provenance committed.

### 9. Git checkpoint
```bash
git switch -c phase-1-data
pytest -q
git status
git add .
git commit -m "M1.1: ingest HUST, Stanford and Naumann with validation and provenance"
git switch main && git merge --ff-only phase-1-data && git push origin main
git tag -a cp-1.1 -m "lab data ingested" && git push origin cp-1.1
```
Do NOT commit processed tables or raw files.

### 10. Rollback / recovery
Section B revert; processed tables are regenerated with `scripts/build_data.sh`.

---

## Milestone 1.2: Real weather for four climate zones
**Depends on:** 0.2 (independent of 1.1).

### 1. Milestone name
Download and summarise real historical weather for four Indian climate zones.

### 2. Objective
Provide `zone_climate` with monthly mean temperature, mean daily maximum and minimum, and diurnal range for hot-dry, hot-humid, composite and cool zones, from free real records, with provenance. No named city appears in outputs.

### 3. Tasks to complete
- [ ] Propose 4 grid points (lat/lon) and get approval (missing-information item 1).
- [ ] `engine/data/ingest_weather.py` using NASA POWER daily API (free, no key) or Open-Meteo archive for 10 years (2015 to 2024).
- [ ] Aggregate to monthly stats; store `zone_climate.parquet` and committed small `zones.json`.
- [ ] Provenance and licence note (NASA POWER terms, attribution text).
- [ ] Cache raw responses locally (ignored) so tests do not need internet.

### 4. Files / modules affected
`engine/data/ingest_weather.py`, `engine/data/zones.json` (committed, small), `engine/data/provenance/weather.json`, `tests/test_weather.py`.

### 5. Implementation guidance
Use `requests` with timeout and retries; store the full request URL in provenance. Use a fixed date range so results are reproducible. Provide an offline fallback to the committed `zones.json` so the app never needs internet at runtime. A zone name is a climate label only ("hot-dry"), with lat/lon rounded to 1 decimal in docs.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T1.2-1 | Four zones present | ingest done | load `zones.json` | exactly 4 zones, 12 months each | TODO |
| T1.2-2 | Plausible ranges | same | check | monthly means between 5 and 40 C; hot-dry July mean greater than cool zone July mean | TODO |
| T1.2-3 | Daily extremes ordering | same | check | tmin less than tmean less than tmax for every month | TODO |
| T1.2-4 | Network failure | disable network | run ingest | Fails with clear message; committed `zones.json` still loads | TODO |
| T1.2-5 | Bad API response (negative) | mock empty JSON | run parser | Raises validation error, writes nothing | TODO |
| T1.2-6 | Missing-value sentinel (edge) | NASA uses -999 | feed -999 rows | Excluded, not averaged in | TODO |
| T1.2-7 | Reproducible | cached raw | run twice | identical `zones.json` | TODO |
| T1.2-8 | Regression | earlier tests | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] Spot-check three monthly means against a second source.
- [ ] No city names in files: `grep -riE "mumbai|delhi|chennai|bengaluru|pune|kolkata" engine/data` returns nothing.

### 8. Completion criteria
All PASS; zones approved by you.

### 9. Git checkpoint
```bash
git switch -c phase-1-weather
pytest -q
git status
git add .
git commit -m "M1.2: real weather for four climate zones with provenance"
git switch main && git merge --ff-only phase-1-weather && git push origin main
git tag -a cp-1.2 -m "weather ingested" && git push origin cp-1.2
```
Do NOT commit raw API caches.

### 10. Rollback / recovery
Section B revert.

---

## Milestone 1.3: EVBattery processed for the calibration demo
**Depends on:** 0.3.

### 1. Milestone name
EVBattery snippet features and labels as a validated table.

### 2. Objective
Create `evb_segments` (dataset, vehicle, mileage, capacity label, snippet features, anomaly flag) from the 1.28 million snippets, using the safe loader, so the Phase 7 calibration demo is a table read, not a re-parse.

### 3. Tasks to complete
- [ ] Promote `phase0/evb_full.py` and `evb_cap.py` into `engine/data/ingest_evbattery.py`.
- [ ] Validation: 464 vehicles, 1,278,277 snippets, capacity labels only 24 to 46 Ah.
- [ ] Document that chemistry is NMC-like (max cell voltage 4.29 V) and not LFP.
- [ ] Provenance JSON including "values perturbed by authors".

### 4. Files / modules affected
`engine/data/ingest_evbattery.py`, `engine/data/provenance/evbattery.json`, `tests/test_evbattery.py`.

### 5. Implementation guidance
Use multiprocessing with at most `cpu_count()-1` workers. Never use plain `pickle.load`; use the allow-list loader. Keep the vehicle ID as `dataset_car` string to avoid collisions across the three sets.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T1.3-1 | Counts | data extracted | run ingest | 1,278,277 snippets; 464 vehicles | TODO |
| T1.3-2 | Label range | same | validate | capacity labels in [24, 47] where nonzero | TODO |
| T1.3-3 | Labelled vehicles | same | count | 191 vehicles with labels | TODO |
| T1.3-4 | Vehicle ID uniqueness (edge) | car 0 appears in sets | check | IDs namespaced; no collisions | TODO |
| T1.3-5 | Unsafe pickle (security) | crafted pickle in tmp | load | blocked | TODO |
| T1.3-6 | Chemistry flag | processed | check metadata | `chemistry: "NMC-like, not LFP"` present | TODO |
| T1.3-7 | Interrupted run (failure) | kill ingest midway | rerun | Resumes or restarts cleanly, no partial parquet | TODO |
| T1.3-8 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] Counts equal Phase 0 report section 3.1.
- [ ] Peak memory under 8 GB (`/usr/bin/time -l`).

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-1-evbattery
pytest -q
git status
git add .
git commit -m "M1.3: EVBattery segments table with safe loading and provenance"
git switch main && git merge --ff-only phase-1-evbattery && git push origin main
git tag -a cp-1.3 -m "evbattery ingested" && git push origin cp-1.3
```
Do NOT commit the parquet (hundreds of MB).

### 10. Rollback / recovery
Section B revert.

---

## Phase 1 Completion Checkpoint
| Item | Record |
|---|---|
| Completed milestones | 1.1, 1.2, 1.3 |
| Tests passed | ___ / ___ |
| Known issues | e.g. Stanford cells without usable series; weather API limits |
| Git commit/hash | `git rev-parse --short cp-1.3` = ___ |
| Overall verification | `scripts/build_data.sh` builds all tables from raw; provenance for 5 datasets committed |
| Go/No-Go | GO if every provenance file exists and constraint-C1 test passes |

# PHASE 2: Cell ageing models (Layer 1)

## Milestone 2.1: Calendar ageing model fit
**Depends on:** 1.1.

### 1. Milestone name
Fit the calendar fade equation to LFP storage data.

### 2. Objective
A function `calendar_loss(t_days, temp_c, soc_pct, params)` with fitted parameters and bootstrap parameter draws saved as a JSON artifact.

### 3. Tasks to complete
- [ ] `engine/cell/calendar.py`: model `Q_loss = A * exp(-(Ea/R)(1/T - 1/Tref)) * g(SOC) * t^z`, `g` piecewise-linear at SOC nodes 0, 25, 50, 75, 100.
- [ ] `engine/train/fit_calendar.py`: `scipy.optimize.least_squares` with bounds (Ea 10 to 100 kJ/mol, z 0.3 to 1.0), robust loss (`soft_l1`).
- [ ] Bootstrap over cells (500 draws) saving a parameter matrix.
- [ ] Write `engine/artifacts/calendar_params.json` (point estimate, draws summary, fit range of T and SOC, data hash).
- [ ] Residual plot saved to `docs/figures/calendar_residuals.png` (committed, small).

### 4. Files / modules affected
`engine/cell/calendar.py`, `engine/train/fit_calendar.py`, `engine/artifacts/calendar_params.json`, `tests/test_calendar.py`, `docs/figures/`.

### 5. Implementation guidance
Why the sqrt-like time exponent: storage fade of LFP is sub-linear in time; `z` is fitted, not fixed. Fit on all labs together first; leave lab-vs-lab check to 2.2. Store the validity range (T 0 to 85 C, SOC 0 to 100) in the artifact; later layers use it for extrapolation badges. Seeded RNG.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T2.1-1 | Fit converges | calendar_obs built | run fit | Optimizer status success; Ea in bounds | TODO |
| T2.1-2 | Temperature monotone (property) | params loaded | hypothesis over T1<T2 at fixed SOC, t | loss(T2) >= loss(T1) | TODO |
| T2.1-3 | SOC monotone | same | SOC1<SOC2 above 25% | loss(SOC2) >= loss(SOC1) | TODO |
| T2.1-4 | Time monotone, zero at zero | same | loss(0)=0; t1<t2 | non-decreasing | TODO |
| T2.1-5 | Fit quality | fitted | RMSE of retention | below 0.03 (record actual) | TODO |
| T2.1-6 | Known point | fitted | predict 25 C, 100% SOC, 885 d | within 0.02 of 0.89 retention | TODO |
| T2.1-7 | Out-of-range input (validation) | params | T=120 C | Raises or returns `extrapolated=True` flag, not a silent number | TODO |
| T2.1-8 | Negative time (negative) | params | t=-1 | `ValueError` | TODO |
| T2.1-9 | Determinism | seeded | run twice | identical artifact hash | TODO |
| T2.1-10 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] Residual plot reviewed: no systematic bias by temperature.
- [ ] Artifact JSON under 200 KB and human-readable.
- [ ] Explainability: a table of fitted parameters with units written to `docs/model-card.md` (start the file).

### 8. Completion criteria
All PASS; residual plot reviewed.

### 9. Git checkpoint
```bash
git switch -c phase-2-calendar
pytest -q
git status
git add .
git commit -m "M2.1: calendar ageing model fit with bootstrap uncertainty"
git switch main && git merge --ff-only phase-2-calendar && git push origin main
git tag -a cp-2.1 -m "calendar model" && git push origin cp-2.1
```
Do NOT commit full bootstrap matrices above 1 MB (store 500 x 6 floats only).

### 10. Rollback / recovery
Section B revert; rerun `scripts/train_all.sh` to regenerate artifact.

---

## Milestone 2.2: Cross-lab validation of the calendar model
**Depends on:** 2.1.

### 1. Milestone name
Prove the calendar model generalises between labs.

### 2. Objective
Measured error when fitting on Stanford and predicting Naumann (and the reverse), reported honestly in the model card.

### 3. Tasks to complete
- [ ] `engine/train/validate_calendar.py`: fit on A, test on B, both directions, matching conditions only (overlap: about 25 to 45 C, 50 to 100% SOC).
- [ ] Leave-one-condition-out within each lab.
- [ ] Add results table to `docs/model-card.md`.
- [ ] Define an acceptance threshold in advance: mean absolute retention error under 0.05 inside overlap; if worse, document and widen bands in 3.1.

### 4. Files / modules affected
`engine/train/validate_calendar.py`, `docs/model-card.md`, `tests/test_calendar_validation.py`.

### 5. Implementation guidance
Do not tune parameters to pass the threshold. If it fails, record the failure and let the uncertainty layer absorb it. Compare error at equal elapsed time, not at "last check".

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T2.2-1 | Stanford to Naumann | fit modules | run | MAE reported, stored | TODO |
| T2.2-2 | Naumann to Stanford | same | run | MAE reported | TODO |
| T2.2-3 | Overlap selection | same | assert conditions | only conditions in both labs' range used | TODO |
| T2.2-4 | Equal-time comparison (edge) | same | check | comparison times differ by at most one reference interval | TODO |
| T2.2-5 | Threshold gate | results | assert MAE < 0.05 OR a documented waiver exists | pass or waiver file present | TODO |
| T2.2-6 | Data leak check | same | assert train/test cell IDs disjoint | pass | TODO |
| T2.2-7 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] Model card numbers match script output.
- [ ] Waiver (if any) names the reason.

### 8. Completion criteria
Results published in model card, threshold met or waived explicitly.

### 9. Git checkpoint
```bash
git switch -c phase-2-validate-calendar
pytest -q
git status
git add .
git commit -m "M2.2: cross-lab calendar validation results in model card"
git switch main && git merge --ff-only phase-2-validate-calendar && git push origin main
git tag -a cp-2.2 -m "calendar validated" && git push origin cp-2.2
```

### 10. Rollback / recovery
Section B revert (documentation and script only).

---

## Milestone 2.3: Cycle fade model
**Depends on:** 1.1, 2.1 (shared parameter conventions).

### 1. Milestone name
Fit cycle-induced capacity fade versus equivalent full cycles.

### 2. Objective
`cycle_loss(efc, temp_c, c_rate, params)` fitted on HUST (30 C, protocols varying in rate), with the temperature term clearly flagged as unsupported by data.

### 3. Tasks to complete
- [ ] `engine/cell/cycle.py`: `Q_cyc = B * h(C) * EFC^m`; temperature factor from Arrhenius with activation energy set from literature range and marked `assumed`, because HUST is single-temperature.
- [ ] Fit per cell, then pooled with random effect for cell (statsmodels `MixedLM`) to get between-cell spread.
- [ ] Save `cycle_params.json` including `temperature_term: "assumed"` and C-rate coverage (min/max in HUST).
- [ ] Document in the model card.

### 4. Files / modules affected
`engine/cell/cycle.py`, `engine/train/fit_cycle.py`, `engine/artifacts/cycle_params.json`, `tests/test_cycle.py`, `docs/model-card.md`.

### 5. Implementation guidance
Why mixed model: 77 cells from one batch; the between-cell spread is the real uncertainty source and must flow to bands. Honest limit: no public LFP cycling above 35 C; the engine must return `extrapolated=True` for such input. Combination with calendar is additive; test that combined loss never decreases.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T2.3-1 | Fit converges | HUST table | run | success; m in plausible bounds (0.5 to 1.5) | TODO |
| T2.3-2 | EFC monotone | params | property test | loss non-decreasing in EFC, zero at zero | TODO |
| T2.3-3 | C-rate monotone | params | property test within HUST C range | higher C never less loss | TODO |
| T2.3-4 | Between-cell spread | fit | read artifact | spread SD reported and > 0 | TODO |
| T2.3-5 | Fit quality | fit | RMSE vs observed HUST fade | below 0.03 (record actual) | TODO |
| T2.3-6 | Extrapolation flag | params | T=45 C, C=3 | `extrapolated=True` | TODO |
| T2.3-7 | Combined loss | calendar + cycle | property | total >= each part; total non-decreasing in time | TODO |
| T2.3-8 | Invalid inputs | params | EFC=-5, C=0 | `ValueError` | TODO |
| T2.3-9 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] Fitted vs observed plot for 6 random cells reviewed.
- [ ] Model card clearly says temperature term is assumed.

### 8. Completion criteria
All PASS; assumption flagged in artifact and card.

### 9. Git checkpoint
```bash
git switch -c phase-2-cycle
pytest -q
git status
git add .
git commit -m "M2.3: cycle fade model with mixed-effects spread"
git switch main && git merge --ff-only phase-2-cycle && git push origin main
git tag -a cp-2.3 -m "cycle model" && git push origin cp-2.3
```

### 10. Rollback / recovery
Section B revert.

---

## Milestone 2.4: Early-life cycle-life predictor
**Depends on:** 1.1, 2.3.

### 1. Milestone name
Predict cycle life from the first 100 cycles and decide which model family to keep.

### 2. Objective
Promote the Phase 0 baseline into a validated component used for the **calibration-style correction** (a cell's own early fade adjusts the prior), with a recorded model-selection decision.

### 3. Tasks to complete
- [ ] Features: capacity at cycle 1, fade slope cycles 10 to 100, `dq100_10`, minimum capacity in first 100 (the Phase 0 set), plus Severson-style dQ(V) variance computed per-protocol-aware (compare to the crude version).
- [ ] Candidates: ElasticNetCV, `HistGradientBoostingRegressor`, and mean baseline. Leave-one-cell-out.
- [ ] Choose by LOO MAPE; ties go to the simpler model.
- [ ] Save chosen model as `engine/artifacts/early_life.json` (ElasticNet coefficients) or joblib (ignored; rebuilt) with feature scaler.
- [ ] Explainability: coefficient table or permutation importance saved to model card.

### 4. Files / modules affected
`engine/cell/early_life.py`, `engine/train/fit_early_life.py`, `engine/artifacts/early_life.json`, `tests/test_early_life.py`, `docs/model-card.md`.

### 5. Implementation guidance
Compare against the stored Phase 0 numbers (mean 17.7%, capacity features 12.7%). Do not claim improvement unless the LOO result is better by more than the bootstrap standard error. Target: beat naive baseline. Output includes `uncertainty` placeholder filled in 3.1.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T2.4-1 | Reproduces Phase 0 | HUST table | evaluate capacity-feature ElasticNet | LOO MAPE 12.7% ± 0.3 | TODO |
| T2.4-2 | Beats naive | same | compare | MAPE below mean-only (17.7%) | TODO |
| T2.4-3 | Selection recorded | selection run | read model card | winner and runner-up listed with MAPE | TODO |
| T2.4-4 | Feature validation | input with NaN | predict | `ValueError` listing the field | TODO |
| T2.4-5 | Input too short (edge) | cell with 50 cycles | predict | Refuses: "need at least 100 cycles" | TODO |
| T2.4-6 | Output sanity | any cell | predict | positive, finite, below 10,000 | TODO |
| T2.4-7 | Explainability | fitted | read importance | at least top 3 features named with signs | TODO |
| T2.4-8 | No leakage | features | assert features use only cycles ≤ 100 | pass | TODO |
| T2.4-9 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] Residuals vs true life plotted; no strong heteroscedasticity unexplained.
- [ ] Decision paragraph in model card.

### 8. Completion criteria
All PASS; decision recorded.

### 9. Git checkpoint
```bash
git switch -c phase-2-early-life
pytest -q
git status
git add .
git commit -m "M2.4: early-life cycle-life predictor with recorded model selection"
git switch main && git merge --ff-only phase-2-early-life && git push origin main
git tag -a cp-2.4 -m "early-life predictor" && git push origin cp-2.4
```

### 10. Rollback / recovery
Section B revert.

---

## Phase 2 Completion Checkpoint
| Item | Record |
|---|---|
| Completed milestones | 2.1 to 2.4 |
| Tests passed | ___ / ___ |
| Known issues | cycle temperature term assumed; single cell type; one batch |
| Git commit/hash | `git rev-parse --short cp-2.4` = ___ |
| Overall verification | `scripts/train_all.sh` regenerates all artifacts byte-identically; model card complete |
| Go/No-Go | GO if monotonicity and extrapolation-flag tests pass; otherwise NO-GO |

---

# PHASE 3: Uncertainty, bus translation and decisions (Layers 2 and 4)

## Milestone 3.1: Uncertainty bands
**Depends on:** 2.1 to 2.4.

### 1. Milestone name
Combine parameter uncertainty and residual uncertainty into p10/p50/p90 bands with checked coverage.

### 2. Objective
`predict_retention(scenario_cell_inputs, n_draws)` returns percentile bands; the nominal 80% band achieves 70 to 90% empirical coverage under leave-one-cell-out.

### 3. Tasks to complete
- [ ] `engine/cell/uncertainty.py`: draw parameter sets from bootstrap, add conformal residual quantiles from leave-one-cell-out.
- [ ] `engine/train/check_coverage.py` computing coverage for calendar (leave-one-condition-out) and cycle (leave-one-cell-out).
- [ ] Widen bands (documented factor) when `extrapolated=True`.
- [ ] Add coverage table to the model card.

### 4. Files / modules affected
`engine/cell/uncertainty.py`, `engine/train/check_coverage.py`, `tests/test_uncertainty.py`, `docs/model-card.md`.

### 5. Implementation guidance
Why conformal: no distributional assumption, valid with small samples when residuals are exchangeable. State the exchangeability limitation (same batch). Use fixed seeds; vectorise with numpy (N=2000 draws under 100 ms).

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T3.1-1 | Band ordering | any input | predict | p10 <= p50 <= p90 at every time | TODO |
| T3.1-2 | Coverage cycle | LOCO | run | 70% to 90% | TODO |
| T3.1-3 | Coverage calendar | LOCO | run | 70% to 90% (or documented waiver) | TODO |
| T3.1-4 | Extrapolation widens | T=45 C cycling | predict vs T=30 | band width larger | TODO |
| T3.1-5 | Determinism | seed fixed | run twice | identical output | TODO |
| T3.1-6 | Speed | N=2000 | time | under 200 ms | TODO |
| T3.1-7 | Invalid n_draws | n=0 | call | `ValueError` | TODO |
| T3.1-8 | Retention bounds | any | predict | all values in [0, 1.0] | TODO |
| T3.1-9 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] Coverage numbers pasted into model card.
- [ ] If coverage outside 70 to 90%, a documented waiver or fix exists.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-3-uncertainty
pytest -q
git status
git add .
git commit -m "M3.1: uncertainty bands with checked coverage"
git switch main && git merge --ff-only phase-3-uncertainty && git push origin main
git tag -a cp-3.1 -m "uncertainty" && git push origin cp-3.1
```

### 10. Rollback / recovery
Section B revert.

---

## Milestone 3.2: Bus translation layer
**Depends on:** 1.2, 3.1.

### 1. Milestone name
Turn bus duty-cycle inputs into cell-level operating conditions.

### 2. Objective
`translate(scenario) -> CellConditions` (EFC per year, mean C-rate, SOC window, time at high SOC, monthly cell temperature) plus the explicit pack penalty.

### 3. Tasks to complete
- [ ] `engine/bus/archetypes.json` (12 m: about 350 kWh; 9 m: about 250 kWh; each field with `source` and `evidence_level: "assumption"`).
- [ ] `engine/bus/scenario.py` pydantic models with units and bounds.
- [ ] `engine/bus/translate.py`: energy per day / usable capacity = EFC/day; average C-rate from charge window; time at SOC cap from schedule.
- [ ] Thermal: `T_cell = T_ambient + k_heat * I²-term - k_cool` coefficients as named assumptions in config.
- [ ] Pack penalty: factor sampled from user range (default 0 to 8%), flagged "assumption, no public data".

### 4. Files / modules affected
`engine/bus/archetypes.json`, `scenario.py`, `translate.py`, `thermal.py`, `tests/test_bus.py`.

### 5. Implementation guidance
Pydantic gives validation and later reuses as API schema (single source of truth, avoids drift). Archetype numbers: put references in the JSON `source` field; any number without a source is labelled `assumption`. Do not invent route data; `km_per_day` and `kWh_per_km` are user inputs with default ranges.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T3.2-1 | Basic translation | default 12 m scenario | translate | EFC/day = (km × kWh/km) / usable kWh within 1e-9 | TODO |
| T3.2-2 | Doubling distance | same | km ×2 | EFC/year doubles | TODO |
| T3.2-3 | Hotter zone | zone swap | translate | mean cell temperature higher | TODO |
| T3.2-4 | SOC cap effect | cap 90 vs 100 | translate | time-at-high-SOC lower for 90 | TODO |
| T3.2-5 | Invalid input | km=-5, SOC cap 120 | validate | pydantic errors naming fields | TODO |
| T3.2-6 | Impossible duty (edge) | daily energy > usable capacity × charges/day | translate | warning "duty exceeds pack capacity", no crash | TODO |
| T3.2-7 | Labels | any | translate | every returned number has `evidence_level` | TODO |
| T3.2-8 | Pack penalty bounds | penalty 0 to 8% | sample | within range, deterministic with seed | TODO |
| T3.2-9 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] Hand-calculate one scenario and compare.
- [ ] Every archetype field has `source` or `assumption`.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-3-bus
pytest -q
git status
git add .
git commit -m "M3.2: bus translation layer with labelled assumptions"
git switch main && git merge --ff-only phase-3-bus && git push origin main
git tag -a cp-3.2 -m "bus translation" && git push origin cp-3.2
```

### 10. Rollback / recovery
Section B revert.

---

## Milestone 3.3: Replacement-window Monte Carlo
**Depends on:** 3.1, 3.2.

### 1. Milestone name
Probability of reaching the replacement threshold over time.

### 2. Objective
`replacement_window(scenario, threshold=0.8, n=2000)` returns p10/p50/p90 dates and P(replace by month m), plus the calendar/cycle driver split.

### 3. Tasks to complete
- [ ] `engine/decide/replacement.py` vectorised simulation.
- [ ] Time grid monthly to 15 years; censoring: if threshold not reached, report "beyond horizon".
- [ ] Driver split: fraction of loss from calendar vs cycle at the median crossing.
- [ ] Shared random draws API for paired what-if comparison (used in 3.4).

### 4. Files / modules affected
`engine/decide/replacement.py`, `tests/test_replacement.py`.

### 5. Implementation guidance
Use one `numpy.random.Generator` seeded per request; pass the same draws to compared scenarios. Threshold is a user input (default 80%, bounds 50 to 95%).

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T3.3-1 | Percentile order | default | run | p10 <= p50 <= p90 | TODO |
| T3.3-2 | More distance, earlier | km ×1.5 | compare p50 | earlier | TODO |
| T3.3-3 | Hotter, earlier | zone swap | compare | earlier or equal | TODO |
| T3.3-4 | Threshold monotone | 85% vs 75% | compare | 85% crossed earlier | TODO |
| T3.3-5 | Censoring (edge) | very light duty | run | "beyond horizon" with probability stated | TODO |
| T3.3-6 | Probability curve | default | check | P non-decreasing from 0 to ≤1 | TODO |
| T3.3-7 | Paired draws | same scenario twice | run with shared draws | identical outputs | TODO |
| T3.3-8 | Speed | n=2000 | time | under 2 s | TODO |
| T3.3-9 | Invalid threshold | 1.2 | call | `ValueError` | TODO |
| T3.3-10 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] Hand check: constant-fade case reproduces analytic crossing time.
- [ ] Driver split sums to 1.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-3-replacement
pytest -q
git status
git add .
git commit -m "M3.3: replacement-window Monte Carlo with paired draws"
git switch main && git merge --ff-only phase-3-replacement && git push origin main
git tag -a cp-3.3 -m "replacement window" && git push origin cp-3.3
```

### 10. Rollback / recovery
Section B revert.

---

## Milestone 3.4: Range, cost per km and what-if comparison
**Depends on:** 3.3. Needs missing-information item 2.

### 1. Milestone name
Seasonal range, cost per km, and paired scenario comparison.

### 2. Objective
`monthly_range`, `cost_per_km` with sensitivity, and `compare(scenarios)` returning deltas computed on shared draws.

### 3. Tasks to complete
- [ ] Search for a measured source for temperature effect on usable LFP capacity/range. If none, implement as a **user assumption** with default 1.0 and say so.
- [ ] `engine/decide/range.py`, `cost.py`, `compare.py`.
- [ ] Sensitivity: ± range on battery price, threshold, km/day (tornado data).
- [ ] Extrapolation badges aggregated into `warnings`.

### 4. Files / modules affected
`engine/decide/range.py`, `cost.py`, `compare.py`, `docs/range-temperature-source.md`, `tests/test_decide.py`.

### 5. Implementation guidance
Cost per km = battery price / lifetime km to threshold (undiscounted; state this). Comparison deltas reported with their own interval (difference of paired draws), not the difference of intervals.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T3.4-1 | Cost scaling | price ×2 | compute | cost/km ×2 | TODO |
| T3.4-2 | Lifetime inverse | lifetime ×2 | compute | cost/km ÷2 | TODO |
| T3.4-3 | Range ≤ new-pack range | any month | compute | monthly range ≤ nominal at same temperature factor | TODO |
| T3.4-4 | 90% vs 100% cap | compare | run | delta sign: lower cap → later replacement | TODO |
| T3.4-5 | Delta interval | compare | check | delta has its own p10/p90, p10 ≤ p50 ≤ p90 | TODO |
| T3.4-6 | Identical scenarios | compare A,A | run | delta exactly 0 | TODO |
| T3.4-7 | Unsupported what-if (negative) | C-rate beyond coverage | run | warning "extrapolated" | TODO |
| T3.4-8 | Missing price | price absent | call | `ValueError` or cost omitted with warning (documented choice) | TODO |
| T3.4-9 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] Source document for temperature effect exists or assumption clearly stated.
- [ ] Sensitivity ranking sanity-checked by hand.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-3-decisions
pytest -q
git status
git add .
git commit -m "M3.4: seasonal range, cost per km, paired what-if comparison"
git switch main && git merge --ff-only phase-3-decisions && git push origin main
git tag -a cp-3.4 -m "decision layer" && git push origin cp-3.4
```

### 10. Rollback / recovery
Section B revert.

---

## Phase 3 Completion Checkpoint
| Item | Record |
|---|---|
| Completed milestones | 3.1 to 3.4 |
| Tests passed | ___ / ___ |
| Known issues | pack penalty and thermal coefficients are assumptions; range factor source status |
| Git commit/hash | `git rev-parse --short cp-3.4` = ___ |
| Overall verification | run one end-to-end Python script `scripts/demo_predict.py` for each preset; all outputs labelled |
| Go/No-Go | GO if the engine works without any web code (a Python-only demo succeeds) and labels test passes |


# PHASE 4: Backend API

Authentication note: v1 has no user accounts (SDD section 10), so there is no login to test. Instead each backend milestone includes abuse and input-limit tests (oversized bodies, CORS, error leakage). If you later add accounts, add a phase for it.

## Milestone 4.1: API skeleton with health and error handling
**Depends on:** Phase 3.

### 1. Milestone name
Runnable FastAPI app with `/api/v1/health` and uniform errors.

### 2. Objective
A server that starts, reports model artifact versions, and returns structured errors without stack traces.

### 3. Tasks to complete
- [ ] `pip install fastapi uvicorn httpx` (httpx for tests); update requirements.
- [ ] `backend/app/main.py`, `backend/app/errors.py`, `backend/app/config.py` (reads env, defaults safe).
- [ ] `GET /api/v1/health` returns status and artifact versions/hashes.
- [ ] CORS restricted to configured origins (default `http://localhost:5173`).
- [ ] Request body size limit (1 MB) and exception handlers.

### 4. Files / modules affected
`backend/app/{main,errors,config}.py`, `backend/tests/test_health.py`, `requirements.txt`, `scripts/dev_backend.sh`.

### 5. Implementation guidance
FastAPI is used because pydantic models from `engine.bus.scenario` become the request schema directly (no duplicate definitions). Load artifacts once at startup (lifespan). Config via environment, `.env.example` committed, `.env` ignored.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T4.1-1 | Health ok | app running | `curl localhost:8000/api/v1/health` | 200, JSON with `status:"ok"`, artifact versions | TODO |
| T4.1-2 | Unknown route | running | GET /nope | 404 JSON error, no stack | TODO |
| T4.1-3 | Missing artifact (failure) | rename an artifact | start app | Fails fast with named artifact; health not served | TODO |
| T4.1-4 | CORS allowed | origin localhost:5173 | OPTIONS | allowed header present | TODO |
| T4.1-5 | CORS blocked (security) | origin evil.example | OPTIONS | no allow-origin header | TODO |
| T4.1-6 | Oversized body | 2 MB POST | send | 413 | TODO |
| T4.1-7 | Error leakage | force exception | call | 500 generic message, no traceback text | TODO |
| T4.1-8 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] `uvicorn backend.app.main:app --port 8000` starts in under 5 s.
- [ ] `/docs` OpenAPI page loads.
- [ ] `.env` absent from git.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-4-api-skeleton
pytest -q
git status
git add .
git commit -m "M4.1: FastAPI skeleton, health endpoint, error handling, CORS"
git switch main && git merge --ff-only phase-4-api-skeleton && git push origin main
git tag -a cp-4.1 -m "api skeleton" && git push origin cp-4.1
```
Do NOT commit `.env`.

### 10. Rollback / recovery
Section B revert.

---

## Milestone 4.2: `POST /predict`
**Depends on:** 4.1.

### 1. Milestone name
End-to-end prediction endpoint.

### 2. Objective
Scenario in, full labelled result out (bands, replacement window, range, cost, driver split, warnings).

### 3. Tasks to complete
- [ ] Response schema `PredictionResult` with a `Labelled[T]` wrapper `{value, unit, evidence_level, validated_on_buses}`.
- [ ] Route calling engine functions; seed from request or default.
- [ ] Always set `mode:"prior"`, `model_version`, `warnings[]`.
- [ ] Contract test that every numeric leaf is labelled.
- [ ] Export OpenAPI JSON to `docs/openapi.json` (generated, committed for the frontend).

### 4. Files / modules affected
`backend/app/schemas.py`, `backend/app/routes/predict.py`, `backend/tests/test_predict.py`, `docs/openapi.json`.

### 5. Implementation guidance
Run the engine in a threadpool (`run_in_threadpool`) so Monte Carlo does not block the event loop. Cache by scenario hash (LRU, 128 entries). Limit maximum horizon and draws server-side (anti-abuse).

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T4.2-1 | Default scenario | app up | POST preset JSON | 200; all required sections present | TODO |
| T4.2-2 | Labels everywhere | same | walk JSON | every number has `evidence_level` and `validated_on_buses:false` | TODO |
| T4.2-3 | Schema validation | km=-1 | POST | 422 naming `km_per_day` | TODO |
| T4.2-4 | Unknown field (negative) | extra key | POST | 422 (extra forbidden) | TODO |
| T4.2-5 | Extrapolation | T high via zone override | POST | `warnings` contains extrapolation | TODO |
| T4.2-6 | Determinism | same seed twice | POST | identical body | TODO |
| T4.2-7 | Cache | repeat | POST twice | second faster; same body | TODO |
| T4.2-8 | Abuse limits | n_draws=10^7 | POST | 422 (max 5000) | TODO |
| T4.2-9 | Concurrency | 20 parallel | httpx gather | all 200, none over 5 s | TODO |
| T4.2-10 | Engine failure | monkeypatch raise | POST | 500 generic; logged server-side | TODO |
| T4.2-11 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] Manual `curl` of each preset.
- [ ] `docs/openapi.json` regenerated and matches the running app.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-4-predict
pytest -q
git status
git add .
git commit -m "M4.2: labelled POST /predict with caching and abuse limits"
git switch main && git merge --ff-only phase-4-predict && git push origin main
git tag -a cp-4.2 -m "predict endpoint" && git push origin cp-4.2
```

### 10. Rollback / recovery
Section B revert. The frontend does not exist yet, so no downstream breakage.

---

## Milestone 4.3: compare, presets, zones, evidence
**Depends on:** 4.2.

### 1. Milestone name
Remaining read and compare endpoints.

### 2. Objective
`POST /compare`, `GET /presets`, `GET /zones`, `GET /evidence` complete the API surface used by the UI.

### 3. Tasks to complete
- [ ] `/compare` accepts 2 to 4 scenarios, returns aligned results and paired deltas.
- [ ] `/presets` from `archetypes.json`; `/zones` from `zones.json` with provenance.
- [ ] `/evidence` assembled from provenance files and the model card metrics (machine-readable `engine/artifacts/metrics.json` written by training scripts).
- [ ] Regenerate `docs/openapi.json`.

### 4. Files / modules affected
`backend/app/routes/{compare,presets,zones,evidence}.py`, `engine/artifacts/metrics.json`, tests.

### 5. Implementation guidance
Evidence values must come from files produced by training scripts, never hand-typed (prevents the UI quoting stale numbers).

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T4.3-1 | Presets | up | GET | 2 archetypes, each field has source/assumption | TODO |
| T4.3-2 | Zones | up | GET | 4 zones × 12 months, provenance link | TODO |
| T4.3-3 | Evidence | up | GET | contains HUST 12.7%, EVBattery 2.29% from metrics.json | TODO |
| T4.3-4 | Compare A vs B | up | POST | delta sign correct for 90% cap | TODO |
| T4.3-5 | Compare identical | up | POST A,A | delta 0 | TODO |
| T4.3-6 | Too many scenarios | 5 | POST | 422 | TODO |
| T4.3-7 | One scenario | 1 | POST | 422 | TODO |
| T4.3-8 | Stale metrics (integration) | change metrics.json | GET evidence | reflects change | TODO |
| T4.3-9 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] All endpoints visible in `/docs`.
- [ ] `docs/openapi.json` updated.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-4-endpoints
pytest -q
git status
git add .
git commit -m "M4.3: compare, presets, zones, evidence endpoints"
git switch main && git merge --ff-only phase-4-endpoints && git push origin main
git tag -a cp-4.3 -m "api complete" && git push origin cp-4.3
```

### 10. Rollback / recovery
Section B revert.

---

## Phase 4 Completion Checkpoint
| Item | Record |
|---|---|
| Completed milestones | 4.1 to 4.3 |
| Tests passed | ___ / ___ |
| Known issues | no auth by design; cache is in-memory |
| Git commit/hash | `git rev-parse --short cp-4.3` = ___ |
| Overall verification | start server, run `scripts/smoke_api.sh` hitting every endpoint |
| Go/No-Go | GO if OpenAPI is final (frontend depends on it) and label contract test passes |

---

# PHASE 5: Frontend core

## Milestone 5.1: Scaffold, API client and global chrome
**Depends on:** 4.3 (needs `docs/openapi.json`).

### 1. Milestone name
React app shell with typed API client, mode chip and "not validated" banner.

### 2. Objective
`npm run dev` shows an app shell that calls `/health` and displays the permanent honesty labels.

### 3. Tasks to complete
- [ ] `npm create vite@latest frontend -- --template react-ts`; add Tailwind, `@tanstack/react-query` (caching and loading/error states), `zustand` only if cross-page state needs it (otherwise skip).
- [ ] Generate typed client from `docs/openapi.json` (`openapi-typescript`).
- [ ] Layout: header with chips "Prior mode (no vendor data)" and "Not yet validated on buses"; router with 4 routes (Scenario, Results, Evidence, Method).
- [ ] Theme tokens light/dark (use the `impeccable` skill for design decisions before styling).
- [ ] Vitest + Testing Library setup.

### 4. Files / modules affected
`frontend/package.json`, `vite.config.ts` (proxy `/api` to :8000), `src/api/`, `src/layout/`, `src/pages/*`, `src/theme/`, tests.

### 5. Implementation guidance
Each added library needs a reason: React Query handles caching/retry of server data; `openapi-typescript` prevents API/UI drift; Vitest for component tests. Skip Redux. Commit `package-lock.json`, not `node_modules`.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T5.1-1 | App renders | `npm run dev` | open page | header chips visible | TODO |
| T5.1-2 | Backend up | API running | load | health indicator green | TODO |
| T5.1-3 | Backend down (failure) | API stopped | load | friendly error with retry, no blank screen | TODO |
| T5.1-4 | Chips always visible (regression guard) | any route | navigate all 4 routes | chips present on each | TODO |
| T5.1-5 | Type drift | change openapi | `npm run gen:api && npm run typecheck` | compile error flags mismatch | TODO |
| T5.1-6 | Dark mode | toggle | check contrast | text readable in both | TODO |
| T5.1-7 | Build | none | `npm run build` | succeeds; no warnings as errors | TODO |
| T5.1-8 | Regression | backend tests | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] `npm run lint && npm run typecheck && npm test` all pass.
- [ ] `git status` shows no `node_modules` or `dist`.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-5-scaffold
(cd frontend && npm run lint && npm run typecheck && npm test -- --run && npm run build)
pytest -q
git status
git add .
git commit -m "M5.1: frontend scaffold with typed API client and honesty chips"
git switch main && git merge --ff-only phase-5-scaffold && git push origin main
git tag -a cp-5.1 -m "frontend scaffold" && git push origin cp-5.1
```
Do NOT commit `node_modules`, `dist`, `.env.local`.

### 10. Rollback / recovery
Section B revert. Local reset of dependencies: `rm -rf frontend/node_modules && (cd frontend && npm ci)`.

---

## Milestone 5.2: Scenario builder panel
**Depends on:** 5.1.

### 1. Milestone name
Form for bus, duty, charging, zone, battery cost with assumption badges.

### 2. Objective
User edits a scenario; invalid values are caught client-side and server-side; scenario persists in URL.

### 3. Tasks to complete
- [ ] Load presets and zones; archetype selector fills defaults.
- [ ] Fields with unit, bounds, default source, "assumption" badge, tooltip explaining each in plain words.
- [ ] URL query serialisation (shareable link).
- [ ] Disable "Run" while invalid; show server 422 messages next to fields.

### 4. Files / modules affected
`src/pages/Scenario.tsx`, `src/components/FieldWithBadge.tsx`, `src/state/scenario.ts`, tests.

### 5. Implementation guidance
Reuse bounds from OpenAPI so UI and API validate identically. Default focus order and labels for accessibility from the start.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T5.2-1 | Preset fills form | API up | choose 9 m | fields update to archetype values | TODO |
| T5.2-2 | Client validation | typing km=-5 | blur | inline error, Run disabled | TODO |
| T5.2-3 | Server error mapping | force 422 | submit | message under correct field | TODO |
| T5.2-4 | URL round trip | edit, copy URL, reload | reload | same values | TODO |
| T5.2-5 | Badges | any | inspect | each assumption field shows badge | TODO |
| T5.2-6 | Keyboard use | none | tab through | all controls reachable, visible focus | TODO |
| T5.2-7 | Malformed URL (negative) | `?km=abc` | open | falls back to defaults with notice | TODO |
| T5.2-8 | Mobile width | 375 px | open | no horizontal scroll | TODO |
| T5.2-9 | Regression | earlier | tests all | pass | TODO |

### 7. Verification checklist
- [ ] Screenshots at 1280 px and 375 px, light and dark.
- [ ] Every field in API schema appears in the form (script compares).

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-5-scenario
(cd frontend && npm run lint && npm run typecheck && npm test -- --run && npm run build) && pytest -q
git status
git add .
git commit -m "M5.2: scenario builder with validation and shareable URL"
git switch main && git merge --ff-only phase-5-scenario && git push origin main
git tag -a cp-5.2 -m "scenario builder" && git push origin cp-5.2
```

### 10. Rollback / recovery
Section B revert.

---

## Milestone 5.3: Health curve and replacement-window panels
**Depends on:** 5.2.

### 1. Milestone name
First two result panels.

### 2. Objective
Run a scenario and see retention curve with p10 to p90 band, threshold line, calendar/cycle split, and the replacement probability panel with p10/p50/p90 dates.

### 3. Tasks to complete
- [ ] Chart library chosen (Recharts vs visx; decide and record in SDD section 13).
- [ ] `HealthCurve.tsx`, `ReplacementWindow.tsx`, `EvidenceBadge.tsx`.
- [ ] Loading, empty, error and "beyond horizon" states.
- [ ] Text alternative (data table toggle) for each chart.
- [ ] Use `dataviz` skill for colour and form decisions.

### 4. Files / modules affected
`src/pages/Results.tsx`, `src/components/charts/*`, tests.

### 5. Implementation guidance
Band drawn as area between p10 and p90; median line; threshold dashed. Never display a single replacement date without its range.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T5.3-1 | Run default | API up | Run | curve and window render | TODO |
| T5.3-2 | Band correctness | mock response | render | band edges equal p10/p90 values | TODO |
| T5.3-3 | Range always shown | any | check | replacement shows range, not point | TODO |
| T5.3-4 | Beyond horizon | light duty | run | message "not reached within 15 years" | TODO |
| T5.3-5 | Loading state | slow API | run | skeleton visible, no flash | TODO |
| T5.3-6 | API error | 500 | run | error message with retry | TODO |
| T5.3-7 | Labels | any | inspect | evidence badge on every number | TODO |
| T5.3-8 | Table alternative | toggle | click | table shows same values | TODO |
| T5.3-9 | Extrapolation badge | hot cycling input | run | badge visible | TODO |
| T5.3-10 | Regression | earlier | all tests | pass | TODO |

### 7. Verification checklist
- [ ] Numbers on screen equal `curl` output for same scenario.
- [ ] Screen reader label on charts.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-5-results
(cd frontend && npm run lint && npm run typecheck && npm test -- --run && npm run build) && pytest -q
git status
git add .
git commit -m "M5.3: health curve and replacement-window panels"
git switch main && git merge --ff-only phase-5-results && git push origin main
git tag -a cp-5.3 -m "core results" && git push origin cp-5.3
```

### 10. Rollback / recovery
Section B revert.

---

## Phase 5 Completion Checkpoint
| Item | Record |
|---|---|
| Completed milestones | 5.1 to 5.3 |
| Tests passed | ___ / ___ |
| Known issues | chart library decision, 3D not started |
| Git commit/hash | `git rev-parse --short cp-5.3` = ___ |
| Overall verification | full flow: choose preset, edit, run, read results, matches `curl` |
| Go/No-Go | GO if the minimal demo (scenario to results) works on a fresh clone following README |

---

# PHASE 6: Frontend advanced

## Milestone 6.1: 3D bus with pack zones
**Depends on:** 5.3.

### 1. Milestone name
Procedural 3D bus coloured by projected health.

### 2. Objective
Interactive bus (rotate, zoom), pack zones coloured from the retention at a year chosen with a scrubber; hover shows numbers with labels.

### 3. Tasks to complete
- [ ] Add `three`, `@react-three/fiber`, `@react-three/drei` (reason: declarative 3D, orbit controls, no external model files, so no licensing).
- [ ] `three/Bus.tsx` built from boxes/cylinders; zones: roof pack, under-floor pack.
- [ ] Colour scale (colour-blind safe) mapped to retention; legend.
- [ ] Year scrubber synced with Health curve.
- [ ] Fallback when WebGL is unavailable.
- [ ] Zone-level differences only if the model provides them (v1: one pack value plus pack-penalty spread; do not invent per-zone temperature without a model).

### 4. Files / modules affected
`src/three/*`, `src/components/YearScrubber.tsx`, tests.

### 5. Implementation guidance
Lazy-load the 3D bundle (code-splitting) to keep first load small. Unit-test the colour mapping (pure function), not WebGL pixels. Honesty: if zones show the same colour, say "pack-level estimate".

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T6.1-1 | Renders | results loaded | open | canvas present, no console errors | TODO |
| T6.1-2 | Colour mapping | unit | retention 1.0 / 0.8 / 0.6 | distinct colours; monotone lightness | TODO |
| T6.1-3 | Scrubber sync | results | move to year 5 | bus colour and curve marker match | TODO |
| T6.1-4 | No WebGL (failure) | disable WebGL | open | fallback card with the numbers | TODO |
| T6.1-5 | Hover numbers | results | hover pack | tooltip with value, unit, label | TODO |
| T6.1-6 | Performance | mid laptop | rotate | ≥ 30 fps | TODO |
| T6.1-7 | Bundle size | build | check | 3D chunk lazy; main chunk under 300 KB gz | TODO |
| T6.1-8 | Reduced motion | OS setting | open | no auto-rotation | TODO |
| T6.1-9 | Regression | earlier | all tests | pass | TODO |

### 7. Verification checklist
- [ ] Screenshot at years 0, 5, 10.
- [ ] Colour-blind simulation check.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-6-bus3d
(cd frontend && npm run lint && npm run typecheck && npm test -- --run && npm run build) && pytest -q
git status
git add .
git commit -m "M6.1: procedural 3D bus with health colouring and year scrubber"
git switch main && git merge --ff-only phase-6-bus3d && git push origin main
git tag -a cp-6.1 -m "3d bus" && git push origin cp-6.1
```

### 10. Rollback / recovery
Section B revert; 3D is lazy-loaded so the rest of the app is unaffected if you revert only this commit.

---

## Milestone 6.2: Seasonal range and cost per km panels
**Depends on:** 5.3.

### 1. Milestone name
Two more result panels.

### 2. Objective
Monthly range bars for the chosen zone and a cost per km card with sensitivity tornado.

### 3. Tasks to complete
- [ ] `SeasonalRange.tsx`, `CostPerKm.tsx`, `Tornado.tsx`.
- [ ] Show which inputs are assumptions inside the tooltip.
- [ ] Handle cost omitted (price not supplied).

### 4. Files / modules affected
`src/components/*`, `src/pages/Results.tsx`, tests.

### 5. Implementation guidance
Reuse the chart components and text-alternative pattern from 5.3.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T6.2-1 | Range bars | results | render | 12 bars, values equal API | TODO |
| T6.2-2 | Cost card | results | render | value, unit, label, interval | TODO |
| T6.2-3 | Tornado order | results | render | sorted by effect size | TODO |
| T6.2-4 | No price | price empty | run | card says "enter battery cost" | TODO |
| T6.2-5 | Zone change | switch zone | run | range pattern changes | TODO |
| T6.2-6 | Labels | any | inspect | assumption badges present | TODO |
| T6.2-7 | Regression | earlier | tests | pass | TODO |

### 7. Verification checklist
- [ ] Values equal `curl` output.
- [ ] Mobile layout checked.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-6-range-cost
(cd frontend && npm run lint && npm run typecheck && npm test -- --run && npm run build) && pytest -q
git status
git add .
git commit -m "M6.2: seasonal range and cost-per-km panels"
git switch main && git merge --ff-only phase-6-range-cost && git push origin main
git tag -a cp-6.2 -m "range and cost" && git push origin cp-6.2
```

### 10. Rollback / recovery
Section B revert.

---

## Milestone 6.3: What-if comparison
**Depends on:** 6.2.

### 1. Milestone name
Side-by-side scenario comparison.

### 2. Objective
Pick a base and a variant (charge cap, charge rate, start time); see deltas with their own intervals.

### 3. Tasks to complete
- [ ] `WhatIf.tsx`: variant editor overriding only changed fields.
- [ ] Call `/compare`; show delta cards and overlaid curves.
- [ ] Extrapolation warnings per variant.

### 4. Files / modules affected
`src/pages/WhatIf.tsx`, `src/components/DeltaCard.tsx`, tests.

### 5. Implementation guidance
Delta comes from the API (paired draws); never subtract displayed medians in the browser.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T6.3-1 | 90% vs 100% cap | API | run | later replacement shown with range | TODO |
| T6.3-2 | Identical | same | run | delta 0, message "no difference" | TODO |
| T6.3-3 | Delta uses API | mock | render | UI shows API delta, not computed one | TODO |
| T6.3-4 | Extrapolated variant | hot cycling | run | warning badge on variant | TODO |
| T6.3-5 | API error | 500 | run | error with retry | TODO |
| T6.3-6 | Share link | edit | copy URL | reload reproduces | TODO |
| T6.3-7 | Regression | earlier | tests | pass | TODO |

### 7. Verification checklist
- [ ] Sign of every delta checked against engine tests (T3.4-4).

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-6-whatif
(cd frontend && npm run lint && npm run typecheck && npm test -- --run && npm run build) && pytest -q
git status
git add .
git commit -m "M6.3: what-if comparison with paired deltas"
git switch main && git merge --ff-only phase-6-whatif && git push origin main
git tag -a cp-6.3 -m "what-if" && git push origin cp-6.3
```

### 10. Rollback / recovery
Section B revert.

---

## Phase 6 Completion Checkpoint
| Item | Record |
|---|---|
| Completed milestones | 6.1 to 6.3 |
| Tests passed | ___ / ___ |
| Known issues | 3D zone detail limited by model |
| Git commit/hash | `git rev-parse --short cp-6.3` = ___ |
| Overall verification | all 8 panels reachable except Evidence/Method; demo script of 3 minutes runs |
| Go/No-Go | GO if no panel shows an unlabelled number |

---

# PHASE 7: Evidence, Method and calibration demo

## Milestone 7.1: Evidence and Method pages
**Depends on:** 6.3.

### 1. Milestone name
Pages that show what each number rests on.

### 2. Objective
Evidence page lists datasets, licences, metrics (from `/evidence`), coverage and gaps; Method page explains layers in plain words with a diagram.

### 3. Tasks to complete
- [ ] `Evidence.tsx` driven only by `/evidence` data.
- [ ] `Method.tsx` with layer diagram (draw with `mermaid-diagrams` skill, export SVG into `frontend/src/assets`).
- [ ] "What would change with vendor data" section describing Calibrated mode.
- [ ] Links from every panel's badge to the relevant Evidence entry.

### 4. Files / modules affected
`src/pages/{Evidence,Method}.tsx`, `src/assets/method.svg`, tests.

### 5. Implementation guidance
No hard-coded metrics in JSX. A test scans source for numerals like `12.7` to ensure values come from the API.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T7.1-1 | Metrics from API | API | open Evidence | HUST and EVBattery metrics match metrics.json | TODO |
| T7.1-2 | No hard-coded metrics | source | grep for `12.7` and `2.29` in `src` | none found | TODO |
| T7.1-3 | Badge links | any panel | click badge | lands on matching evidence row | TODO |
| T7.1-4 | Gaps listed | open | check | hot cycling, bus pack, idle data gaps present | TODO |
| T7.1-5 | API down | stop API | open | error with retry | TODO |
| T7.1-6 | Diagram accessible | open Method | inspect | alt text present | TODO |
| T7.1-7 | Regression | earlier | tests | pass | TODO |

### 7. Verification checklist
- [ ] Read the page as a stranger: every claim is traceable to a dataset.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-7-evidence
(cd frontend && npm run lint && npm run typecheck && npm test -- --run && npm run build) && pytest -q
git status
git add .
git commit -m "M7.1: evidence and method pages driven by API metrics"
git switch main && git merge --ff-only phase-7-evidence && git push origin main
git tag -a cp-7.1 -m "evidence pages" && git push origin cp-7.1
```

### 10. Rollback / recovery
Section B revert.

---

## Milestone 7.2: Calibration method demo
**Depends on:** 1.3, 2.3 (does not need the frontend).

### 1. Milestone name
Working calibration interface proven on EVBattery.

### 2. Objective
`calibrate(prior, vendor_frame)` implemented, with a notebook showing that mileage backbone plus snippet features reduces capacity error versus the prior, and that partial pooling helps vehicles with few labels.

### 3. Tasks to complete
- [ ] `engine/calibrate/features.py`: fixed-voltage-window charge features.
- [ ] `engine/calibrate/model.py`: mileage backbone + GBM refinement; mixed model with vehicle random intercept (statsmodels).
- [ ] `notebooks/calibration_demo.ipynb` (outputs cleared before commit except small figures).
- [ ] Metrics written to `metrics.json` with explicit caveat "NMC-like data, method demonstration only".
- [ ] Interface docs in `docs/calibration-interface.md` (expected columns for a vendor file).

### 4. Files / modules affected
`engine/calibrate/*`, `notebooks/calibration_demo.ipynb`, `docs/calibration-interface.md`, `tests/test_calibrate.py`.

### 5. Implementation guidance
Vehicle-grouped CV only; never split a vehicle across train and test. Do not treat labels as ground truth (they are derived); state this. Show error for vehicles with 5, 20, 100 labelled snippets to demonstrate partial pooling.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T7.2-1 | Baseline reproduced | 1.3 table | run | mileage-only 2.50% ± 0.15; with features 2.29% ± 0.15 | TODO |
| T7.2-2 | Vehicle split | CV | assert groups disjoint | pass | TODO |
| T7.2-3 | Few labels | subsample vehicle to 5 | run | prediction shrinks toward prior; error not worse than prior-only | TODO |
| T7.2-4 | Bad vendor file (validation) | missing column | `calibrate` | error naming column | TODO |
| T7.2-5 | Empty vendor file (edge) | 0 rows | `calibrate` | returns prior unchanged with warning | TODO |
| T7.2-6 | Units mismatch | capacity in mAh | `calibrate` | detects and rejects with message | TODO |
| T7.2-7 | Notebook runs clean | kernel restart | run all | no errors under 10 minutes | TODO |
| T7.2-8 | Regression | earlier | `pytest -q` | pass | TODO |

### 7. Verification checklist
- [ ] `jupyter nbconvert --clear-output` applied before commit.
- [ ] Caveat text present in notebook and docs.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-7-calibration
pytest -q
git status
git add .
git commit -m "M7.2: calibration interface and EVBattery method demonstration"
git switch main && git merge --ff-only phase-7-calibration && git push origin main
git tag -a cp-7.2 -m "calibration demo" && git push origin cp-7.2
```
Do NOT commit notebook outputs holding raw data rows.

### 10. Rollback / recovery
Section B revert.

---

## Phase 7 Completion Checkpoint
| Item | Record |
|---|---|
| Completed milestones | 7.1, 7.2 |
| Tests passed | ___ / ___ |
| Known issues | Calibrated mode not wired to UI by design |
| Git commit/hash | `git rev-parse --short cp-7.2` = ___ |
| Overall verification | Evidence page numbers equal metrics.json; notebook reruns |
| Go/No-Go | GO if no number in UI is hard-coded |

---

# PHASE 8: Hardening and release

## Milestone 8.1: Accessibility and responsive polish
**Depends on:** Phase 7.

### 1. Milestone name
Accessibility, responsive and design audit.

### 2. Objective
Meet keyboard, contrast, screen-reader and 375 px requirements.

### 3. Tasks to complete
- [ ] Run `web-design-guidelines` skill review on all pages; fix findings.
- [ ] Install `@axe-core/playwright` and `playwright`; add an e2e smoke test per page.
- [ ] Contrast and focus checks, `prefers-reduced-motion`, `prefers-color-scheme`.

### 4. Files / modules affected
`frontend/e2e/*.spec.ts`, component fixes, `playwright.config.ts`.

### 5. Implementation guidance
Playwright is added only here because earlier milestones use component tests; it gives real-browser coverage of full flows and axe scanning.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T8.1-1 | axe scan each page | both servers up | run e2e | 0 serious/critical violations | TODO |
| T8.1-2 | Keyboard-only flow | none | complete scenario → results | possible without mouse | TODO |
| T8.1-3 | 375 px | emulate | each page | no horizontal scroll | TODO |
| T8.1-4 | Dark mode contrast | toggle | axe | passes | TODO |
| T8.1-5 | Reduced motion | emulate | open 3D | no auto-motion | TODO |
| T8.1-6 | Zoom 200% | browser zoom | each page | usable | TODO |
| T8.1-7 | Regression | earlier | all tests | pass | TODO |

### 7. Verification checklist
- [ ] Guideline review findings closed or documented.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-8-a11y
(cd frontend && npm run lint && npm run typecheck && npm test -- --run && npx playwright test) && pytest -q
git status
git add .
git commit -m "M8.1: accessibility and responsive fixes with e2e coverage"
git switch main && git merge --ff-only phase-8-a11y && git push origin main
git tag -a cp-8.1 -m "a11y" && git push origin cp-8.1
```
Do NOT commit `playwright-report/`, `test-results/`.

### 10. Rollback / recovery
Section B revert.

---

## Milestone 8.2: Performance and security review
**Depends on:** 8.1.

### 1. Milestone name
Performance budgets and security checks.

### 2. Objective
Meet latency and bundle budgets; no known vulnerable dependencies; no secrets in history.

### 3. Tasks to complete
- [ ] Measure `/predict` p95 over 50 requests (target under 2 s).
- [ ] Lighthouse on built frontend (performance ≥ 85 desktop).
- [ ] `pip install pip-audit && pip-audit`; `npm audit --omit=dev`.
- [ ] Secret scan: `git log -p | grep -Ei "api[_-]?key|secret|token"` plus `gitleaks` if available.
- [ ] Review security-and-hardening skill checklist for the API (input limits, headers, error leakage).

### 4. Files / modules affected
`docs/security-review.md`, `docs/performance.md`, possible dependency bumps, headers middleware.

### 5. Implementation guidance
Fix high/critical findings; document accepted lows. Add security headers (CSP, X-Content-Type-Options) in the API/static host config.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T8.2-1 | Latency | server up | 50 sequential `/predict` | p95 under 2 s | TODO |
| T8.2-2 | Load | 20 parallel × 5 | httpx | zero 5xx | TODO |
| T8.2-3 | Dependency audit | env | run audits | no high/critical open | TODO |
| T8.2-4 | Secret scan | repo | scan history | nothing found | TODO |
| T8.2-5 | Header check | server up | `curl -I` | security headers present | TODO |
| T8.2-6 | Malformed JSON | server | send garbage | 422/400, no traceback | TODO |
| T8.2-7 | Path traversal | static host | `GET /..%2f.env` | 404 | TODO |
| T8.2-8 | Regression | earlier | all tests | pass | TODO |

### 7. Verification checklist
- [ ] Reports saved in docs.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-8-hardening
pytest -q && (cd frontend && npm test -- --run)
git status
git add .
git commit -m "M8.2: performance budgets and security review"
git switch main && git merge --ff-only phase-8-hardening && git push origin main
git tag -a cp-8.2 -m "hardened" && git push origin cp-8.2
```

### 10. Rollback / recovery
Section B revert.

---

## Milestone 8.3: Local packaging and optional deployment
**Depends on:** 8.2. Needs missing-information item 3.

### 1. Milestone name
One-command local run, plus optional hosted demo.

### 2. Objective
`scripts/run_all.sh` starts API and built frontend; optionally deploy without Docker (D4) to a free host.

### 3. Tasks to complete
- [ ] `scripts/run_all.sh` (build frontend, serve via the API's static mount at `/`).
- [ ] Commit the small model artifacts needed at runtime (JSON).
- [ ] Optional: Render/Railway service config (`render.yaml`) reading env vars; static frontend served by the API to keep one service.
- [ ] Optional: `Dockerfile` only if Docker gets installed.
- [ ] Health check URL and rollback note for the host.

### 4. Files / modules affected
`scripts/run_all.sh`, `backend/app/main.py` (static mount), `render.yaml` (optional), `README.md`.

### 5. Implementation guidance
Production run without reload. The deployed app needs no data directory (artifacts and zones only) so the raw datasets never leave your machine.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T8.3-1 | Fresh clone run | clean machine/dir | clone, setup, `run_all.sh` | app on :8000, scenario runs | TODO |
| T8.3-2 | No data dir needed | rename `data/` | run | works | TODO |
| T8.3-3 | Offline (SDD NFR) | disconnect network | run, predict | works fully | TODO |
| T8.3-4 | Port in use (failure) | occupy 8000 | run | clear message, non-zero exit | TODO |
| T8.3-5 | Deployed health | hosted URL | GET health | 200 | TODO |
| T8.3-6 | Deployed predict | hosted URL | run default | equals local result for same seed | TODO |
| T8.3-7 | Env missing | unset var | start | safe defaults or clear error | TODO |
| T8.3-8 | Regression | earlier | all tests | pass | TODO |

### 7. Verification checklist
- [ ] Deployed URL (if any) added to README only after T8.3-5/6 pass.
- [ ] No secret in host config files.

### 8. Completion criteria
Local rows PASS; deployed rows PASS or marked N/A with "not deploying".

### 9. Git checkpoint
```bash
git switch -c phase-8-packaging
pytest -q && (cd frontend && npm test -- --run && npm run build)
git status
git add .
git commit -m "M8.3: one-command local run and optional hosted deployment config"
git switch main && git merge --ff-only phase-8-packaging && git push origin main
git tag -a cp-8.3 -m "packaged" && git push origin cp-8.3
```

### 10. Rollback / recovery
Section B revert, plus redeploy the previous tag on the host (`git switch --detach cp-8.2` locally to confirm it runs, then trigger host rollback to that commit).

---

## Milestone 8.4: Documentation and release
**Depends on:** 8.3.

### 1. Milestone name
Final documentation, model card and release tag.

### 2. Objective
A reviewer can understand, run and verify the project from the repo alone.

### 3. Tasks to complete
- [ ] README: purpose, screenshots, quick start, data fetch, tests, limits.
- [ ] Finalise `docs/model-card.md`, `docs/software-design-document.md` (mark deviations), `docs/phase0-report.md`.
- [ ] Add `LICENSE` for your code (choose; ask your instructor if unsure) and `docs/data-attribution.md` crediting each dataset.
- [ ] `CHANGELOG.md` summarising checkpoints cp-0.1 to cp-8.3.
- [ ] Release `v1.0.0`.

### 4. Files / modules affected
`README.md`, `LICENSE`, `CHANGELOG.md`, `docs/*`.

### 5. Implementation guidance
Every limit and assumption from the SDD risk table appears in the README under "Limits". Screenshots from the real app only.

### 6. Test cases
| ID | Scenario | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|---|
| T8.4-1 | README quick start | clean clone | follow literally | works first time | TODO |
| T8.4-2 | Links | docs | run link checker (`npx markdown-link-check`) | no dead links | TODO |
| T8.4-3 | Attribution | docs | check | all 5 datasets plus weather credited | TODO |
| T8.4-4 | Claims audit | README/model card | compare numbers to metrics.json | match | TODO |
| T8.4-5 | Authorship | log | `git log --format='%an%n%b' \| sort -u` | only `RidhamChhajer`; no Co-Authored-By | TODO |
| T8.4-6 | Regression | all | full test suite | pass | TODO |

### 7. Verification checklist
- [ ] Final Release Checklist (below) fully ticked.

### 8. Completion criteria
All PASS.

### 9. Git checkpoint
```bash
git switch -c phase-8-release
pytest -q && (cd frontend && npm test -- --run && npx playwright test)
git status
git add .
git commit -m "M8.4: documentation, attribution and v1.0.0 release"
git switch main && git merge --ff-only phase-8-release && git push origin main
git tag -a v1.0.0 -m "release 1.0.0" && git push origin v1.0.0
```

### 10. Rollback / recovery
Section B revert; if the tag itself is wrong: `git tag -d v1.0.0 && git push origin :refs/tags/v1.0.0`, fix, retag.

---

## Phase 8 Completion Checkpoint
| Item | Record |
|---|---|
| Completed milestones | 8.1 to 8.4 |
| Tests passed | ___ / ___ |
| Known issues | list |
| Git commit/hash | `git rev-parse --short v1.0.0` = ___ |
| Overall verification | Final Release Checklist complete |
| Go/No-Go | GO for submission only if every checklist box is ticked |

---

# FINAL RELEASE CHECKLIST

**Functionality**
- [ ] Scenario to results works for both presets and all four zones.
- [ ] All 8 panels present; what-if signs correct.
- [ ] Every number labelled; "Prior mode" and "Not yet validated on buses" visible on every page.
- [ ] Extrapolation badges appear above 35 C cycling and beyond HUST C-rate range.

**Testing**
- [ ] `pytest -q` and frontend unit tests green on a fresh clone.
- [ ] Coverage results recorded (70 to 90% target) in the model card.
- [ ] Playwright e2e and axe scans pass.

**Security**
- [ ] No secrets in tree or history; `.env` ignored.
- [ ] CORS restricted; request size limited; no traceback leakage.
- [ ] Dependency audits clean of high/critical.
- [ ] Untrusted pickles only loaded through the allow-list loader.

**Performance**
- [ ] `/predict` p95 under 2 s; main bundle under 300 KB gz; 3D lazy-loaded.

**Deployment**
- [ ] `scripts/run_all.sh` works offline from a fresh clone.
- [ ] Optional hosted URL health and predict verified.

**Documentation**
- [ ] README, SDD, model card, data attribution, reproducibility guide, calibration interface doc complete.
- [ ] Dataset licences and the course-project, non-commercial status stated.

**Git repository cleanliness**
- [ ] `git ls-files | xargs du -k | sort -n | tail -5` shows nothing over 1 MB.
- [ ] No `data/`, `.venv`, `node_modules`, `dist`, parquet/pkl tracked.
- [ ] Tags `cp-0.1` to `cp-8.3` and `v1.0.0` present; `main` equals the release commit.
- [ ] Commit authorship shows only `RidhamChhajer`; no `Co-Authored-By` lines.
