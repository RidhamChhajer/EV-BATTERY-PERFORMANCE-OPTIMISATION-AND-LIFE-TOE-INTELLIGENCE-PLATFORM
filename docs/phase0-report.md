# Phase 0 report: what the free public data can and cannot do

Date: 2026-11-07. All numbers below were measured by scripts in `phase0/` on data downloaded to `data/`. Nothing is simulated. Everything is a course-project check, not a validated result for buses.

## 1. What was downloaded (all sizes verified byte-exact)

| Dataset | Size | What it is | Chemistry |
|---|---|---|---|
| HUST | 1.19 GB zip (4.2 GB unpacked, 77 cells) | Lab cycling to end of life, 1.1 Ah cells, varied charge/discharge protocols | LFP (A123) |
| Stanford calendar | 2.3 MB summaries | Years of storage at fixed temperature and state of charge | 107 LFP cells of 259 |
| Naumann calendar | 4 small xlsx files | 29 months of storage, 17 conditions | LFP |
| EVBattery | 1.4 GB, 3 tarballs (1.28 million charging snippets) | Real vehicle charging snippets, 464 vehicles | NMC-like (see 3.1) |
| Changan sample | not downloaded | Behind a personal application form | skipped |

## 2. Lab LFP results

### 2.1 Calendar ageing (storage, no cycling): the data behaves as physics says it should
Capacity kept at the last check (Naumann, 885 days): 0 °C/50 % → 97.2 %, 25 °C/50 % → 95.3 %, 25 °C/100 % → 89.0 %, 40 °C/100 % → 86.4 %, 60 °C/50 % → 80.0 %, 60 °C/100 % → 77.4 %.
Stanford LFP (80 cells with usable series): 24 °C/50 % → 88.3 % after ~7.8 years, 24 °C/100 % → 83.8 %, 45 °C/50 % → 80.9 % (~3.7 y), 60 °C → 66–67 %, 85 °C → 56–58 % (~1.2 y).
Reading: hotter and fuller means faster fade, monotonically, in two independent labs. This is enough to fit a calendar-ageing curve (temperature and state-of-charge dependence) for the Prior mode. Limits: storage only up to 85 °C, one cell format per lab, and the "last check" times differ per condition, so the numbers are not at equal time. A proper fit (not done yet) is Phase 1 work.

### 2.2 Cycle life from early cycles (HUST, 77 LFP cells, leave-one-out)
Cycle life spans 1,142 to 2,689 cycles (median 1,875).

| Model | Mean abs. % error | Within 15 % |
|---|---|---|
| Predict the average life | 17.7 % | 48 % |
| Early capacity-fade features (cycles 1 to 100) | **12.7 %** | 64 % |
| My crude Q(V)-difference features | 17.5 % | 51 % |
| Both | 13.6 % | 57 % |

Honest reading: early capacity trend helps (17.7 → 12.7 %), but the Severson-style voltage-curve feature as I implemented it did not help on HUST. That is not a failure of the published method: my version is simplified (one voltage grid for all protocols, which differ across HUST cells), n is only 77, and this is our own split, not the published benchmark split, so we cannot compare to published numbers. Treat 12.7 % as the working lab-level baseline to beat.

## 3. Field vehicle data (EVBattery)

### 3.1 Findings
- Cell voltage reaches 4.29 V, so these are not LFP (LFP tops out near 3.65 V). EVBattery cannot validate an LFP bus model. It is useful only for the method (estimating capacity from charging snippets), not for the chemistry.
- Capacity labels are much less sparse than I assumed: 586,000 snippets from 191 vehicles carry a capacity label (24 to 46 Ah, median 41). The anomaly label (value "10" in the snippet metadata, interpretation not independently verified) is on 11.4 % of snippets (146,185 of 1.28 million); the per-vehicle label file flags 31 of 217 vehicles in set 1, 1 of 198 in set 2, 16 of 50 in set 3.
- Mileage reaches 1.1 million km in the data.
- Every snippet is a fixed 1,270 s window. Only 92,838 labelled snippets cover 5 or more points of state of charge, which is the minimum a usable capacity estimate needs.
- Integrating current and dividing by the state-of-charge span gave about 97 Ah on average against labels of about 41 Ah (64.9 % error). The dataset authors say values were perturbed, so the physical route does not work here; it should not be taken as evidence against the method on real data.

### 3.2 Capacity estimation baseline (60,000 snippets, 184 vehicles, vehicles never shared between train and test)

| Model | Mean abs. % error | Within 5 % |
|---|---|---|
| Predict the median | 3.87 % | 71 % |
| Mileage only | 2.50 % | 89 % |
| Snippet features (voltage, temperature, cell-voltage spread, charged Ah, etc.) | **2.29 %** | 91 % |

Honest reading: mileage already explains most of it. The snippet features add only a little (2.50 → 2.29 %). Also, the labels themselves are derived (not directly measured), so this error is "agreement with the dataset's own capacity label", not accuracy against ground truth.

## 4. What this means for the design

1. **Prior mode (no vendor data) is feasible at the cell level.** Calendar ageing from two labs and cycle ageing from HUST give a physics-shaped LFP prior. It is a cell-level prior only: no public data connects it to a bus pack.
2. **The cycle-life prior has modest accuracy (about 13 % error).** The dashboard must show a range, never a single date.
3. **Capacity from charging snippets is the right calibration signal, but mileage is a strong baseline.** The calibration layer should use age/mileage as the backbone and treat snippet features as a refinement, because that is where the evidence is.
4. **We still have no LFP field data.** Everything labelled "bus" stays an assumption until a vendor supplies data. This is as planned and must be visible in the UI.
5. **Hot cycling, high-rate cycling and idle-time records remain gaps.** Nothing downloaded covers cycling above 35 °C for LFP, which matters for Indian summers.

## 5. Limits of this phase (read before quoting any number)
- Own splits and simple models; none of these numbers are comparable to published benchmarks.
- HUST is 77 small cells of one type under lab conditions.
- EVBattery values are perturbed and chemistry is undisclosed; the check is of method, not of absolute accuracy.
- Stanford/Naumann were compared by last-check retention, not fitted.
- Unpickling the dataset files was done with an allow-list loader (`phase0/evb_load.py`, `phase0/hust_load.py`) that blocks anything outside numpy/pandas.

## 6. Next (agreed order)
Design the system architecture (two modes, cell model → bus translation → calibration → decisions), backend and frontend (3D bus, graphs), using sections 4 and 5 as constraints.
