# EV Fleet Battery Intelligence: Business Case

**Status:** v1 research draft, 7 Nov 2026. Reference document for all later research and build work.
**Rule it enforces:** real data only. No synthetic or simulated data anywhere in the product.

---

## 0. Scope and assumptions

- **Client:** operators of large EV fleets that run on daily duty cycles: city and intercity **buses**, and **logistics/delivery vehicles** (vans, light trucks).
- **Primary case (confirmed by the project owner, 7 Nov 2026):** **Indian city e-buses, as a vehicle category, not a named client.** There is no fixed operator, city or transit agency. The product is built for the *typical* Indian e-bus (the reference archetype in section 0.1), and must be configurable so any operator can be onboarded later. Contract terms (per-km pay, uptime penalties, assured km) from Gross Cost Contracts (GCC) are used as the representative commercial model. Global evidence is supporting context only. Logistics vans are out of scope for v1.

### 0.1 Reference vehicle archetype (what "typical Indian e-bus" means here)

Derived from manufacturer and trade-press specs. **All specs are manufacturer or dealer claims [C/B]**, not measured; treat as design ranges to be replaced by real operator data.

| Attribute | Archetype | Evidence |
|---|---|---|
| Duty | City transit under GCC; intercity coaches excluded from v1 | CESL/state tenders **[B]** |
| Size | **12 m low-floor (primary)**, 9 m (secondary). In CESL's 10,900-bus 2025 tender, my tally of the stated allocations is ~83% 12 m (~8,600 vs ~1,700 9 m). A Jan 2026 tender for 6,230 buses is more mixed (7 m, 9 m, 12 m) | electrive tender reports **[B]**, tally is my arithmetic. Tender allocation, not deployed fleet |
| Chemistry | **LFP** (lithium iron phosphate). Market pages put LFP at "over 50%" to ~79% of Indian e-bus packs; NMC mainly intercity/niche | Directional only, vendor research pages **[C]**; no primary source for the split |
| Pack size | **~190-420 kWh**, most 12 m city buses roughly **280-370 kWh** (Switch EiV12 189-423 kWh LFP; Switch Chennai 283 kWh; EKA 12M ~300 kWh LFP; PMI/BEST 366.66 kWh LFP; CATL-based 353 kWh). Tata Starbus 4/12 listed ~200 kWh (old aggregator, unconfirmed) | Manufacturer/trade press **[C/B]** |
| Claimed range | ~200-314 km per charge (spec conditions); real-world is lower (see section 3.3) | **[C]** |
| Charging | **Overnight depot charging** via CCS2 DC chargers (e.g. 150 kW example; 50-240 kW common); opportunity charging via pantograph is the exception | Trade press **[B]** |
| Real consumption | NREL measured US transit buses 1.9-2.4 kWh/mile; Indian blog 1.38 kWh/km | **[B]/[C]**, section 3.3 |

**Consequences for the build**
1. **Segment-level models, operator-agnostic.** One model family for "LFP, 12 m, depot-charged city bus", with pack size, chemistry, duty cycle and contract terms as configuration, so a new operator can be onboarded without redesign.
2. **LFP is the right target chemistry, and also the harder estimation problem.** LFP has a flat voltage plateau, which makes capacity estimation from voltage alone harder than for NMC (general battery-engineering knowledge; verify in the literature review). Severson et al.'s public cells are LFP/graphite, which helps, but they are lab cells.
3. **Chemistry mismatch risk for real vehicle data.** EVBattery, RVD and the Nat. Commun. fleet data are passenger EVs. Verified since: the Nat. Commun. fleet is **NCM**; EVBattery's chemistry is undisclosed; RVD's is unstated. The transfer to LFP buses is therefore a stated limitation. See `data-inventory-and-blueprint.md`.
4. **No client means no pilot data yet.** See open questions: real bus data must come from public sources first, with pilot operators approached later.
- **Product in one line:** a decision tool that predicts how each vehicle's battery will age, how range and charging time will change, and what that means in money, so fleet owners can decide when to replace, how to charge, how to route and how to price contracts.

