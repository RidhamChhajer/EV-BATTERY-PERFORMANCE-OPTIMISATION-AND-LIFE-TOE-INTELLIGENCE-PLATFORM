# Model card (living document)

Status: Prior mode. **The app's ageing numbers come from the NREL BLAST-Lite LFP models (next section), not from the models fitted by this project.** Those fits (calendar, cycling, early-life, uncertainty; sections after the next one) are kept in the code behind `EV_ENGINE=lab` and are described here as history; the app does not show them. Numbers in the history sections are written from script output; see `engine/artifacts/`. The calibration method demonstration is in `docs/calibration-interface.md`.

## Ageing engine used by the app: NREL BLAST-Lite LFP models
Code: `engine/reference/` (a Python port of the equations, so the app needs neither the package nor Python 3.9 to 3.12). Licence: BSD-3-Clause, notice in `engine/reference/NOTICE`. Source: https://github.com/NatLabRockies/BLAST-Lite, version 1.1.3.

| | 250 Ah prismatic (`Lfp_Gr_250AhPrismatic`) | 3 Ah cylindrical (`Lfp_Gr_SonyMurata3Ah_Battery`) |
|---|---|---|
| Parameters | 10 | 21 |
| Calendar loss | grows with time^0.526; Arrhenius in temperature, graphite-potential term for state of charge | saturating sigmoid in time, same stressors |
| Cycling loss | grows with cycles^0.828 (sublinear); rate depends on depth of discharge, charge rate and temperature | (rate x cycles)^1.13 (slightly super-linear); break-in term only above 3 full cycles a day, so inactive for buses |
| Tested | cycling 10 to 45 °C, 80 to 100 % depth, charge up to 0.65 C | cycling 20 to 40 °C, 80 to 100 % depth, charge up to 1 C |
| Data | NREL tests on a large commercial prismatic cell | TUM tests on Sony-Murata cells (includes the Naumann storage set also used by our own calendar fit) |

Only the 250 Ah model is sublinear in cycling; the 3 Ah model is not.

