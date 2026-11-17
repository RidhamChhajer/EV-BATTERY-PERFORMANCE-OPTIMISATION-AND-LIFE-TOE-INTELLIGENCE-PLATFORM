# Required Parameters and Dataset Fit Check

**Status:** v1, 7 Nov 2026. Replaces the guesswork in `data-inventory-and-blueprint.md` with a parameter-first check. Nothing has been downloaded. All fit marks come from papers, dataset pages, APIs and authors' own documentation.

### How to read the marks
| Mark | Meaning |
|---|---|
| ✓ | Parameter present (checked in the authors' documentation or the paper) |
| ◐ | Present only partly (narrow range, sparse, derived, or aggregated) |
| ✗ | Not present |
| ? | Could not verify |

---

## 1. Where the parameter list comes from

| Source | What it told us | Check |
|---|---|---|
| **Severson 2019** (cycle life from early cycles) | Best predictors come from the voltage-versus-capacity curve: the **variance of ΔQ(V) between cycle 100 and cycle 10**, plus capacity-fade slope, **internal resistance, temperature, charge time** | Read via BatteryML paper (arXiv 2310.14714) and the authors' GitHub: per-cycle fields are cycle number, discharge/charge capacity, internal resistance, max/avg/min temperature, charge time; within-cycle fields are time, charge capacity, current, voltage, temperature, discharge capacity, dQ/dV |
| **BatteryML (Microsoft, ICLR 2024)** | Standard features across the field: Q(V) curve, Coulombic efficiency, internal resistance, early-cycle capacity slope, average charge time, temperature dynamics. SOH = discharge capacity ÷ nominal; RUL = cycles to 80% | arXiv HTML read (first ~70% of page) |
| **Liu et al., *Nat. Commun.* 2025** (field SOH from 300 EVs) | In real vehicles, use **charging segments**: a fixed constant-current voltage window (3900-4050 mV), then 15 health indicators: **mileage, average temperature, charged capacity (mean/median/std/range) in the window, cell-voltage spread dV (mean/median/std/range), charge-end voltage** | Full text read via Europe PMC |
| **Field data reality (same paper)** | Vehicle data is 0.1 Hz (10 s), has **no idle/rest records** (the BMS stops recording at power-off), and charge current is limited by temperature, highest cell voltage and charger power | Full text read |
| **Schimpe et al. 2018** (LFP semi-empirical model) | LFP ageing is modelled as **calendar + cycling**, with **temperature** (above 25 °C: SEI growth and cathode degradation; below 25 °C: lithium plating), **state of charge** and rate effects | Search abstracts only (full text not read) |
| **Preger et al. 2020** (Sandia, LFP/NMC/NCA) | Discharge rate, depth of discharge and temperature each change life by thousands of hours | Search abstracts only |
| **Bus energy models** (*Energies* 2024; TU Berlin; Tampere) | Trip distance, mean speed, passenger load, road slope (mean and std), ambient temperature, solar irradiance as inputs; heating raises consumption by factor 1.9 in a 12 m bus; winter +40-45% | Search abstracts only |
| **Fleet digital-twin practice** (several sources) | Minimum telemetry is **voltage, current, several temperatures**; useful extras are ambient temperature, duty-cycle intensity, a clean pack ID. Drifting current or temperature sensors give confidently wrong results | Search summaries; no vendor API docs found for TWAICE/Voltaiq/Qnovo |
| **Review of feature families** (2026) | Differential-curve features (IC/DV) and resistance features; "no single feature gives robust SOH" in real conditions | Search summary |

Not found: any public specification of what commercial fleet products (TWAICE, Aviloo, Geotab) ingest. That is a gap we should close from their documentation or sales material before finalising the customer data contract.

---

## 2. The required parameter set

**Priority: M = must have, S = should have, N = nice to have.**

### Layer A: Cell ageing model (trains on lab data)
| ID | Parameter | Unit | Why | P |
|---|---|---|---|---|
| A1 | Discharge capacity per cycle (to give SOH and cycle life) | Ah, % of nominal | The target. Cycle life = cycles to 80% | M |
| A2 | Cycle count / throughput (equivalent full cycles) | cycles, Ah | Ageing axis | M |
| A3 | Temperature of the cell | °C | Strongest known driver; mechanism changes at 25 °C | M |
| A4 | Charge rate | C | Lithium plating, fast-charge effect (Attia, Geotab) | M |
| A5 | Discharge rate | C | Preger: discharge rate changes life | M |
| A6 | Depth of discharge / SOC window | % | Cycling stress | M |
| A7 | **Time at high SOC and rest time (calendar ageing)** | hours, % SOC | Buses sit full overnight; lab cycling hides this | M |
| A8 | Voltage-capacity curve Q(V), ΔQ(V), dQ/dV | V, Ah | Best early predictor (Severson) | M |
| A9 | Internal resistance | Ω | Severson, BatteryML feature | S |
| A10 | Charge time | min | Severson, BatteryML feature | S |
| A11 | Chemistry, format, nominal capacity, voltage limits | metadata | Needed to filter to LFP | M |

### Layer B: Capacity estimation from real charging data (calibrates per vehicle)
| ID | Parameter | Unit | Why | P |
|---|---|---|---|---|
| B1 | Timestamp, pack voltage, pack current | s, V, A | Capacity from charge segments (Liu 2025) | M |
| B2 | SOC | % | Start/end of segments; correction | M |
| B3 | Charge/discharge status | flag | Finding segments | M |
| B4 | Min and max cell voltage (cell-voltage spread dV) | mV | Pack inconsistency: the **"weakest cell" penalty** | M |
| B5 | Min, max (or all) temperature sensors | °C | Charge limits; ageing | M |
| B6 | Odometer / accumulated mileage | km | Ageing axis; in Liu 2025 | M |
| B7 | Charge-session power and duration | kW, min | Charging stress and dwell | M |
| B8 | Idle / rest records | s | Calendar ageing | S (absent in field data) |
| B9 | Full per-cell voltage list | mV | Detailed inconsistency | N |

### Layer C: Bus duty cycle and range
| ID | Parameter | Unit | Why | P |
|---|---|---|---|---|
| C1 | Distance per day | km | Throughput | M |
| C2 | Speed profile (mean, variability), acceleration | km/h, m/s² | Energy and wear | M |
| C3 | Energy per km | kWh/km | Range model; NREL 1.9-2.4 kWh/mi | M |
| C4 | Ambient temperature | °C | Heating/cooling load; ageing | M |
| C5 | Road slope (mean, std) | % | In e-bus energy model | S |
| C6 | Solar irradiance | W/m² | In e-bus energy model | S |
| C7 | Passenger load | persons | Up to 25% effect (Lille) | S |
| C8 | HVAC / auxiliary power | kW | Factor 1.9 in winter heating | S |

### Layer D: Decision inputs (supplied by the operator, not data)
Pack price per kWh, warranty SOH floor and years, tariff and demand charge, contract rate per km, assured km/day, availability target, depot charger power. **No dataset supplies these for Indian buses.** The product takes them as configuration.

---

## 3. Fit matrix (parameters × datasets)

Datasets: **HUST**, **MATR**, **SNL** (Sandia, via Battery Archive), **TUM-cal** (Naumann LFP calendar), **EVB** (EVBattery), **CHG** (Changan, research only), **RVD**, **Auto** (Shenzhen charging), **NREL** (Fleet DNA + FTA reports), **POWER** (NASA POWER).

| Param | HUST | MATR | SNL | TUM-cal | EVB | CHG | RVD | Auto | NREL | POWER |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 Capacity / SOH | ✓ | ✓ | ✓ | ✓ | ◐ sparse labels | ◐ derived | ◐ SOH column, origin ? | ? | ✗ | ✗ |
| A2 Cycles / throughput | ✓ | ✓ | ✓ | ✗ (storage) | ◐ | ◐ odometer | ✓ 104k cycles | ✗ | ✗ | ✗ |
| A3 Temperature | ◐ one value (30 °C chamber) | ◐ measured, chamber 30 °C (R) | ◐ several temps; range ? | ✓ (grid ?) | ✓ min/max | ✓ min/max + sensors | ? | ? | ✗ | ✓ ambient |
| A4 Charge rate | ◐ one protocol | ✓ varied fast-charge | ◐ ? | ✗ | ✓ derived | ✓ up to 0.8 C | ✓ | ? | ✗ | ✗ |
| A5 Discharge rate | ✓ 77 protocols | ◐ | ✓ | ✗ | ◐ driving | ◐ driving | ◐ | ✗ | ✗ | ✗ |
| A6 DoD / SOC window | ✓ | ◐ | ✓ | ✗ | ◐ | ◐ | ◐ | ◐ | ✗ | ✗ |
| A7 **Time at high SOC / rest** | ✗ | ✗ | ◐ (calendar arm, R) | ✓ | ✗ | ✗ (no idle records) | ✗ | ✗ | ✗ | ✗ |
| A8 Q(V), ΔQ(V), dQ/dV | ✓ | ✓ | ✓ | ✓ DVA | ✓ 128-pt snippets (V perturbed) | ✓ 10 s | ◐ | ◐ | ✗ | ✗ |
| A9 Internal resistance | ? | ✓ | ? | ✓ R_DC, EIS | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| A10 Charge time | ✓ derivable | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| A11 Chemistry metadata | ✓ LFP | ✓ LFP | ✓ LFP/NMC/NCA | ✓ LFP | ✗ undisclosed | ✓ NCM (paper) | ? | ◐ codes (LFP, NMC) | n/a | n/a |
| B1 V, I, time | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ? | ✗ | ✗ |
| B2 SOC | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ? | ✗ | ✗ |
| B4 Min/max cell V (inconsistency) | ✗ (one cell) | ✗ | ✗ | ✗ | ✓ | ✓ | ? | ? | ✗ | ✗ |
| B5 Pack temperatures | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ? | ? | ✗ | ✗ |
| B6 Odometer | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ◐ | ✗ |
| B7 Charge power/duration | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| C1 Distance/day | ✗ | ✗ | ✗ | ✗ | ◐ | ✓ | ◐ | ✗ | ✓ | ✗ |
| C2 Speed, acceleration | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ speed | ✓ | ✗ | ✓ | ✗ |
| C3 Energy per km | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ derivable | ◐ | ✗ | ✓ aggregates | ✗ |
| C4 Ambient temperature | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| C5 Road slope | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ? | ✗ |
| C6 Solar irradiance | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| C7 Passenger load | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| C8 HVAC / aux power | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ? | ✗ |
| Licence, commercial OK | ✓ CC BY 4.0 | ? | ? | ✓ CC BY 4.0 | ✓ CC BY 4.0 | ✗ academic only | ✓ CC BY (page) | ✓ CC BY 4.0 | public, cite | permissive |
| Verification | V | R (GitHub docs) | R | V (metadata) | V (paper) | V (page + paper) | V (page) | V (metadata), schema ? | R | R |

R in the A3 cell for MATR: a downstream benchmark lists 30 °C for the Severson data; I could not confirm it for every cell.

---

## 4. What the check shows

### 4.1 Gaps in the data (these will limit what the system can promise)
0. **Update (Sandia and Stanford checked, see section 8):** hot-climate *calendar* ageing is now covered (Stanford, LFP at 24/45/60/85 °C). Hot *cycling* is still capped at **35 °C** (Sandia). Both have **no declared licence**.
1. **Temperature coverage is the biggest hole.** The two best LFP sets, HUST and MATR, are both run around **30 °C**. Indian depots run hot, so this is exactly where predictions matter. Only Sandia varies temperature for LFP, and its cycling range is **not confirmed** (its LFP calendar arm is reported at 15, 25 and 35 °C). Nothing I verified covers sustained 40 °C+ cycling for LFP. Stanford's long-term calendar set (232 cells, includes LFP, stored at 60 and 85 °C per a Sandia listing) is a candidate but is not verified.
2. **Calendar ageing has only one verified LFP source.** The TUM dataset (Naumann; CC BY 4.0; 17 storage conditions × 3 cells; capacity, resistance, EIS, DVA) is small summary tables, and I did not confirm its temperature grid.
3. **No LFP field data with vehicle signals.** All real-vehicle sets are NCM (Changan) or undisclosed (EVBattery, RVD). So the **"weakest cell" penalty cannot be measured on LFP** from public data. It can only be learned on other chemistry and flagged as an assumption.
4. **Field data has no rest periods.** Changan (and likely others) stop recording at power-off. Calendar ageing cannot be learned from field data. It must come from lab/calendar sets.
5. **No bus-specific loads at all.** Passenger load, HVAC power and road grade have no verified public source. NREL/FTA gives only aggregate energy per mile.
6. **Field SOH labels are derived.** Changan labels come from ampere-hour integration with open-circuit-voltage correction. EVBattery's capacity labels come from manufacturer engineers and are sparse; its health label is a fault flag.

### 4.2 What the check settles
- **Layer A (cell model): well supported for LFP at about 30 °C**, with calendar ageing partly covered.
- **Layer B (capacity from charging segments): the method can be built and tested** on EVBattery (commercial) and Changan (research only). Neither is LFP.
- **Layer C (bus duty cycle): only partly supported**, from aggregates and weather.
- **Layer D: configuration, not data.**

---

## 5. Proposed data list

### Use for the build
| Dataset | Role | Note |
|---|---|---|
| **HUST** | LFP cell ageing, varied discharge | CC BY 4.0, 1.19 GB; 30 °C only |
| **MATR** (MIT-Stanford-TRI) | LFP cell ageing, varied fast-charge, has temperature and resistance | **Data licence unverified**; the authors' *modelling code* is academic-licence only, so write our own models |
| **Sandia via Battery Archive (LFP subset)** | Cycling at 15/25/35 °C with varied discharge rate and DoD | 19 LFP cells (third-party table); **no licence declared on the pages I read**; get written clarification |
| **Stanford long-term calendar ageing** (Lam et al., *Joule* 2024; OSF `ju325`) | LFP storage ageing at 24/45/60/85 °C and 50/100% SOC; capacity, resistance, full diagnostic curves | 107 LFP cells (K2 Energy 18650); public on OSF, summary 2.3 MB, raw 848 MB; **no licence declared on OSF or GitHub** |
| **TUM Naumann** | LFP calendar ageing | CC BY 4.0, small |
| **EVBattery** | Field charging behaviour, cell-voltage spread, anomaly flags | CC BY 4.0, 1.4 GB; chemistry undisclosed, values perturbed |
| **NASA POWER** | Temperature and solar for any Indian location | Permissive |
| **NREL Fleet DNA + FTA reports** | Bus drive cycles and energy per mile | Public; US only |

### Verify before deciding
Wheeler 20-cell LFP set (licence), KIT 228-cell set (LFP subset), CALB (chemistry), RVD (login, chemistry, SOH origin, temperature column), Shenzhen/Autosun (feature list; two sessions per vehicle, so only useful for charging behaviour).

### Research only (not for a shipped model, without permission)
**Changan 300-vehicle set.** It is the only verified source with the full field signal set (cell-voltage lists, temperatures, speed, odometer, charge status at 10 s). It would let us design and test the field pipeline and the pack-inconsistency method. A 100 MB sample is offered; the full set is 72 GB. Terms: academic research only (CC BY-NC-SA 4.0). Using it in a commercial product needs written permission from the lab or legal advice.

### Drop for now
XJTU, Tongji, NASA PCoE (wrong chemistry; revisit only for transfer learning), Gulla (non-commercial), IEEE hybrid set, CH-BatteryGen, DiffBatt (synthetic or generated).

---

## 6. Effect on Phase 0

Revised download list, **nothing downloaded yet**:
1. **HUST** (1.19 GB): LFP baseline.
2. **EVBattery** (about 1.4 GB): field-signal checks.
3. **TUM Naumann** (small): calendar ageing check.
4. **MATR**: only after I read its terms.
5. **Changan 100 MB sample**: research use only, to check the field pipeline; needs your explicit OK on the licence.

Removed from Phase 0: Shenzhen/Autosun (parameters unverified, cross-sectional), CALB, XJTU, Tongji.

---

## 7. What I need before finalising

1. **Decision on the temperature gap.** Options: (a) accept 30 °C-centred training and label hot-climate forecasts as extrapolation; (b) bring in Sandia and Stanford calendar sets (licences to verify); (c) both.
2. **Decision on Changan.** Use for research only, or contact the lab for commercial permission.
3. **Permission to read licence terms** for MATR, Sandia/Battery Archive, Stanford calendar, Wheeler (reading web pages only, no downloads).
4. **Customer data contract.** Confirm the minimum signals an operator must provide for calibration (B1-B7). I found no vendor documentation on what comparable products ask for.

---

## References (read or checked this session)
- Liu et al., *Nat. Commun.* 16 (2025), PMC11779878 (full text via Europe PMC); data page https://ivstskl.changan.com.cn/?p=2697
- BatteryML, arXiv 2310.14714 https://arxiv.org/abs/2310.14714
- BatteryLife data structure https://github.com/Ruifeng-Tan/BatteryLife/blob/main/assets/Data_structure_description.md
- Severson dataset documentation https://github.com/rdbraatz/data-driven-prediction-of-battery-cycle-life-before-capacity-degradation
- Naumann et al. LFP calendar ageing, Mendeley https://data.mendeley.com/datasets/kxh42bfgtj
- Schimpe et al. 2018, *J. Electrochem. Soc.* DOI 10.1149/2.1181714jes (abstract only)
- Preger et al. 2020, DOI 10.1149/1945-7111/abae37 (abstract only)
- HUST, Mendeley https://data.mendeley.com/datasets/nsc7hnsg4s ; EVBattery https://arxiv.org/abs/2201.12358
- E-bus consumption model, *Energies* 17(4):911 (2024) (via search abstracts)


---

## 8. Update: Sandia and Stanford checked (metadata only, nothing downloaded)

### 8.1 Stanford long-term calendar ageing (Lam et al., *Joule* 2024, DOI 10.1016/j.joule.2024.11.013)
| Item | Finding | Check |
|---|---|---|
| What it is | Storage (calendar) ageing of 8 cell types, up to 13 years | Repo README + paper abstract (**V**) |
| LFP content | **107 LFP cells**, all K2 Energy 18650 (types LFP18650P and LFP18650E, plus v2 lots) | Counted from the repo's cell list, `Joule_cell_id.csv` (**V**) |
| LFP conditions | 24 °C: 25 cells; **45 °C: 20; 60 °C: 31; 85 °C: 31**; each at 50% or 100% SOC | Counted from the same list (**V**) |
| What is measured | Capacity (low and high rate), energy, steady-state resistance at each diagnostic; raw voltage-current curves per diagnostic | README (**V**) |
| Where | OSF `osf.io/ju325`: `joule_declass_sum.zip` (2.3 MB), `joule_declass_raw.zip` (848 MB) | OSF API (**V**) |
| Licence | **None declared** on OSF or the GitHub repo. "Public" does not mean "free for commercial use" | OSF and GitHub APIs (**V**). Needs the authors' written clarification |
| Limits | Storage only (no cycling); small 18650 cells; diagnostics weekly to yearly | README |

Value for us: fills the **time-at-high-SOC and hot-storage** gap (parameter A7), which matters for buses parked charged in the heat. It also gives 45 °C, closest to Indian depot conditions.

### 8.2 Sandia LFP cycling (Preger et al., *J. Electrochem. Soc.* 2020, DOI 10.1149/1945-7111/abae37)
| Item | Finding | Check |
|---|---|---|
| What it is | Multi-year cycling of LFP, NCA and NMC 18650 cells; varies discharge rate, depth of discharge, temperature | OSTI abstract (**V**) |
| LFP content | **19 LFP cells**, 1.1 Ah, 2.0-3.6 V; groups at **15, 25 and 35 °C** | Third-party supplementary table (**R**) |
| Hot limit | **35 °C is the highest LFP cycling temperature I could find.** Sandia's own NMC/NCA temperature raw data (1.88 GB) is separate and is not LFP | Sandia R&D repository page (**V**) |
| Access | Hosted on Battery Archive. The site says full CSV files can be obtained by emailing `info@batteryarchive.org`. I could not see a download or licence statement | Site pages read (**V** for what is written; access route **?**) |
| Licence | **Not found** | **?** |

Value for us: the only verified source where LFP **cycling** (not storage) varies with temperature and discharge rate. Small (19 cells) and capped at 35 °C.

### 8.3 What this changes
| Question | Answer now |
|---|---|
| Is hot-climate *storage* ageing covered for LFP? | **Yes** (Stanford, 24-85 °C), pending licence |
| Is hot-climate *cycling* ageing covered for LFP? | **Partly**: up to 35 °C (Sandia), 30 °C (HUST, MATR). Nothing above 35 °C verified |
| Does Indian depot heat mean cells run above 35 °C? | **Not known.** Cell temperature depends on pack cooling, which I have not verified for Indian buses. Models should be driven by *cell* temperature, not ambient, and extrapolation beyond 35 °C must be labelled |
| Can we ship models trained on these? | **Not yet.** Neither dataset declares a licence. Next step: email the authors / Battery Archive for terms, and meanwhile treat both as research-only |

### 8.4 Revised Phase 0 list (still nothing downloaded)
| # | File | Size | Licence status |
|---|---|---|---|
| 1 | HUST `our_data.zip` | 1.19 GB | CC BY 4.0 |
| 2 | EVBattery (3 files) | about 1.4 GB | CC BY 4.0 |
| 3 | Naumann LFP calendar (4 xlsx) | small | CC BY 4.0 |
| 4 | Stanford calendar summary `joule_declass_sum.zip` | 2.3 MB | **undeclared** (research use, pending authors) |
| 5 | Stanford raw `joule_declass_raw.zip` | 848 MB | **undeclared**; only if the summary proves useful |
| 6 | Sandia LFP cells via Battery Archive | small (19 cells), **access by email** | **undeclared**; request, don't scrape |
| 7 | Changan 100 MB sample | 100 MB | academic only |

MATR stays out until I read its terms.


---

## 9. Scope update: college course project (non-commercial)

The project owner confirmed this is a **college course project, not a product for sale**. The commercial-licence test used in sections 2-8 is therefore relaxed.

| Dataset | Earlier status | Status now |
|---|---|---|
| **Changan 300-vehicle field data** (academic research only, CC BY-NC-SA 4.0) | Research-only | **Usable.** Coursework is academic research. 100 MB sample or 72 GB full set; cite Liu et al. 2025; do not redistribute |
| **Stanford calendar data** (no declared licence) | Research-only pending permission | **Usable for coursework.** Cite Lam et al. 2024; do not redistribute |
| **Sandia LFP cycling** (no declared licence) | Research-only pending permission | **Usable for coursework.** Cite Preger et al. 2020; obtain via Battery Archive |
| **Gulla LFP field data** (CC BY-NC 4.0) | Excluded | **Usable.** Real field LFP, 28 systems of 24 V / 160 Ah. Keep the selection-bias caveat (all were returned units) |
| **MATR** (licence unverified) | Held back | Usable for coursework; cite Severson et al. 2019 |
| **RVD, Wheeler, KIT** | To verify | Same; still need a free account (RVD) or format checks |

### Still true
- **Real data only** (no synthetic or generated data) still applies: that is a project rule, not a licence matter.
- **Free to download only.** The 72 GB Changan full set is free but large; check disk space first.
- **Cite every dataset** and keep downloaded data out of any public repository or report appendix.
- **Check your course and university rules** on data use and on publishing results.
- **If this ever becomes a product or startup,** the earlier commercial-licence analysis applies again; the licences of Changan, Gulla, Stanford and Sandia would need to be cleared or those datasets removed and models retrained.
- **No change to the science:** the gaps (no bus-pack data, no hot-cycling LFP above 35 °C, no passenger-load data) remain.

### Effect on the data list
Real LFP field data (Gulla) and the full real-vehicle signal set (Changan) are both back in the pool. Changan is NCM and Gulla is a small stationary-style LFP pack, so **neither fixes the bus-pack gap**. They help test the capacity-from-charging method and the weakest-cell effect.