### Evidence tiers used in this document

| Tier | Meaning | Marker |
|---|---|---|
| A | Primary record checked at abstract/bibliographic level (arXiv abstracts fetched directly; Nature papers confirmed via multiple records). Full texts not yet read | **[A]** |
| B | Credible secondary (trade press, think tank, industry body) reporting a primary source I did not open | **[B]** |
| C | Vendor claim, commercially interested | **[C]** |

Segment matters. Most hard degradation numbers below come from **light-duty / passenger fleets**, not buses or freight. Each number is labelled. That gap is itself part of the case (section 3.5).

---

## 1. Executive summary

1. **The cost is real and concentrated in the battery.** In one operator's example a ~£500k bus carries ~£150k of battery **[C]**, and replacement is described as a near-certain event for operators of electric buses, with degradation accelerating below ~70% state of health (SOH) **[C]**.
2. **Fleets can't currently see battery health reliably.** A 2026 preprint on 1,114 EVs from five manufacturers found on-board (BMS) SOH barely tracks measured capacity differences, and 384 vehicles did not expose SOH at all **[A, preprint, not yet peer reviewed]**. A product that trusts BMS SOH inherits that blindness.
3. **How the battery is used changes how fast it ages.** Geotab's 2026 telematics study (22,700+ EVs, passenger/light-duty) reports ~2.3%/year average degradation, up to 3.0%/year for vehicles relying heavily on >100 kW DC fast charging versus ~1.5%/year for mostly lower-power charging **[B: Geotab release via search summaries, not opened]**. Charging and operating policy is a controllable lever.
4. **Contract penalties make downtime expensive.** Chennai's 12-year GCC pays Rs 80.86/km (AC) with 200 km/bus/day assured; the operator paid more than Rs 9.5 crore in penalties in 2025-26 as breakdowns rose from 0 to 372 per month **[B]**. (A headline said Rs 95 crore; the article text says Rs 9.5 crore. Use 9.5.)
5. **The data gap is the opportunity and the main risk.** Lab datasets are plentiful; public real-vehicle data is scarce. The product must be built on real field data (section 8), and bus/freight-specific evidence is thin.

---

## 2. Stakeholders and the decisions they own

| Stakeholder | Decision they must make | What a wrong call costs |
|---|---|---|
| **Fleet owner / operator CFO** | When to replace or lease batteries; capex vs battery-as-a-service; what per-km rate to bid | Early replacement wastes remaining life; late replacement causes range loss and breakdowns |
| **Depot / operations manager** | Charging schedule, fast vs slow charging, vehicle-to-route assignment, spare ratio | Missed assured km, penalties, overtime, idle buses |
| **Maintenance / asset manager** | Which packs to inspect, warranty claims, retirement or second-life | Unplanned failures; lost warranty claims |
| **Energy / sustainability lead** | Tariff and peak-demand management, charger sizing | Demand charges, grid upgrade delays |
| **Transit authority / contract owner** | Whether operator meets uptime and range clauses | Disputes; payment delays that feed back into operator finances |
| **Lender / lessor / insurer** | Residual value assumptions, financing terms | Residual value risk is cited as a reason banks rarely finance battery-electric truck fleets **[B: Calstart via trade press]** |

---

## 3. The business problem, with evidence

### 3.1 Battery cost and replacement timing
- Battery roughly £150k of a ~£500k bus; capex ~2.5x diesel once infrastructure and a replacement battery are counted, but ~7% cheaper per mile on an NPV basis over the lifetime **[C: Zenobē]**.
- Industry-average pack price fell to $108/kWh in 2025 (LFP ~$81, NMC ~$128) **[B: BloombergNEF release]**. This is an **all-segment average**; the bus/commercial figure is paywalled. **Do not use $108/kWh to price bus packs.** Obtain real quotes.
- The replacement threshold used in practice is ~70-80% SOH (warranty floors and the point where degradation accelerates) **[C/B]**. The product must model the *economics of crossing that line*, not just the line.