**From a bus to a curve.** One representative operating day (drive, charge, rest) plus rest days at the top of the charge window, 96 samples a day, with monthly air temperature (mean, plus a day-night swing from the monthly min and max) and the assumed heat rise. Models are stepped monthly, rates recomputed each month; depth of discharge grows as capacity falls (BLAST-Lite's "conserve energy throughput").

**Ensemble.** 50 runs per scenario: 2 models x 5 degradation scalars (normal, mean 1, standard deviation 0.15, five equal-probability strata; 0.15 is the default of BLAST-Lite's own `simulate_battery_life_distribution`) x 5 pack penalties between 20 and 30 % (applied as time compression: pack capacity at time t equals cell capacity at t / (1 - penalty)). Percentiles over the 50 runs are the spread between two published models, cell-to-cell scatter and an assumption. **They are not a statistical confidence interval.** Replacement months at the 10th, 50th and 90th percentile are where the corresponding percentile retention curve crosses the threshold; a percentile beyond the horizon is reported as such, not invented.

**How closely the port matches the package.** `engine/artifacts/reference_port_check.json`, from `scripts/check_reference_port.py`, compares the port with package outputs stored in `engine/artifacts/crosscheck_blast.json`: largest gap 0.47 points of capacity over ten 15-year bus scenarios, 0.005 points over six fixed conditions (storage and cycling). `tests/test_reference_blast.py` asserts these.

**Known limits.**
- Nothing has been checked against a battery pack in service.
- Both cells were cycled at 80 to 100 % depth; a bus using about 69 % is outside that range. The default 12 m bus at 0.34 C and 19 to 38 °C cell temperature is also near the edges of the tested charge rate and temperature (the 3 Ah model was cycled at 20 to 40 °C). Every result carries `extrapolation_reasons`.
- The models disagree by about 2 to 3 times on calendar ageing, so the range is wide on purpose.
- Neither model has a late-life knee; sudden capacity loss near end of life is not represented.
- Charge power matters only through the time the pack sits full; the NREL models show almost no charge-rate effect in the tested range. Temperature effects on usable capacity, HVAC load and seasonal energy use are not modelled.
- The 20 to 30 % pack penalty is NREL's rule of thumb, an assumption.
- The decision panels in the app (ranked levers, fleet budget range, how many buses are short, rupees per year) are arithmetic on these outputs, not new model results. Levers are measured one at a time and do not add up. The fleet budget assumes independent buses, one replacement each and no discounting. "Buses short" is only ever one of four buckets between the 10th, 50th and 90th percentile curves. Rupees are the pack price spread straight-line over its life, first pack only.
- At the default settings roughly 70 % of runs reach the 80 % line within 15 years; the rest are counted at the horizon in cost and in paired comparisons, and the app says so.

**Result.** 12 m hot-dry default: median replacement about 12 years, 10th percentile about 8 years, 90th beyond 15 years. Our own fit gave about 4 years (see the cross-check below), which contradicts both the NREL models and published EV-battery experience.

# Our own laboratory fit (history, not shown in the app)

## Calendar ageing model (M2.1)

Form: `loss = exp(logA) * exp(-(Ea/R)(1/T - 1/Tref)) * g(SOC) * t_days^z`, retention = 1 - loss, Tref = 25 C, g(50 %) = 1, g piecewise linear on SOC 0/25/50/75/100 %.

Fitted on 97 storage series (80 Stanford LFP cells, 17 Naumann conditions), 6,198 observations, robust (soft-L1) least squares, each source weighted equally. Uncertainty: 500 bootstrap refits resampling series within each source.

| Parameter | Fitted | Bootstrap 5-95 % | Meaning |
|---|---|---|---|
| Ea | 33.6 kJ/mol | 32.4 to 34.8 | temperature sensitivity |
| z | 0.555 | 0.536 to 0.576 | time exponent (about square root) |
| exp(logA) | 0.00150 per day^z | 0.00126 to 0.00176 | loss rate at 25 C, 50 % SOC |
| g(0 %) | 0.32 | 0.25 to 0.35 | SOC stress relative to 50 % |
| g(25 %) | 0.59 | 0.47 to 0.64 | |
| g(75 %) | 1.00 | 1.00 to 1.04 | sits on its lower bound (see below) |
| g(100 %) | 1.15 | 1.11 to 1.21 | |

SOC stress is constrained to be non-decreasing (g0 <= g25 <= 1 <= g75 <= g100). Without the constraint the first fit put g(75 %) at 0.87, below g(50 %), because one Naumann series (40 C) shows slightly higher retention at 75 % than at 50 %. We treat that as measurement noise, so the fit now says "no extra stress from 50 to 75 %".

Fit quality: RMSE 0.021 in retention. Residuals reach about 0.07 (see `docs/figures/calendar_residuals.png`). Known weaknesses:
- The two labs disagree at 60 C: the model over-predicts Naumann loss there by up to 0.08 while fitting Stanford.
- SOC stress is shared across temperatures. At about 25 C and 100 % SOC the model predicts 0.925 retention after 885 days against 0.89 observed (Naumann), and 0.864 after 2,840 days against 0.818 observed (Stanford). The model is optimistic for ambient-temperature high-SOC storage. This matters for depot charging at 100 % and is a reason for wide bands (M3.1).
- The 75 % SOC node rests on a single lab condition.

Validity range: 0 to 85 C, 0 to 100 % SOC, storage only. Outside it the engine flags `extrapolated`. This model says nothing about cycling.

### Calendar model validation (M2.2)

Acceptance threshold fixed before running: mean absolute retention error below 0.05 inside the overlap of the two labs (24 to 60 C, SOC 50 or 100 %). No parameters were tuned to pass.

| Test | Mean abs. error (retention) | Notes |
|---|---|---|
| Fit Stanford, predict Naumann | 0.022 | 6 overlapping conditions, 204 points |
| Fit Naumann, predict Stanford | 0.034 | 6 conditions, 5,028 points; 0.021 when limited to the 885 days Naumann covers, so error grows when extrapolating in time |
| Leave one condition out, Stanford | mean 0.026, worst 0.058 | worst case: 85 C, 50 % SOC (edge of the data) |
| Leave one condition out, Naumann | mean 0.012, worst 0.041 | worst case: 60 C, 100 % SOC |

Result: threshold met (0.022 and 0.034). Reading: calendar behaviour transfers between labs to about 2 to 3 points of retention, but this is a small-scale check on 2 labs of storage tests only, and long-horizon extrapolation is worse. Numbers are in `engine/artifacts/metrics.json`.

## Cycle fade model (M2.3)

Form: `loss = exp(logB) * (C/C0)^k * exp(-(Eb/R)(1/T - 1/T0)) * EFC^m`, fitted on the 77 HUST cells (146,122 cycle observations, one temperature, 30 C). EFC is the cycle count.

| Item | Value | Status |
|---|---|---|
| m (fade exponent) | 1.91 | fitted, pooled over cells; fade accelerates (outside the 0.5 to 1.5 range I guessed in the playbook, which was wrong for this data) |
| exp(logB) | 1.4e-7 per EFC^m | fitted mean of per-cell scales |
| Between-cell spread | sigma(log B) = 0.37 | fitted; about 19 % relative spread in cycle life, matches the naive 17.7 % life error from Phase 0 |
| k (C-rate exponent) | 0 | NOT claimed. A regression gave k = -0.96 (higher C, less fade), which is the wrong sign for physics: protocols differ in several ways at once, so C-rate is confounded. It is stored as a diagnostic only. |
| Eb (temperature term) | 30 kJ/mol | ASSUMED mid-range value. HUST has one temperature, so no temperature effect on cycling is measured. Everything that depends on it must be labelled an assumption. |

Fit quality: with each cell's own scale B_i, RMSE 0.010 in fade (shape fits well). Predicting a new cell from the pooled mean scale gives RMSE 0.047, because cells differ a lot. All cells end at about 74 % of first-cycle capacity (end of test criterion), so what differs between cells is the time to get there.

Consequences for the product:
- Charge-rate what-ifs have no data-backed cycle effect in v1 (the UI must say so). Temperature effects on cycling are assumptions.
- Validity: 25 to 35 C, effective C-rate 1.79 to 2.82, EFC up to 2,689. Outside this the engine flags `extrapolated`.
- Calendar and cycle loss are added (assumed; not tested because no dataset has both separated).

## Early-life cycle-life predictor (M2.4)

Task: predict a cell's cycle life from its first 100 cycles. Leave-one-cell-out on 77 HUST cells, target log(life). Selection rule fixed in advance: the simplest model within one bootstrap standard error of the best.

| Model | Mean abs. % error | SE | Within 15 % |
|---|---|---|---|
| Mean only (naive) | 17.7 | 1.5 | 48 % |
| ElasticNet, capacity features (**selected**) | 12.7 | 1.1 | 64 % |
| ElasticNet + dQ(V), all discharge steps (Phase 0 version) | 13.6 | 1.3 | 57 % |
| ElasticNet + dQ(V), protocol-consistent discharge_3 step | 12.7 | 1.2 | 65 % |
| Gradient boosting, capacity features | 13.1 | 1.3 | 64 % |

Improvement of the selected model over the naive one: 5.0 percentage points (bootstrap 95 % interval 2.6 to 7.8), so it is real but modest. The protocol-consistent voltage-curve features tie with the simple model, so the simpler one is kept; gradient boosting is not better.

Features: capacity at cycle 1, capacity change between cycle 10 and 100, fade slope over cycles 10 to 100, minimum capacity in the first 100 cycles. Only cycles up to 100 are used (tested). Coefficients (scaled features): change 10 to 100 = -0.42, slope = +0.43, minimum capacity = +0.20, first-cycle capacity = -0.04. The first two are strongly collinear and nearly cancel, so read them as "the early fade rate matters", not as separate effects.

Limits: 77 cells, one cell type and batch, own split (not comparable with published benchmarks). Refuses input with fewer than 100 cycles.

## Uncertainty bands (M3.1)

Each prediction draws 2,000 (default; maximum 5,000) Monte Carlo samples: one bootstrap calendar parameter set, one bootstrap cycle parameter set, a lognormal calendar residual (sigma = 0.196, from leave-one-condition-out residuals) and a cell-to-cell scale effect on the cycle term (sigma(log B) = 0.37). The reported band is p10 to p90 of retention (nominal 80 %). Scenarios can share the same draws, so what-if differences are not simulation noise.

Coverage of the nominal 80 % band, checked by leaving data out:

| Part | Point-weighted coverage | Per-unit mean | Worst unit |
|---|---|---|---|
| Cycle, leave one cell out (77 cells, proper refit) | 72.5 % | 72.8 % | one cell fully outside |
| Calendar, leave one condition out | 79.6 % | 73.1 % | one condition fully outside |

Target was 70 to 90 %: met, but read with care. The calendar sigma is calibrated on the same out-of-fold residuals, so its 79.6 % is close to circular. The cycle number is a genuine test. Both coverages hide that some individual cells and conditions are missed entirely, which is what a 77-cell, one-batch dataset gives.

Extrapolation: when temperature, SOC, C-rate or cycle count leave the training range, both spreads are multiplied by 1.5. This factor is an ASSUMPTION, not measured.

Not modelled: correlation between calendar and cycle uncertainty (treated as independent), batch-to-batch variation, and any bus-specific effect.

## Replacement-window Monte Carlo (M3.3)

For a scenario the engine simulates 2,000 draws on a monthly grid (up to 20 years), applies the assumed pack penalty (uniform, default 0 to 8 % extra loss), and records when retention first reaches the replacement threshold (default 80 %).

Default 12 m scenario, 200 km/day, 1.2 kWh/km, 100 % charge cap, depot charging overnight (outputs, not validated on buses):

| Zone | Replacement p10 / p50 / p90 (years) |
|---|---|
| hot-dry | 2.9 / 4.1 / 5.7 |
| cool | 4.6 / 6.4 / 8.7 |

**Read this before quoting any date.** The prior is probably pessimistic for buses. Reason: the only cycling data (HUST) were run at about 2 C average with 5 C charging, while a depot-charged bus works at about 0.2 C. The fitted cycle model has no C-rate effect (it could not be identified, see M2.3), so it applies the high-rate fade to a low-rate bus. The engine says so in a warning on every result, together with the list of ways inputs leave the training range (C-rate, cycle count beyond 2,689, cycling temperature below 25 C). The calendar part (about 45 to 60 % of loss at crossing) rests on storage data that do cover these temperatures. These dates will only become trustworthy when low-rate cycling data or vendor data calibrate them.

## Cross-check against NREL BLAST-Lite (why the app switched engines)
**Outcome:** this check showed our own fit to be the most pessimistic in every scenario, so the app now uses the NREL models (section above). The numbers below compare our fit with the package and are kept as the record of that decision; the Evidence page no longer shows them.

`scripts/crosscheck_blast.py` runs the same bus duty and climate through our cell model and through two public LFP models from NREL's BLAST-Lite 1.1.3 (`Lfp_Gr_250AhPrismatic`, and `Lfp_Gr_SonyMurata3Ah_Battery` as a second opinion). It writes `engine/artifacts/crosscheck_blast.json`, which now serves as the package output the port is tested against (it is no longer served by `/evidence`). It is a consistency check between lab-data models, **not** a validation on buses. BLAST-Lite is not an app dependency (it needs Python 3.9 to 3.12 and runs in a throw-away environment); the app runs its own port of the equations.

**Setup.** Ten scenarios: the 12 m and 9 m presets in all four climate zones, plus the 12 m hot-dry bus with the charge cap at 80 % and with the pack 8 °C hotter. BLAST-Lite receives an hourly state-of-charge and temperature series (drain over the duty window, constant-power charge, rest full, monthly air temperature plus the heat-rise assumption, operating days only) tiled over 15 years. Ours runs with the pack penalty set to zero so it is comparable to a cell model.

**Result (12 m, hot-dry).** After 10 years our cell model keeps 40 % of capacity; BLAST-Lite's 250 Ah model keeps 88 % and its 3 Ah model 82 %. Across the ten scenarios ours keeps 27 to 67 % against 79 to 90 %. Ours is the lowest in every scenario, and BLAST-Lite lies outside our 10 to 90 % band in every year checked, so our band covers parameter uncertainty only, not model-structure risk.

**Where the gap comes from** (same-condition runs that bypass the bus translation):

| | Ours | BLAST-Lite 250 Ah | BLAST-Lite 3 Ah |
|---|---|---|---|
| Storage loss after 5 years, 25 to 35 °C, 50 to 100 % SOC | 9.6 to 17.2 % | 2.7 to 7.6 % | 8.6 to 15.7 % |
| Cycling loss after 1,000 full cycles (25 °C) | 8 to 10 % | 6 to 11 % | 4 to 5 % |
| Cycling loss after 3,000 full cycles (25 °C) | 54 to 58 % | 14 to 27 % | 9 to 10 % |

- Calendar ageing is in the same range: ours is 1.0 to 1.2× the 3 Ah model and 2 to 4× the 250 Ah model, and those two differ from each other by 2 to 3×.
- Cycling agrees up to about 1,000 cycles and then parts: our fitted law (exponent about 1.9) bends sharply upward, BLAST-Lite's does not. A 12 m bus does about 3,500 cycles in 15 years, beyond the 2,689 covered by the HUST data, and at about 0.19 C against the 1.8 to 2.8 C of the lab cells. This is the same bias the Replacement page already warns about; the cross-check shows its size.
- Heat sensitivity differs in size: a pack 8 °C hotter costs 13 points at 10 years in our model and 2 to 3 in BLAST-Lite. All three agree on the direction of that and of the charge-cap effect.

**Reading it.** The default replacement timing of our own fit (about 4 years for the 12 m preset) was a likely early estimate. BLAST-Lite's own documentation calls its LFP models qualitative, fitted to low-rate data at 10 to 45 °C, and suggests pack life can be 20 to 30 % shorter than cell life, so the truth is not simply "BLAST-Lite is right". The decision that followed was to run the NREL models in the app instead of reworking our cycling term, which would have had to extrapolate far beyond the HUST data.

**Licence.** BLAST-Lite is listed as BSD-3-Clause on GitHub and Apache-2.0 on PyPI. The BSD-3 text shipped in the package is kept in `engine/reference/NOTICE`.

Reproduce: `python3.11 -m venv /tmp/blast-venv && /tmp/blast-venv/bin/pip install blast-lite && .venv/bin/python scripts/crosscheck_blast.py --blast-python /tmp/blast-venv/bin/python`. `tests/test_crosscheck_blast.py` checks the duty-series builder and the stored file without needing BLAST-Lite installed. Afterwards run `.venv/bin/python scripts/check_reference_port.py` to refresh the port check.

## Electricity cost per km (Maharashtra, Pune)
Not an ageing model: arithmetic on a published tariff. Electricity per km = energy per km ÷ charger efficiency × price per unit, where the price is the energy charge shifted by the time-of-day rule for the hours the bus charges, plus the wheeling charge (`engine/decide/electricity.py`, rates and sources in `engine/bus/tariffs.json`). It adds to, and never changes, the battery cost per km; the total is the battery's 10th, 50th and 90th percentile plus one electricity figure, because the tariff is an assumption and has no spread of its own.
- Assumed, no bus data: charger efficiency (92 %), unity power factor (the tariff is per kVAh and is treated as per kWh), the charging window (start time and charge length from the scenario), and a tariff held flat for the life of the bus, undiscounted.
- Left out: electricity duty, the fuel adjustment charge, tax on sale of electricity, power-factor penalties, tariff changes after FY 2026-27 and other utilities. Only MSEDCL EV charging categories (HT IX, LT VIII) are offered, plus a flat price of the operator's own.
- Does not change battery ageing: the charging window that sets the price is the same one that already sets time spent full.
- Not yet validated on buses.

## Fleet forecast (`POST /api/v1/fleet`)
- What it does: counts and costs the replacements of a fleet by financial year, from the same 50-run reference ensemble as the single-bus pages. See `engine/decide/fleet.py` (its docstring is the specification) and the CHANGELOG entry.
- Assumptions, each shown with the result as an assumption or a warning: the two published models are equally likely to be the closer one (50/50); buses age independently inside a model; "still in service" means "not yet at the model's line"; each bus is replaced once (no second pack); money is undiscounted; a bus with no in-service date is counted as new.
- What is not done: the fleet's own survival is not used to reweight the two models. That would be calibration, and the API runs in prior mode only. Reported (BMS) health is not an input.
- Known approximation: cohort months-to-line use the runs' own crossing times, which differ from the single-bus headline by about 2 months at the median for a new default bus. Not yet validated on buses.
- Limits stated in the fleet PDF (`backend/app/fleet_report.py`, page "Assumptions and limits"): the age-conditioned survival, the 50/50 model mixture and why it makes the band wide, independence between buses, one pack per bus, undiscounted money, buses without an in-service month counted as new, and that nothing is validated on buses yet. Depots, routes and reported health stay in the browser and are not in the document.
- Exports: the forecast and budget CSVs are made in the browser from the figures on screen. Text that a spreadsheet would run as a formula is defused with a leading apostrophe, so they are for reading, not for importing back (the roster CSV and the fleet file are the ways in).
