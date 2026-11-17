# Public Data Inventory and Capability Blueprint

**Status:** v1, 7 Nov 2026. Companion to `business-case.md`.
**Constraints applied:** public data only, no sponsor or client data; real data only (no synthetic or simulated data); the product is B2B, so **licence permits commercial use** is a gating test, not a footnote.
**What this document is:** an inventory of what exists, what it is good for, and an honest ceiling on what the system can claim. **No model has been trained or run yet.** Every accuracy number below is a *published result on the authors' own data split*, never our result.

### Verification tiers
| Mark | Meaning |
|---|---|
| **V** | Verified by me this session from the host's API, the dataset page, or the paper's full text (Europe PMC / arXiv) |
| **R** | Reported by search results or a secondary page; not checked at the source |
| **?** | Unknown or could not be checked |

---

## 1. Headline findings

1. **There is no public per-vehicle *bus* battery-degradation dataset of usable size.** The only public bus battery data I found is a Mendeley set whose current version is four files of a few KB each (section 3.3). Every real-vehicle dataset of scale is a **passenger car**.
2. **The biggest real-vehicle dataset I found is not usable commercially.** The 300-vehicle Changan field data (Nature Communications 2025) is published by the lab with the term "academic research use only". That conflicts with a B2B product (section 4).
3. **Field "SOH" labels are derived estimates, not measured truth.** In the Nature Communications paper, SOH labels were computed by ampere-hour integration with open-circuit-voltage correction. A published model scoring 1-2% error against such labels is matching another estimate. This is the same problem as the BMS-reliability finding in the business case.
4. **Chemistry matches best in the lab, and fleet-scale data matches worst.** LFP is well covered by lab cells (about 200+ A123 1.1 Ah cells). The large real-vehicle datasets are NCM or undisclosed chemistry. The Indian e-bus target is LFP at roughly 280-370 kWh.
5. **Published life-prediction error is large.** On the BatteryLife benchmark the best method misses by about 14-18% MAPE, and only 62-70% of predictions land within 15%. Uncertainty must be a first-class output.

---

## 2. Inventory

### 2.1 Core pool (usable to build and validate; commercial use looks permitted)

| # | Dataset | Real / lab | Chemistry | Format and scale | Longitudinal | Labels | Licence (commercial?) | Size | Tier |
|---|---|---|---|---|---|---|---|---|---|
| C1 | **HUST** (Mendeley `nsc7hnsg4s`, v2) | Lab | **LFP/graphite** (A123 APR18650M1A, 1.1 Ah) | 77 cells, 30 °C, 146k cycles, life 1,100-2,700 cycles | Yes | Cycle life (EOL 80%) | CC BY 4.0 (yes) | 1.19 GB zip | **V** |
| C2 | **MATR / MIT-Stanford-TRI** (`data.matr.io`; Severson 2019; Attia 2020; "Stanford_2") | Lab | **LFP/graphite** (A123, 1.1 Ah) | 124 cells, fast-charge protocols, life 150-2,300 cycles | Yes | Cycle life | **?** (check portal terms) | not checked | **R** (paper confirmed; portal not opened) |
| C3 | **Sandia via Battery Archive** | Lab | LFP, NMC, NCA 18650 (LFP subset) | Varies T, DOD, rate; cell counts disputed (86 vs 33 LFP in different sources) | Yes | Capacity fade | **?** | not checked | **R** |
| C4 | **Wheeler et al.**, 20 A123 graphite/LFP cells, first and second life (*Sci. Data*, DOI 10.1038/s41597-025-04712-7; repo DOI 10.57745/OLBXKT) | Lab | LFP | 20 cells, check-ups every 100 cycles | Yes | Capacity, pseudo-OCV | **?** | not checked | **R** |
| C5 | **CALB** (BatteryLife raw, Zenodo 17960956) | Lab/industrial | **Not verified** ("industry-tested large-capacity Li-ion") | Large-capacity cells | Yes | Cycle life | CC BY 4.0 (yes) | 6.3 GB zip + 9 MB xlsx | **V** (licence, size); chemistry **?** |
| C6 | **EVBattery** (figshare 23301881; arXiv 2201.12358) | **Real vehicles** | **Not disclosed** | 3 manufacturers, charging snippets of 128 points, 8 channels (avg cell V, current, max/min cell V and T, SOC, ...) | Partly (several years) | **Anomaly flag** (fire / lithium plating), **sparse capacity labels** (28.28-46.23) | CC BY 4.0 (yes) | 812 + 418 + 178 MB | **V** |