### 3.2 Uptime and contract penalties (India GCC)
- Chennai MTC GCC: Rs 80.86/km AC, Rs 77.16/km non-AC, minimum assured 200 km/bus/day, availability expected around 95-98%, penalties for shortfall **[B]**. OHM Global Mobility (625 buses) paid >Rs 9.5 crore in 2025-26 penalties; breakdowns rose 0 → 372/month (June 2025 → March 2026). The article does not state causes **[B: DT Next, RTI reply]**. Do **not** attribute these breakdowns to batteries.
- Payment risk: operators rely on bank debt and are exposed to authority payment delays, so unplanned cost shocks are harder to absorb. India notified the PM e-Bus Sewa Payment Security Mechanism in Oct 2024 **[B: WRI India, trade press]**.
- Range is contractual: CESL tender specs of 250 km (12 m) and 225 km (9 m) on a full charge **[B]**. Range fade over time directly threatens compliance.
- Open point: no source found on how battery-replacement cost or risk is split between operator and authority. Needs a real contract review.

### 3.3 Operating reality vs spec
- US NREL/FTA transit evaluations report measured **1.9-2.4 kWh/mile** for battery buses and availability often below the 85% target (e.g. 71.3% Long Beach, 51.8% Duluth, 80.6% King County) **[B: figures from report excerpts; availability definitions differ, check the full PDFs before citing]**.
- An Indian fleet-operator blog cites ~1.38 kWh/km mixed-city consumption vs 0.8-1.0 vendor claims **[C]**. Treat as indicative.
- Lesson: planning from spec-sheet range and energy numbers is unsafe; the product must learn per-vehicle, per-route reality.

### 3.4 Climate, charging behaviour and energy cost
- **Cold:** Recurrent (Nov 2025, 30,000+ cars, 34 models, **passenger**) found the average model keeps ~78% of normal range at 32°F, best 88%, worst 69%; loss is mostly cabin heating and reverses as it warms **[B]**. Geotab reports heater use as the main cause **[B]**. Extreme-cold figures up to ~50% appear in secondary coverage of Geotab data **[B, weak]**.
- **Charging:** Geotab 2026: ~2.3%/yr average; >100 kW DC fast charging up to 3.0%/yr vs ~1.5%/yr mostly AC/lower power; projected 81.6% SOH after 8 years; the study also argued against blanket 20-80% charging advice **[B: Geotab release via search summaries]**. One secondary source puts heavy fast chargers at ~2.5%, so use 3.0 only with attribution. Geotab 2024: 1.8%/yr, thermal management mattered (liquid-cooled 2.3% vs passive-air Nissan Leaf 4.2%) **[B]**.
- **Driving style / throughput:** harsh acceleration raises energy throughput and degradation; shallower depth of discharge and lower-power charging slow ageing **[C: Zenobē]**.
- **Grid cost:** utility demand charges, slow grid upgrades and insufficient charging infrastructure are named transit barriers **[B: TRB workshop paper]**. A 2025 NACFE survey (175 respondents) had utility issues as the top barrier at 24% **[B]**.
- Segment caveat: all the climate and charging-rate numbers above are from passenger/light-duty fleets.

### 3.5 Data and visibility problems (the central gap)
- **BMS SOH is unreliable across manufacturers.** In 1,114 EVs / 5 manufacturers / 375 days, real capacity differences of 12-25% existed within every model, BMS SOH correlation with independent measurement ranged from ρ=0.10 (non-significant) to ρ=0.62 only under restrictive filtering, and 384 vehicles did not expose SOH. A BMS-independent charge-segment marker reached 74-89% degradation classification accuracy **[A: arXiv 2603.21592, submitted to Nature Energy, not peer reviewed]**.
- **Lab-to-field gap.** Models built on clean lab cycling don't transfer to irregular, noisy, partial-cycle field data; multiple reviews call this a key barrier **[B]**. Fraunhofer fleet work started from 25 e-buses; a 2026 SAE paper saw 2.5-3% degradation over ~16 months in 10 commercial EVs **[B]**.
- **Public real-vehicle data is scarce** (EVBattery states it is the first large-scale public real-world set; earlier sets covered a handful of vehicles) **[A: arXiv 2201.12358]**.
- **Regulatory pull:** EU Battery Regulation 2023/1542 requires a battery passport with live SOH from Feb 2027, but access is restricted to parties with a legitimate interest; fleet operators are not clearly named, so access may route through OEMs or service providers (my inference, check EUR-Lex) **[B]**.
- **Survey signal:** an EVAI survey of 2,500+ fleet executives (Mar 2025) listed predictive analytics on battery performance (39%) among the most-needed data, and uncertain resale value (20%) as a barrier **[B]**.

### 3.6 Residual value and second life
- Battery condition is claimed to be 30-40% of a used EV's worth, and certified EVs sold ~7 days faster **[C: certification vendors]**. A trade report notes there is no independent metric proving the certificate premium **[B]**. Treat residual-value upside as a hypothesis to test, not a number to sell.

---

## 4. How the problem is handled today, and where it falls short

| Current method | What it does | Limitation |
|---|---|---|
| OEM/BMS-reported SOH | Gives each vehicle a health number | Not reliable across makes; missing on a third of one study fleet; proprietary access **[A]** |
| Fleet telematics EV modules (e.g. Geotab EV Battery Health) | Telematics-derived actual vs original capacity (kWh); claims 300+ makes/models **[B/C]** | Light-duty focus; coverage varies by OEM; reports state, rarely prescribes decisions |
| Specialist battery analytics (TWAICE, ACCURE, Volytica; Aviloo diagnostics) | Cloud health analytics, warranty tracking; TWAICE+ViriCiti for bus fleets **[C]** | Vendor claims; I could not verify methods or independent accuracy; bus/logistics decision support depth unknown |
| Lessor / battery-as-a-service (Zenobē) | Transfers replacement and price risk | Moves cost, doesn't reduce it; vendor-modelled savings (replacement delayed up to 3 years on a 50-bus fleet) are unaudited **[C]** |
| Resale battery health certificates | Evidence for used-vehicle sale | One-off snapshot, not forward forecast; premium unproven **[C]** |
| Rules of thumb (replace at 70-80% SOH, keep 20-80% charge) | Simple policy | Geotab 2026 argued against blanket 20-80% advice **[B]**; ignores each vehicle's duty cycle |
| Manual route / charge planning | Dispatcher judgment | No per-vehicle ageing feedback |

**Gap to occupy:** forward-looking, per-vehicle degradation and range forecasts, validated on field data, expressed in rupees/dollars per km and tied to operating decisions (charge policy, route assignment, replacement timing, contract pricing). Existing tools are strong on *current state* and weak on *prescriptive, bus/logistics-specific, uncertainty-aware decisions*. This is a hypothesis; verify with a proper competitor review.

---

## 5. What the research says (and what it doesn't)

| Paper / source | Contribution | Limits for us |
|---|---|---|
| Severson et al., *Nature Energy* 4, 383 (2019), DOI 10.1038/s41560-019-0356-8 **[A]** | 124 LFP/graphite cells; cycle life predicted to 9.1% error from first 100 cycles; lifetime range 150-2,300 cycles | Lab cells, fast-charge protocols; not field data |
| Attia et al., *Nature* 578, 397 (2020), DOI 10.1038/s41586-020-1994-5 **[A]** | Closed-loop Bayesian optimization of 6-step fast-charge protocols with early cycle-life prediction; 224 protocols in 16 days vs >500 days | Cell-level lab; useful idea for charge-policy search, not a fleet method |
| He et al., "EVBattery", arXiv 2201.12358 **[A]** | Large public real-world dataset: hundreds of EVs, 3 manufacturers, several years. **Labels are an anomaly flag (fire / lithium plating) and sparse capacity values, not SOH**; values are perturbed for anonymisation | Passenger/light vehicles; chemistry undisclosed; CC BY 4.0 |
| Liu et al., *Nat. Commun.* 16 (2025), DOI 10.1038/s41467-025-56485-7 **[B: abstract records]** | Multi-modal deep learning SOH from field data of 300 **NCM** EVs over 3 years; SOH labels are **derived** (Ah integration + OCV-SOC correction) | Data page states **academic research use only**: not usable in a commercial product without permission. Full text read via Europe PMC |
| Park et al., arXiv 2603.21592 (2026) **[A, preprint]** | BMS SOH fails independent validation; BMS-independent marker | Not peer reviewed; passenger EVs |
| Fraunhofer IVI (Lehmann & Weiß 2023; *Batteries* 2024) **[B]** | Fleet SOH from field data only, 25 e-buses; lab-pretrained net fine-tuned on bus fleet | Closest to our bus target; get full text |
| Geotab "Taking Charge" (2024) and 2026 study **[B]** | Large telematics degradation statistics, charging-rate effects | Passenger/light-duty; aggregated, not per-vehicle forecasting |