Notes on C6 (this changes earlier statements in `business-case.md`): the "health label" is a **fault/anomaly flag, not SOH**; capacity labels come from manufacturer engineers and are sparse; per the paper, values are **perturbed for anonymisation** and only average cell voltage is given.

### 2.2 Real-vehicle data with a licence problem (research benchmark only, pending legal review)

| # | Dataset | Details | Problem | Tier |
|---|---|---|---|---|
| R1 | **Changan 300-vehicle field data** (Liu et al., *Nat. Commun.* 16, 2025; `ivstskl.changan.com.cn/?p=2697`) | **NCM** pack, 155 Ah, 96 cells in series, 300 vehicles, 0.5-4 years, 0-500k km. Fields include time, SOC, speed, odometer, charge status, total voltage, total current, min cell voltage and more. Code and source data on GitHub (HoraceLiu1010) | Site says **academic research use only**. SOH labels derived by Ah integration + OCV-SOC correction. NCM, not LFP | **V** (paper full text via Europe PMC; site read) |
| R2 | **RVD** (IEEE DataPort, DOI 10.21227/jyrv-2179; Huang, Ji, Dong, Lai) | 104,621 cycles, 300 vehicles, >30M km; voltage, current, SOC, **SOH**, speed, acceleration, mileage; xlsx per cycle | Page lists CC Attribution, but **needs a login** (account creation must be done by you, not me). Chemistry not stated. SOH origin (BMS or derived) not stated. Relationship to R1 unknown (both "300 vehicles") | **V** (page read) |

### 2.3 Auxiliary data (context, duty cycle, weather, charging behaviour)