**Research gaps worth owning:** (1) bus and freight field degradation with real duty cycles; (2) turning SOH estimates into *calibrated uncertainty and economic decisions*; (3) transfer from lab/passenger data to bus packs; (4) climate-conditioned range and degradation per route; (5) validation without trusting BMS SOH. A systematic lab-vs-field model comparison across fleets was not found in my searches, so that may be open.

---

## 6. Parameters that matter (the core of this document)

Each row ties a stakeholder decision to a measurable metric and states whether we can get it from real data we can legitimately use today.

| Decision | Metric | Unit / threshold | Real-data availability |
|---|---|---|---|
| When to replace/lease battery | **State of health**: usable capacity vs original | % of kWh; replacement trigger ~70-80% (contract/warranty specific) | Must be **estimated independently of BMS**; No public bus-pack SOH labels exist. RVD lists an SOH column (passenger, origin unverified); EVBattery has sparse capacity labels only; Changan data is academic-only. Bus data needs operator telematics |
| Replacement timing & budget | **Remaining useful life** with confidence interval | months / km / equivalent full cycles to threshold | Derived; needs longitudinal field data |
| Range compliance | **Usable range** by temperature, load, route | km at given conditions vs contract (e.g. 225-250 km) | Operator telematics + weather; Recurrent/Geotab give passenger-level benchmarks only |
| Energy cost, route assignment | **Specific consumption** | kWh/km (NREL buses 1.9-2.4 kWh/mile measured) | NREL/FTA public reports (aggregate); per-vehicle needs telematics |
| Charging policy | **DC fast-charge share and C-rate** | % of energy via >100 kW; peak C-rate | Telematics/charger logs; Geotab shows effect size (passenger) |
| Ageing control | **Depth of discharge, time at high SOC, charge/discharge throughput** | % DoD, hours >90% SOC, kWh throughput, equivalent full cycles | EVBattery/RVD (SOC, current, voltage); operator logs |
| Thermal risk | **Pack temperature and ambient** | °C distribution, time above threshold | Telematics + public weather data (e.g. national met services) |
| Depot scheduling | **Charge dwell time and availability window** | min per charge; % fleet ready at departure | Operator depot logs |
| Contract compliance | **Fleet availability and assured km/day** | % (GCC ~95-98%), km/bus/day (e.g. 200) | Operator records; Chennai contract terms public (B) |
| Bid pricing / TCO | **Cost per km** (energy + battery wear + maintenance + penalty risk) | Rs or $ per km | Computed; battery-wear term needs real pack quotes |
| Grid cost | **Peak demand** | kW per billing period, tariff structure | Operator utility bills + tariff schedule |
| Residual value / financing | **Projected SOH at resale/end of contract** | % at year N, with uncertainty | Derived; residual premium unproven (C) |
| Safety / early failure | **Anomalies** (cell imbalance, thermal events) | flags per vehicle | EVBattery supports failure-detection work; needs raw cell data |

**Hard requirement derived from section 3.5:** because BMS SOH is unreliable, the product must compute capacity from raw voltage/current/charge segments and validate it against independent reference measurements. BMS SOH can be an input, never the truth.

---

## 7. Value hypotheses and an illustrative calculation

Hypotheses (each to be tested with real client data):
1. **Replace at the right time.** Avoid replacing early (wasted remaining life) or late (range failure, penalties).
2. **Slow ageing through policy.** Shift charge power, depth of discharge and routing per vehicle.
3. **Cut penalty and downtime exposure.** Forecast which vehicles will miss range or availability before they do.
4. **Price contracts and financing with evidence.** Bid per-km rates and residual assumptions on measured degradation, not spec.
5. **Lower peak-demand and energy cost.** Charge scheduling against tariffs.

**Illustrative example (not a forecast).** Using only cited inputs: time from 100% to 70% SOH at a linear rate is 30 points ÷ rate.
- 3.0%/yr (heavy >100 kW fast charging) → ~10 years
- 1.5%/yr (mostly lower-power charging) → ~20 years
- 2.3%/yr (average) → ~13 years

**Why this is only illustrative:** rates are from light-duty fleets; Electrek flagged straight-line extrapolation as questionable; Zenobē says degradation accelerates below ~70% **[B/C]**; buses and delivery vans do more throughput per day than passenger cars; and the percentage-per-year basis (points vs relative) must be checked in Geotab's methodology. A real ROI needs the client's actual duty cycle, pack price and contract terms. **No fleet-size or savings figures are given here on purpose.**

---

## 8. Data strategy under the "real data only" rule

| Source | Type | Use | Caveat |
|---|---|---|---|
| EVBattery (arXiv 2201.12358) | Real vehicles, charging snippets; anomaly flag + sparse capacity labels | Capacity-estimation and anomaly-detection experiments (not an SOH trajectory source) | Passenger EVs; chemistry undisclosed; values perturbed; CC BY 4.0 |
| RVD, IEEE DataPort DOI 10.21227/jyrv-2179 | 104,621 cycles, 300 vehicles; voltage, current, SOC, SOH, speed, mileage | SOH estimation with usage features | Needs free IEEE DataPort login; chemistry and SOH origin unstated; relation to the Changan data unknown |
| Changan / Nat. Commun. 2025 field data (300 NCM EVs, 3 yrs) | Real field data | Research benchmark only | **Academic-use-only terms**; NCM |
| NREL/FTA transit evaluations | Aggregate real bus energy and availability | Bus-level energy and availability priors | Aggregates, not per-vehicle time series |
| NASA, CALCE, Oxford, Battery Archive, MIT-Stanford-TRI cells (Severson/Attia data) | Real **lab** cell cycling | Pretraining and mechanism checks only | Not fleet data; must not be presented as fleet evidence. Availability not verified in this round |
| Public weather archives | Real ambient data | Climate effect modelling | Needs per-region sources |
| **Operator telematics (pilot partner)** | Real bus/van duty cycles | The decisive dataset for buses and logistics | **Does not exist for us yet.** Biggest delivery risk |

**Major risk:** no public per-vehicle bus or freight degradation dataset was found. Mitigations: sign a pilot operator early; use passenger datasets for method development and be explicit about transfer limits; follow the Fraunhofer lab-pretrain-then-fine-tune pattern; report uncertainty, never false precision.

---

## 9. What success looks like (product-level)

- SOH estimate error against an independent reference capacity, on held-out vehicles (target set after benchmarking; literature RMSE claims like 0.36% are on specific datasets and not transferable).
- Forecast calibration: stated 80% intervals contain the outcome ~80% of the time.
- Decision value: replacement-timing and charging-policy recommendations evaluated against what actually happened (backtest) before any savings claim.
- Operator outcomes: availability %, penalties avoided, cost per km, peak kW, with a before/after baseline from the pilot.

---

## 10. Open questions for the next research phase