| # | Dataset | What it gives | Limits | Licence | Tier |
|---|---|---|---|---|---|
| A1 | **NREL Fleet DNA** (transit bus drive cycles) | Aggregated drive-cycle statistics by vocation, over 350 metrics; DriveCAT tool | US transit; aggregated, not per-vehicle battery data; cite and notify NREL | Public; cite "Fleet DNA Project Data" | **R** |
| A2 | **NREL / FTA battery-electric bus evaluations** | Measured kWh/mile (1.9-2.4) and availability by agency | Aggregates; definitions differ; US | US government publication | **R** |
| A3 | **NASA POWER** | Hourly weather and solar from 2001, API access, for any Indian location | Reanalysis, not station measurements | Described as CC BY 4.0 on the AWS registry | **R** |
| A4 | **Autosun / PolyU Shenzhen charging data** (Mendeley `c7gg94tmvz`) | 10,154 EVs, 21,175 sessions, 1.55M points at 1 min, battery-type codes (LFP, NMC), fault label | **About 2 sessions per vehicle: cross-sectional, no degradation trajectories.** Feature list unverified (readme returned 403) | CC BY 4.0 | **V** (metadata); features **?** |
| A5 | **BatteryLife** aggregator (code MIT; data keeps each source's licence) | Standardised access to 16 sources (CALCE, MATR, HUST, RWTH, ISU, XJTU, Tongji, Stanford, HNEI, SNL, MICH, UL_PUR, SDU, Farasis, CALB, Zn/Na-ion); 18 benchmark methods | Cell-level lab data. v12 released July 2026; paper and README disagree on counts (998 vs 990 batteries; use the newer paper figures: 59 chemical systems, 9 temperatures, 421 protocols) | Per source; processed copies on HuggingFace and Zenodo | **V** (README, arXiv abstract) |

### 2.4 Transfer-only (wrong chemistry; for pretraining and method checks)

| # | Dataset | Chemistry | Scale | Licence | Size | Tier |
|---|---|---|---|---|---|---|
| T1 | **XJTU** (Zenodo 10963339) | NCM 18650 (LISHEN, 2 Ah) | multiple cells | CC BY 4.0 | 2.44 GB | **V** |
| T2 | **Tongji** (Zenodo 6405084) | NCA and NCM 18650 | three datasets | CC BY 4.0 | about 1.7 GB | **V** |
| T3 | **NASA PCoE randomised usage** | LCO 18650, 28 cells, varied temperature | cells in 7 groups | US government works (NASA record also shows "other, as specified": check) | not checked | **R** |

### 2.5 Excluded

| Dataset | Reason |
|---|---|
| **Gulla et al. LFP field data** (Zenodo 13715694) | **CC BY-NC 4.0** (non-commercial). Also 24 V / 160 Ah portable systems, all *returned to the manufacturer* (selection bias). Real and LFP, but not bus-scale. Research reference only (**V**) |
| **IEEE "hybrid multi-domain EV dataset"** | Gaps filled by physics-informed stochastic synthesis: partly synthetic |
| **CH-BatteryGen** (ICLR 2026) | Mixes real on-board data with generative modelling: excluded until real and generated parts can be separated |
| **DiffBatt**, PyBaMM-generated data | Synthetic by construction |
| **Chattanooga CARTA / ViriCiti bus telematics** | Described in papers; no public download found |
| **Oxford battery degradation set** | Not verified this round |

### 2.6 Unresolved: the only public bus battery data

**Mendeley "Real EV dataset" (`j9ky68gnd3`, CC BY 4.0)**: version 3 (Sep 2025) has four CSVs (`vin1`, `vin5`, `vin12`, `vin19`); I confirmed one is **7,723 bytes**. A search snippet described version 1 (Dec 2024) as five Chengdu electric buses over about seven months at 10 s resolution with incomplete charge/discharge, but I could not retrieve version 1's file list through the API. **Status: unresolved. Open version 1 in a browser to check before ruling it in or out.** Even at five buses it would be a format reference and sanity check, not a training set.

---

## 3. Pool ranking

| Role | Datasets |
|---|---|
| **Core, LFP life and capacity** | HUST, MATR, Sandia LFP subset, Wheeler, CALB (if LFP) |
| **Core, real-vehicle behaviour** | EVBattery (anomaly + sparse capacity) |
| **Real-vehicle SOH research benchmark, not shippable** | Changan 300-vehicle set (NCM, academic-only); RVD pending login, chemistry, licence |
| **Auxiliary** | Fleet DNA, NREL/FTA reports, NASA POWER, Autosun |
| **Transfer-only** | XJTU, Tongji, NASA PCoE |
| **Excluded** | Gulla (NC), IEEE hybrid, CH-BatteryGen, DiffBatt, PyBaMM data |

**Coverage matrix: what each target need has**

| Need | Chemistry match (LFP) | Scale match (bus pack) | Real field | Longitudinal | Commercial OK |
|---|---|---|---|---|---|
| LFP cell ageing | Yes (HUST, MATR, Sandia, Wheeler) | **No** (1.1 Ah cells) | No | Yes | Mostly (MATR, Sandia, Wheeler unchecked) |
| Real-vehicle SOH | **No** (NCM / unknown) | No (cars) | Yes | Yes | **No** (Changan) / unknown (RVD) / yes (EVBattery, but no SOH) |
| Bus duty cycle | n/a | Yes (aggregates) | Yes | No | Yes |
| Climate (India) | n/a | n/a | Reanalysis | Yes | Yes |
| **Bus pack, LFP, real, longitudinal** | **none found** | | | | |

---

## 4. Benchmarks: what is published (one metric per task, not comparable across rows)

All numbers are **from the authors' papers on their own splits**. They are the ceiling we should *expect to approach*, not our result.

| Task | Result | Source and caveat |
|---|---|---|
| **Cycle-life, pooled Li-ion** | Best MAPE **0.179** (CPMLP), within-15% accuracy **0.620**; CPTransformer 0.184 / 0.573; mean-baseline 0.831 / 0.296 | BatteryLife README (**V**). Input window not verified |
| **Cycle-life, CALB** | Best MAPE **0.140** (CPMLP), within-15% **0.704**; CPGRU 0.141 / 0.681 | BatteryLife README (**V**). CALB chemistry unverified |
| **Cycle-life, one LFP dataset** | **9.1%** test error from first 100 cycles; 4.9% classification error from first 5 cycles | Severson 2019 (**R**: record-level) |
| **Fast-charge protocol search** | 224 protocols screened in 16 days vs more than 500 days | Attia 2020 (**R**); cells, not fleets |
| **SOH estimation, real vehicles** | About **1.2-2%** error: Li et al. buses MAE 1.585% (9 buses, about 4 yr); Xu 2025 buses under 2%; BIT passenger EVs MAPE 2.05%, RMSE 1.15% | Search abstracts (**R**); chemistry unconfirmed; **errors are against derived labels** |
| **Fleet SOH, field only** | Fraunhofer, 25 e-buses: under 5 mV voltage prediction on most validation sections | **R**; voltage error, not SOH error |
| **Bus energy consumption** | Measured 1.9-2.4 kWh/mile (several US agencies) | NREL/FTA (**R**) |
| **Anomaly detection** | Baselines compared in EVBattery paper | Not extracted yet |

**What the cycle-life numbers mean in practice (illustrative arithmetic):** if a pack has about 3,000 cycles of life and is cycled about once a day, a 15% error is roughly 450 cycles, or about 1.2 years. A replacement-timing recommendation therefore needs to be a *window with a stated probability*, not a date.

---

## 5. Capability blueprint

### Level 1: Validatable now on public data
| Capability | Evidence basis | Honest claim |
|---|---|---|
| **LFP cell-level life prediction with uncertainty** | HUST + MATR (+ Sandia, Wheeler) | "Predicts cycle life of 1.1 Ah LFP cells from early cycles at published error levels (about 9-18% MAPE); reproduce first." |
| **Capacity estimation from partial charge segments** | Lab partial-window tests; EVBattery sparse labels | Method validated in the lab; real-vehicle validation limited by label quality |
| **Anomaly flags on charging data** | EVBattery fault labels | Flags abnormal charging snippets; precision/recall to be measured |
| **Range and consumption versus temperature and duty cycle** | Fleet DNA + NREL/FTA aggregates + NASA POWER | A **model of US transit-bus behaviour** applied to Indian weather; needs Indian calibration before any range claim |
| **Parametric cost-per-km / replacement-timing engine** | Needs inputs, not data: pack price, warranty, tariff, contract terms | An engine the operator feeds with real numbers. Outputs depend on the inputs, not on public data |

### Level 2: Transferable but unvalidated
| Capability | Why unvalidated |
|---|---|
| **Bus-pack SOH and remaining life** | Training cells are 1.1 Ah 18650s; bus packs are roughly 280-370 kWh with large prismatic cells, thermal management and balancing effects |
| **LFP real-vehicle SOH** | Real-vehicle SOH data is NCM or undisclosed; LFP's flat voltage curve makes the transfer harder |
| **Charging-policy recommendations** | Attia-style optimisation was on cells; Geotab effect sizes are passenger-fleet aggregates |
| **Per-vehicle forecasts that sharpen over time** | Architecture is sound (shared baseline + vehicle correction); needs a real fleet to prove |

### Level 3: Not possible on public data
- Multi-year **bus-pack forecasts in Indian climate**.
- Predicting **penalties, availability or contract outcomes** from battery state (no linked data).
- **Residual-value** pricing (premium unproven; no transaction data).
- Any claim of accuracy **on a named operator's buses**.

---

## 6. Software approach implied by this data

1. **Baselines first.** Reproduce BatteryLife and Severson results on the LFP subset (HUST + MATR) with the authors' code, then publish *our* measured numbers next to theirs.
2. **Uncertainty built in.** Quantile or conformal intervals, evaluated for calibration, because the best published point errors are 14-18%.
3. **Hierarchical structure.** Shared LFP prior, then pack-family offset, then vehicle offset. With no fleet data the upper levels are empty by design, and the interface should show that honestly.
4. **Capacity from charge segments, not BMS SOH.** Consistent with the BMS-reliability finding; validate on lab partial-window data.
5. **Physics-informed components are allowed**, since fitting a physical model to real data is not synthetic data. **Down-sampling or degrading lab data to imitate fleet data is a grey area: your decision, flagged.**
6. **Config over code** for pack size, duty cycle and contract terms, so a real operator's data plugs in later.

---

## 7. Risks and open items

| Item | Action |
|---|---|
| **Changan data is academic-only** | Do not train shippable models on it without written permission or legal advice. Use for method research only |
| **RVD access, licence and SOH origin** | You create a free IEEE DataPort login; then I can read file structure and column definitions |
| **Chemistry of EVBattery, RVD, CALB** | Check dataset READMEs and papers before using any as an "LFP" proxy |
| **MATR, Sandia, Wheeler, CALCE licences** | Read portal terms; commercial use unconfirmed |
| **Chengdu bus dataset version 1** | Open in a browser to see if the 5-bus data exists |
| **Benchmark input windows** | Read BatteryLife paper to know how many early cycles each result uses before comparing to our runs |
| **Indian data** | None found. Climate (NASA POWER) is the only India-specific input |
| **Pilot operator** | Still the single biggest unlock for Level 2 claims |

---

## 8. Proposed Phase 0: baseline reproduction (needs your permission to download)

Nothing has been downloaded. Proposed, in order, each into its own new directory, with scripts kept apart:

| Step | File | Source | Size | Why |
|---|---|---|---|---|
| 1 | BatteryLife processed data (HuggingFace `Hongwxx/BatteryLife_processed` or Zenodo 19688272) | HuggingFace / Zenodo | not checked | One standardised copy of HUST, MATR and others; runs the benchmark |
| 2 | HUST `our_data.zip` | Mendeley | 1.19 GB | LFP lab data, CC BY 4.0 |
| 3 | EVBattery `battery_dataset1/2/3.tar.gz` | figshare | 812 + 418 + 178 MB (about 1.4 GB) | Only commercially usable real-vehicle charging data |
| 4 | Autosun `processed_data_longer_than_30.xlsx` | Mendeley | about 103 MB | LFP vs NMC charging behaviour, fault labels |
| 5 | RVD zip | IEEE DataPort | 182 MB | **Only after you log in**; chemistry and licence still to confirm |
| Later | CALB, XJTU, Tongji | Zenodo | 6.3 GB, 2.4 GB, about 1.7 GB | Only if steps 1-3 justify them |

I will not download any of these until you say yes, file by file or as a group.

---

## References (checked or read this session)

- Park et al., arXiv 2603.21592 (preprint). https://arxiv.org/abs/2603.21592
- He et al., EVBattery, arXiv 2201.12358. https://arxiv.org/abs/2201.12358 ; data https://figshare.com/articles/dataset/23301881
- Tan et al., BatteryLife, KDD 2025, arXiv 2502.18807. https://arxiv.org/abs/2502.18807 ; code https://github.com/Ruifeng-Tan/BatteryLife
- Liu et al., *Nature Communications* 16 (2025), DOI 10.1038/s41467-025-56485-7, PMC11779878; data page https://ivstskl.changan.com.cn/?p=2697
- RVD, IEEE DataPort. https://doi.org/10.21227/jyrv-2179
- HUST (Ma et al.), Mendeley. https://data.mendeley.com/datasets/nsc7hnsg4s
- Autosun/PolyU charging data, Mendeley. https://data.mendeley.com/datasets/c7gg94tmvz
- "Real EV dataset" (Chengdu buses), Mendeley. https://data.mendeley.com/datasets/j9ky68gnd3
- XJTU, Zenodo. https://zenodo.org/records/10963339 ; Tongji, Zenodo. https://zenodo.org/records/6405084
- Gulla et al. LFP field data, Zenodo (excluded, CC BY-NC). https://zenodo.org/records/13715694
- BatteryLife raw (Zn/Na/CALB), Zenodo. https://zenodo.org/records/17960956
- Severson et al. 2019, https://doi.org/10.1038/s41560-019-0356-8 ; Attia et al. 2020, https://doi.org/10.1038/s41586-020-1994-5
- NREL Fleet DNA. https://www.nrel.gov/fleetdna ; NASA POWER. https://registry.opendata.aws/nasa-power/ ; Battery Archive. https://www.batteryarchive.org