1. ~~Confirm geography and segment priority~~ Decided: Indian city e-bus as a category, reference archetype in section 0.1, no named client. Remaining: verify the archetype with primary sources (CESL/state tenders, OEM data sheets, Ministry of Heavy Industries / CESL fleet data) and confirm the chemistry split.
2. Real bus pack prices and warranty terms (kWh, chemistry, SOH floor, km/years); who bears replacement under GCC contracts.
3. Identify a pilot operator or any open bus telematics source.
4. Open the full text of the Nat. Commun. 2025 paper, Fraunhofer bus papers and the Geotab methodology (is %/yr points or relative?).
5. Verify NASA/CALCE/Oxford/Battery Archive availability and licences; check their relevance beyond pretraining.
6. Proper competitor review (TWAICE, ACCURE, Volytica, Aviloo, Geotab): features, pricing, bus coverage, accuracy evidence.
7. Climate factors for the target region (heat, humidity, monsoon; the cold-weather data here is mostly North American/European).
8. Regulatory review: India battery rules, EU passport access rights, data-ownership between OEM and operator.

---

## References

**Tier A (abstract-level check; read full texts next)**
- Severson et al. 2019, *Nature Energy* 4, 383-391. https://doi.org/10.1038/s41560-019-0356-8
- Attia et al. 2020, *Nature* 578, 397-402. https://doi.org/10.1038/s41586-020-1994-5
- He et al., EVBattery, arXiv:2201.12358. https://arxiv.org/abs/2201.12358
- Park et al., Battery health reporting fails independent validation across manufacturers, arXiv:2603.21592 (preprint). https://arxiv.org/abs/2603.21592

**Tier B (secondary / not opened in full)**
- Geotab, EV battery health study, press release Jan 2026. https://www.geotab.com/press-release/ev-battery-health-degradation-fast-charging-study
- Liu et al. 2025, *Nature Communications* 16, DOI 10.1038/s41467-025-56485-7 (abstract records only).
- RVD dataset, IEEE DataPort. https://doi.org/10.21227/jyrv-2179
- Recurrent winter range study via Automotive Fleet. https://www.automotive-fleet.com/10250911/which-evs-perform-best-in-winter-new-data-shows-clear-winners
- Geotab 2024 study via Green Car Reports. https://www.greencarreports.com/news/1144490_study-never-mind-degradation-batteries-will-outlast-evs-in-most-cases
- BloombergNEF 2025 battery price survey. https://about.bnef.com/insights/clean-energy/lithium-ion-battery-pack-prices-fall-to-108-per-kilowatt-hour
- DT Next, MTC penalties on EV bus operator. https://www.dtnext.in/news/chennai/breakdowns-mount-as-mtc-fines-ev-bus-operator-rs-95-crore
- WRI India, payment security mechanism. https://wri-india.org/perspectives/exploring-payment-security-mechanism-e-bus-expansion
- Autocar Pro, payment security and London model. https://www.autocarpro.in/news/payment-security-mechanism-stalls-e-bus-rollout-can-londons-model-pave-the-way-121333
- NREL/FTA battery electric bus evaluations. https://www.nrel.gov/docs/fy22osti/83038.pdf and https://www.nrel.gov/docs/fy21osti/80022.pdf
- Fraunhofer IVI fleet SOH from field data. https://publica.fraunhofer.de/handle/publica/442699
- EVAI fleet survey via Automotive Fleet. https://www.automotive-fleet.com/news/fleet-managers-cite-data-as-major-hurdle-in-ev-transition-evai-survey-shows
- Fleet World, second life and residual value. https://fleetworld.co.uk/second-life-for-ev-batteries-could-help-solve-residual-value-challenges
- Electrek on Geotab 2024 extrapolation caveat. https://electrek.co/2024/09/19/electric-car-will-fall-apart-before-its-battery-pack-does-study-finds

**Tier C (vendor claims)**
- Zenobē, electric bus battery degradation. https://www.zenobe.com/insights-and-guides/electric-bus-battery-degradation-what-causes-battery-degradation-and-how-to-manage-it/
- TWAICE fleet operators. https://www.twaice.com/industries/e-mobility/fleet-operator
- Generational / Aviloo certification claims (via trade press), Connected Energy second-life claims.

**Excluded as unreliable:** several SEO/aggregator pages (e.g. bottegadelsarto, startmotionmedia, techautogame, chargecostlab, ifactoryapp, heavyvehicleinspection case study, ev.care, alibaba Q&A) and the Tata "efficiency drop" news item (driver observations, not battery measurements).
