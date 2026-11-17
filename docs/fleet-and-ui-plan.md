# Fleet handling and UI uplift — plan

Status: phases 0–4 merged to main (phase 0 is `docs/fleet-research.md`); phase 5 merged; phase 6 merged; phase 7 built (branch `fleet-production-finish`). Written 11 November 2026; revised the same day to add input methods, categorisation and integration rules (§2.2–2.4), then the research findings (§1, §8).

Everything below keeps the project's standing rules: real free data only, every output labelled
"not yet validated on buses", vendor data only calibrates, BMS state of health is never ground truth.
No invented numbers; a sample fleet is labelled synthetic.

---

## 1. Where the product stands today

The tool models **one bus**. Fleet appears in exactly one place: `FleetPlan.tsx`, where the operator
types a fleet size and the single-bus crossing distribution is scaled to N identical, independent,
brand-new buses (`lib/planner.ts`). That is honest arithmetic but it is not a fleet, because it
assumes every bus is the same age, on the same route, in the same depot, bought on the same day.

A real city operator has none of that. A city fleet is mixed: more than one bus length, several
depots, routes of different lengths, and packs bought across several tenders and so of different
ages. The three questions a depot general manager actually has are:

1. **How much do I put in next year's budget, and the year after?**
2. **Which buses do I act on first?**
3. **Which route or depot is eating packs faster than the rest, and why?**

None of these can be answered by one bus times N.

**Research check (phase 0, `docs/fleet-research.md`).** The user is a *fleet operator or transport undertaking*, not a city
department: under a Gross Cost Contract the operator carries pack replacement and the city pays a rate per km, while under
outright purchase the undertaking carries it once the OEM battery warranty (5 years in the 2019 model RfP) ends. Questions 1
and 2 hold for both. Question 3 does not hold as worded, because "loses money" needs a contract rate that the tool does not
have and that I could not verify; the tool can rank routes and depots by cost per km and by pack spend. The PM-eBus Sewa
guideline text itself could not be read (HTTP 403), so contract terms after 2019 are unverified.

---

## 2. The data model

### 2.1 Bus, duty class, fleet

```ts
type Source = 'log' | 'entered' | 'inherited' | 'assumed' | 'sample'   // where a field's value came from
type Bus = {
  id: string              // "B-104", the operator's own fleet number
  depot: string           // "Depot A", or "Unassigned"
  route: string           // "Route 3", or "Unassigned"
  inServiceMonth?: string // "2023-07"; missing = age unknown, flagged
  classId: string         // which duty class this bus runs
  packPriceInr?: number   // if this pack's price is known
  reportedSohPct?: number // display only, never used by the model
  sources: Partial<Record<'duty' | 'age' | 'price' | 'depot' | 'route', Source>>
}
type DutyClass = { id: string; name: string; scenario: Scenario; source: Source }
type Fleet = { id: string; name: string; classes: DutyClass[]; buses: Bus[]; createdAt: string }
// Segments (risk band, batch, flags, group-by views) are NOT stored: derived from Fleet + results.
```

**The duty class is the load-bearing idea.** A `Scenario` is a description of how a bus is driven,
not of a bus. Twenty buses on the same route with the same charging habit share one scenario, so
they share one model run. The fleet's compute cost is the number of **distinct duty classes**, not
the number of buses. A 300-bus fleet in a real depot has maybe 8 to 20 duty classes.

This is what makes the whole feature affordable, and it also matches how the operator's data
actually arrives: route sheets and depot rosters, not 300 individual configurations.

### 2.2 Input methods

**Principle: every method produces the same thing, a list of draft buses, and goes through one gate:
draft → validate → group → preview → commit.** Nothing enters the fleet until the user confirms the
preview, and the last commit can be undone. One gate means one set of rules, one error format and one
place to test, however many doors there are.

| # | Method | For whom | What it is |
|---|---|---|---|
| 1 | **Sample fleet** | A judge, a first look | A generated synthetic fleet (60 buses, 3 depots, 5 duty classes, in-service dates spread over 2021–2026) built from the archetype presets, in the spirit of `make_sample_duty_csv.py`. Labelled "Sample fleet — synthetic, for demonstration". One click. |
| 2 | **Roster CSV** | An operator with a fleet register | One row per bus: `bus_id`, `in_service` (YYYY-MM), `depot`, `route`, `bus_type`, and optionally the duty fields (`km_per_day`, `charge_start`, `departure`, `soc_max_pct`, `soc_min_pct`, `kwh_per_km`, `charge_power_kw`, `operating_days_per_year`, `heat_rise_c`), `zone`, `pack_kwh`, `battery_cost_per_kwh_inr`, `pack_price_inr`, `reported_soh_pct` (as built; see "As built in phase 4"). |
| 3 | **Duty-log CSV** | An operator with telematics or charging logs | One row per bus per day, the existing duty-log columns plus `bus_id`, `depot`, `route`, `in_service`. Duty is derived per bus by the existing `deriveFromCsv` rules (average km, circular-mean charge start, median cap, 5th-percentile arrival level). |
| 4 | **Paste from a spreadsheet** | Someone with an Excel sheet and no export step | A text box that takes a copied range (tab or comma separated, header row) and runs the same parser as 2 and 3. |
| 5 | **Add buses form** | A small fleet, or adding one purchase tender's worth | A *batch* builder, not a one-at-a-time form: count (1–500), id prefix and start number ("B-" from 201), depot, route, bus type, in-service month, and duty taken from **the bus on screen**, **an existing class**, or **entered now**. Forty identical buses is one form fill; one bus is count 1. Duplicate ids are caught before commit. |
| 6 | **Edit in the roster** | Anyone, after the first load | Cells edit in place. Select rows and "Set depot / route / in-service / duty for N buses". A duty change re-classes the bus and re-runs only the classes it touched. |
| 7 | **From the bus on screen** | Someone who has been using the single-bus tool | "Add this scenario to a fleet as a duty class", then give it a bus count, depot and in-service month. |
| 8 | **Fleet file (JSON)** | Sharing with a colleague, or a backup | Export and import the whole fleet, ids and classes included. |

Methods 2 and 3 are told apart automatically (a `date` column with repeating `bus_id` is a log, one row
per `bus_id` is a roster). Each has a downloadable template. The shape of the file is shown back to the
user in the preview, never guessed silently.

**What happens when data is missing.** The rule is the project's: say what was assumed, never fill a
gap silently, and never reject a whole file for one bad row.

| Missing | What happens | Shown as |
|---|---|---|
| `in_service` | The bus is counted as new today, which pushes its replacement later than it may be. It is kept out of the "past median life" flag and drawn **hatched and separate** in the budget chart so it cannot pass as known. | "Age unknown" flag and a count in the preview |
| Duty fields | Inherited from the other buses on the same route (median), else from the bus on screen. | Source tag "inherited" or "assumed" |
| `bus_type` | Taken from the scenario on screen. | "assumed" |
| `depot`, `route` | Grouped as "Unassigned". | Group label |
| `pack_price_inr` | The scenario's battery price. | "assumed" |
| A row that fails validation | Rejected with its row number and the reason, using the same `validateScenario` bounds as the single-bus form. Good rows still import. | "Download rejected rows" |

Every field of every bus carries a **source tag**: *from log* (derived from the file), *entered*,
*inherited*, *assumed* or *sample*. This is the same idea as the evidence badges already used on the
scenario form, applied to data origin.

**`reported_soh_pct` is display-only.** If a roster carries a BMS or operator-reported health, it is
shown beside the model's prediction for that bus's age as "Reported — not used by the model", and flagged
when it falls outside the model's own 10th–90th range ("worth a physical check"). It never feeds a
forecast and never overrides one. BMS state of health stays "not ground truth" exactly as the project
already says; this only gives the operator a place to see the two side by side.

**Limits.** 5000 buses and 50 duty classes per fleet (matching the API cap, §4.2). Duty logs up to 200 000
rows / 20 MB (a year of daily logs for 300 buses is about 110 000 rows, against `MAX_ROWS` 5000 today),
parsed in a web worker so the page does not freeze.

**Privacy is unchanged.** Raw logs are parsed in the browser and never leave it. Only derived duty-class
scenarios and bus ages go to the API. The fleet is stored in the browser (guarded, like `useFleetSize`)
and shared by JSON file. The URL carries the fleet id, grouping and selected bus, not the fleet.

### 2.3 Categorising buses: two kinds, kept apart

The categorisation you suggested is the right instinct, and it needs two different things that must not
be confused.

**Kind A — duty classes. Compute grouping, mostly invisible.** Buses whose ageing-relevant inputs fall in the
same grid cell share one model run, and every other scenario field must match exactly. (A grid, not a
distance: two buses a hair apart can fall either side of a cell edge and become two classes. Forecasts stay
correct; there are just more classes.) The tolerances
are **measured, not chosen** (`scripts/measure_fleet_tolerance.py`, results in
`frontend/src/lib/fleetTolerance.json`): for each duty input, the largest change in battery life per unit of
that input over 43 base buses (all eight presets, plus 35 of 40 random buses across realistic duty; 5 random buses were
dropped because their life is beyond the 20-year horizon, which would understate a slope), and the class
step is set so one step moves life by at most 1 month in the worst case measured. Worst-case slopes, in
months of life per unit (the worse of the 10th and 50th percentile), and the step that follows:

| Input | Worst slope | Typical | Class step |
|---|---|---|---|
| km per day | 1.45 | 0.36 | 0.5 km |
| kWh per km | 297 | 46 | 0.002 |
| operating days per year | 0.56 | 0.17 | 1 day |
| charge cap (% SOC) | 4.8 | 1.5 | 0.2 points |
| minimum charge (% SOC) | 2.7 | 0 | 0.2 points |
| charge start (h) | 2.8 | 1.3 | 0.2 h |
| departure (h) | 3.1 | 1.7 | 0.2 h |
| charger power (kW) | 0.13 | 0.02 | 5 kW |
| pack heat rise (°C) | 11.3 | 6.6 | 0.05 °C |

The first guesses in this plan (10 km a day, 5 points of charge cap) were far too coarse: one 10 km step can
move life by up to 14 months. The model is sensitive to duty, so real logs, whose averages are continuous,
will often produce more than 50 classes. When they do, the step is widened 2×, 4×, 8× and **the widening is
reported**; past 8× the import is refused with a reason.

Rules that keep this honest:

- The class scenario is the **median of its members**, or the nearest real member when the medians do not
  form a valid scenario together.
- Each class stores a **spread**: an estimate (sum of |difference| × worst slope) of how far apart in life any
  member and the class can be. It assumes every difference pushes the same way and is checked against the engine
  on sampled buses at 1× and at 8× the class step (`tests/test_fleet_tolerance.py`): the real change never
  exceeded it. The largest real/bound ratio was 0.97 at 1× (little headroom, so read it as an estimate, not a
  guarantee) and 0.31 at 8×.
- The stored slopes are re-checked against the engine at the preset buses, so they cannot go stale silently.
- The user can merge or split classes in the preview (phase 4).

**Kind B — segments. Analysis grouping, the part the operator sees.** These are *views*, pure functions
of the roster and the results, **never stored**. Editing a bus therefore cannot leave a stale category
behind. One "Group by" control on the roster and Fleet page offers:

| Group by | Known from | Available |
|---|---|---|
| Depot, route, bus type, in-service year, duty class | The roster | Instantly |
| **Risk band** | Model result, conditional on age | As each class finishes |
| **Replacement batch** | Model result, conditional on age | As each class finishes |
| **Flags** | Roster and model result | As each class finishes |

- **Risk band.** By median months to the replacement line, given the bus's age: *past the model's median
  life* · *within 12 months* · *1 to 3 years* · *3 to 5 years* · *more than 5 years* · *beyond the 20-year
  horizon* · *age unknown*. Cut-offs (12, 36, 60 months) are readable defaults for a pack that lasts about 12
  years in the model, adjustable, and not taken from any source. This answers "which buses are close to the line".
- **Replacement batch.** Your "pair them together" idea: the buses of one **depot and one bus type that sit in the
  same risk band**, a purchase unit of buses at a similar distance from the line (*"Depot A · 12 m · 1 to 3
  years: 3 buses"*). Spend and its range for a batch come from running the same endpoint on just its buses.
  **Design change found while building phase 3:** the first rule here was "same financial-year half of the median
  crossing". On the sample fleet it gave 39 batches for 60 buses, and every bus's 10th-percentile crossing fell
  before its own window, because the model's spread for one bus is years wide (about 8 to 17 years for the
  default 12 m bus) and a half-year window is false precision. Bands are the resolution the model can support.
- **Same-route groups.** Buses on one route share demand, so the lever ranking (§5.2d) runs per route and
  reads as a decision that applies to the whole route.
- **Flags.** *Age unknown*; *past median life*; *outside the lab data range* (the engine already returns
  `extrapolation_reasons`); *reported health outside the model's range*; *one model only* (the
  divide-by-zero guard in §3.1).

**Why rules and not a clustering algorithm.** Clustering two or three variables adds nothing over
bucketing, and it makes groups that cannot say why a bus is in them and can change between runs. Every
group above states its rule. The machine learning in this project is in the statistics (conditioning,
the model mixture, the convolution), not in the grouping, and a group that cannot be explained to a
depot manager is not useful to one.

**A group only appears if it has an action attached.** A batch leads to a tender or a depot slot, a
route to a shared charging decision, a flag to "go and look". Groups with no action are not shown. The
default view is grouped by depot, with the risk-band counts as a row of chips above it ("6 within 12
months"), so the page opens with an answer, not a control panel.

### 2.4 Integration rules: so no existing workflow breaks

1. **Additive.** With no fleet loaded the app behaves exactly as today and every existing test passes
   untouched. A fleet adds; it removes nothing.
2. **One source of truth.** `FleetContext` holds only the roster (buses and classes). Segments, risk
   bands, batches and totals are derived by pure, memoised functions.
3. **One gate for all input methods** (draft → validate → preview → commit), with the same
   `validateScenario` bounds the single-bus form uses, and one undo.
4. **Stable bus ids.** Re-importing matches on id: the preview says *"12 new, 230 updated, 6 not in the
   file (kept)"*. It never silently deletes, and the selected bus survives a re-import.
5. **Targeted recompute.** An edit invalidates only the class chunks whose ageing key changed. A price,
   tariff or threshold edit runs zero model calls.
6. **Selection is the bridge to the existing pages.** Selecting a bus calls `ScenarioContext.replace`.
   Edits on those pages stay what-ifs until the user chooses "Apply to this class (N buses)" (§6).
7. **Progressive and honest.** A result-derived grouping shows *"7 of 11 classes done"* and is disabled
   until its inputs exist. A partial band is never labelled final.
8. **Errors never block.** Bad rows are rejected with reasons; good rows proceed.
9. **Storage.** A bus row is roughly 120 bytes, so 5000 buses is about 600 kB — an estimate, to be
   measured. If a fleet exceeds the browser's quota the app falls back to IndexedDB and always offers
   export.
10. **Invariants that tests enforce.** (a) Every method round-trips: export then import equals the
    original. (b) **Grouping never changes totals**: the segments of any grouping sum to the fleet total.
    (c) A one-bus, age-zero fleet reproduces the single-bus pages exactly. (d) Tolerance merging moves
    no class's life by more than the stated number of months.

---

## 3. The engine and statistics work

Three changes, in order of how much correctness they buy.

### 3.1 Bus age — conditional survival (the correctness gap)

The engine forecasts a **new** pack. A bus in service since July 2023 is 40 months old today, and we
already know it has not been replaced. So its chance of crossing the line in a future year is
conditional on having survived to now:

```
P(crosses in calendar year y | alive today) = ( F(a + m_y) − F(a + m_{y−1}) ) / ( 1 − F(a) )
```

where `F` is the group's cumulative crossing curve (`probability_by_month`, already returned) and
`a` is the bus's age in months. Without this divisor every number in the fleet view is wrong for any
fleet that is not brand new, and a fleet that is brand new does not need this tool.

**The assumption this hides, which must be stated on screen and in the limits list:** conditioning
on survival treats *"still in service"* as *"not yet at the replacement line"*. Operators routinely
keep running packs below 80 %. So the conditioning is a statement about the model's line, not about
the operator's actual replacement behaviour, and it will be worded that way.

Three guards:
- `a + forecast window` must fit inside the run's horizon; `horizon_years ≤ 20`, so a 2019 bus asked
  about 2040 is refused with a clear message rather than silently clipped. Simplest fix: run every
  fleet class at horizon 20, so age plus window always fits and the `_curves` cache key is the same
  for every fleet.
- **Divide-by-zero.** Conditioning is done per model (§3.2), and each model has only 25 runs, so its
  `F_m` moves in steps of 0.04. A bus older than every run of one model gives `1 − F_m(a) = 0` and
  the conditional is undefined. Guard: flag that bus, and use the other model's conditional alone
  for it, saying so in the flag.
- If `F(a) > 0.5` the bus is already past the model's median life. That is a finding, not an error:
  the bus gets a "model says this pack is already past its median life — check its actual health"
  flag. This is exactly the place where the project's "BMS SOH is not ground truth, but the operator
  should go look" stance earns its keep.

Age also turns the x axis from **bus years** into **financial years**, which is what a budget is
written in. That single change is most of the business value of the whole feature.

### 3.2 Correlated vs independent spread (the honest-statistics change)

The 50-run ensemble is 2 published NREL models × 5 degradation scalars × 5 pack penalties.
`FleetPlan` today treats all 50 as if each bus drew independently from the pool. That is wrong in a
way that **makes the budget band look narrower than it is**:

- *Which of the two NREL models is closer to the truth* is a single fact about LFP chemistry. It is
  shared by every bus in the fleet. It does not average out.
- *Pack penalty* (weakest-cell scatter) and, arguably, the degradation scalar do vary bus to bus.

So the defensible fleet answer is a **mixture over the two models, with independent per-bus draws
inside each model**:

```
P(k replacements in year y) = ½ · P_model1(k) + ½ · P_model2(k)
```

Each term is computed with independent buses; the mixture carries the shared model risk. The result
is a budget band that is bimodal or simply wider — and that is the truth, not a defect.

**The ½ weights stay fixed, and that is a deliberate choice.** Strictly, the fact that a fleet of
old buses is still running is evidence about which model is right, and the weights should become
`w_m ∝ ½ · ∏_b (1 − F_m(a_b))`. That is Bayesian updating from fleet data — it is calibration, the
API runs in prior mode only, and §9 puts calibration out of scope. So:

- Survival conditioning (§3.1) is applied **per model**, inside each term.
- The mixture weights stay at ½ each and are labelled an **assumption**, with the same evidence
  badge every other assumption in the app carries.
- Posterior reweighting of the two models from the fleet's own survival is named as the first step
  of the phase-8 calibration work, where it belongs.

Saying this out loud is better than quietly doing either one.

`RefCurves` already carries `model_of_row`, so splitting the CDF by model is a few lines in
`engine/decide/replacement.py`. The API gains `probability_by_month_by_model: {lfp250: [...],
lfpsony: [...]}` alongside the existing pooled curve. Nothing existing breaks.

**This is the strongest statistics story in the project.** It is a real, named modelling decision
with a visible consequence, and it is the kind of thing a judging panel asks about.

### 3.3 Poisson-binomial convolution (fleet counts)

With several duty classes the number of buses replaced in a year is no longer one Binomial. It is a
sum of independent Binomial(n_g, q_g,y) over groups — a Poisson-binomial.

**The group here is duty class × in-service cohort, not duty class.** Two buses on the same route
bought three years apart have the same curve but different ages, so different q_y; they cannot share
a Binomial. Cohorts are in-service dates bucketed by financial year (quarter if a fleet needs it).
To be clear about the two different units:

- **The model runs once per duty class.** Age never enters `simulate._key`, so cohorts are free.
- **The convolution runs over class × cohort cells.** A 20-class fleet spanning 6 financial years is
  at most 120 cells, and most are empty.

Exact and cheap by convolution: a DP over cells, O(cells · N) per year — microseconds for a 300-bus
fleet over 15 years. Then mix the two models' distributions with weight ½ each.

This extends `binomialQuantile` in `lib/planner.ts` rather than replacing it, and keeps the single-bus
page's existing numbers identical.

Money follows the same path: the cost distribution per year is the count distribution scaled by each
group's pack price (groups with different pack sizes get a weighted convolution on rupees).

One trap to avoid: a band on **cumulative** spend is not the sum of the yearly 10th and 90th
percentiles. If cumulative spend ever gets a band, convolve the yearly distributions; otherwise show
the cumulative line with no band and say so.

**Fleet cost per km is weighted by kilometres, not averaged.** A class running 240 km/day counts for
more than one running 140 km/day. Same for the electricity figure, which now varies by class
(different routes, possibly different tariffs).

**As built in phases 1–2 (deviations from the text above).**
- The convolution unit is **class × exact age in months × price**, not class × financial-year cohort. It is more accurate and the number of cells is bounded by the number of buses; the model still runs once per class.
- Spend is exact over distinct pack prices (rounded to ₹1000, at most 8 levels); the cumulative line has no band, as planned.
- The response carries `cohorts` (class × age), not per-bus rows, so 5000 buses stay compact; the front end maps a bus to its cohort by class and age.
- Verified against an independent Monte Carlo, not only by unit tests (see the CHANGELOG entry). Measured: 0.077 s per class; 5000 buses well under a second once classes are cached.
- Cohort months-to-line differ from the Replacement page's headline by about 2 months at the median for a new default bus (row-wise percentile versus crossing of the percentile curves); the field note says so.

---

## 4. Compute and the API

### 4.1 Measured cost

Timed today on this machine: **0.077 s per distinct duty class**, and a repeat of the same class is
0.001 s (the `_curves` LRU cache, 256 entries, keyed on the ageing-relevant fields only). Cost is
linear in distinct classes. So:

- 20 duty classes ≈ 1.5 s serial.
- 100 distinct buses with no grouping ≈ 8 s. This is why duty classes exist.

**Threads do not help — measured, not assumed.** Eight distinct classes took 0.658 s serially and
1.24 s through a 4-thread pool, a 0.53× *slow-down*: `run_model` steps month by month in Python and
holds the GIL, so threading only adds contention. The endpoint therefore runs classes **serially**
inside one `run_in_threadpool` call, and the browser gets its early answer from largest-first
chunking (§4.3), not from server-side parallelism. A process pool is the only real parallelism
available and is not worth its cost at 1.5 s.

Price, tariff and threshold changes are **free** — they do not enter the `_curves` key, so a whole
fleet can be re-priced with no model runs at all.

### 4.2 New endpoint

```
POST /api/v1/fleet
  { classes: [{ id, scenario }], buses: [{ id, classId, ageMonths, packPriceInr? }], horizonYears }
→ { perClass: [{ id, monthsP10/P50/P90, cdfByModel, costPerKm, rangeAtReplacement, warnings }],
    fleet:    { byFinancialYear: [{ year, expected, p10, p90, spendExpected, spendP10, spendP90 }],
                weightedCostPerKm, bulkWindow, flags: [...] },
    modelVersion, warnings }
```

Design notes:
- The endpoint **dedupes by `simulate._key`** before running anything, so two classes that differ
  only in price are one run.
- It reuses `run_prediction` and the existing `LRUCache` — the `_predict_cached` pattern the report
  already uses. **Raise `LRUCache(128)` to 512**, otherwise a 20-class fleet plus normal page traffic
  will thrash it.
- It returns **per-class summaries, not curves**, except the two model CDFs the fleet maths needs.
  A 20-class response is tens of kB.
- Drill-down builds the **same `PredictRequest`** the fleet call used, so opening a bus in the Health
  page is a cache hit and renders instantly.
- Request size: the body limit is 1 MB (`EV_MAX_BODY_BYTES`). Classes + bus rows for 300 buses is
  roughly 40 kB. Cap the request at 50 classes and 5000 buses with a clear 422.
- `limits.py` is a body-size middleware only — there is **no rate limiter**, so parallel chunked
  requests from the browser are safe.

Putting the aggregation in `engine/decide/fleet.py` (pure, unit-tested) rather than in the frontend
means the **PDF report and the screen share one source of truth**, exactly as the single-bus report
does today.

### 4.3 "Streaming" without streaming

No SSE, no websockets. Chunk the classes and fire them through `useQueries` (the `useLeverSweep`
pattern already in `api/hooks.ts`):

- Chunk 1 is the 5 largest classes by bus count → the headline budget figure appears in well under a
  second, marked *"5 of 11 classes"*.
- Remaining chunks fill in behind it; the numbers tighten and the "of 11" counter closes.
- Each chunk is its own cache key, so re-opening the fleet is instant and changing one class
  re-runs only that chunk.
- A progress line, never a spinner over the whole page: *"Running 11 duty classes — 7 done."*

---

## 5. What the operator sees

### 5.1 One new page, not a second app

The six existing pages are each about one bus and they are good. Duplicating them per bus would
double the surface and halve the quality. So:

**Fleet is a roster page; the existing pages are the drill-down.** The fleet page is the only place
that shows N > 1. Selecting a bus there calls `ScenarioContext.replace` and the rest of the app
becomes that bus — the pages do not change at all, they just have a name above them.

Everywhere else, the fleet shows up as **one line, not a section**:
- Cost: *"Fleet weighted cost: ₹18.40 per km across 248 buses."*
- Replacement: the existing `FleetPlan` becomes fleet-aware when a fleet is loaded, and keeps its
  current "N identical buses" behaviour when one is not.

### 5.2 The Fleet page, four blocks

All example copy below uses synthetic names, and every figure in it is a **placeholder** showing the
shape of the sentence, not a model output.

**a. Budget by financial year** — the headline. A bar per financial year with the Poisson-binomial
10th-to-90th band, stacked by depot. One sentence above it:

> Budget about **₹X crore in FY2029-30** (₹X to ₹Y crore, 10th to 90th percentile).
> Most of the fleet, 80 %, reaches the line between FY2028-29 and FY2031-32 — a bulk tender in
> that window. Not yet validated on buses.

The band is visibly wider than today's because of §3.2, and a footnote says why in one line.

**b. Replacement timeline** — rows are duty classes (not buses), columns are financial years, each
cell's fill is the expected count. Twenty rows reads fine; 300 would not, which is the whole point
of classes. Hovering a cell gives the bus ids. This replaces any temptation to draw 300 retention
curves on one chart.

**c. The roster table** — sortable, virtualised, with the "Group by" control from §2.3 (depot, route, class, risk band, batch, flags). Columns: bus id,
depot, route, in service, age, months to the line (p50), the year it lands in, cost per km, and a
flag column. Sort by "months to the line" and the answer to *"which buses do I act on first"* is the
top of the table. Keeps the existing `WithTable` pattern and its accessible markup.

**d. Where the fleet loses money** — the existing `LeverRank` run per class and ranked by
**fleet rupees**, not months:

> Moving the night charge at Depot A from 22:00 to 01:00 on Route 3 (34 buses) is worth about
> ₹N lakh a year across those buses. Not yet validated on buses.

This is the single most valuable output in the plan, because it is the only one that tells the
operator to *do* something, with a number attached, at fleet scale.

### 5.3 Clutter control

- One page, four blocks, each answering one of the three GM questions (plus the roster).
- Detail behind the existing "Show as table" toggle, not on screen by default.
- No per-bus charts. Classes aggregate; buses are rows.
- Fleet state is one context (`FleetContext`) with one selected bus; nothing else in the app grows a
  new control.

---

## 6. State: what happens when you edit a bus

Decide this explicitly or it will drift.

- Selecting a bus on the Fleet page loads its duty class into the scenario. The pagehead's Scenario
  button becomes the bus's identity: **B-104 · Depot A · Route 3 · in service Jul 2023**.
- Moving a slider on Health or Cost is a **what-if**, exactly as today. The fleet is not touched.
- A what-if gains one extra action: **"Apply to this duty class (34 buses)"**, which updates the
  class, re-runs just that chunk, and shows the fleet-level change.
- Leaving the fleet and using the app as a single-bus tool still works unchanged. The fleet is
  additive; nothing existing is removed.

---

## 7. UI uplift to production grade

The design direction (Obsidian Volt, Lexend + Manrope, floating glass nav, fit-to-screen charts) is
good and stays. What is missing is production **precision**, and most of it is exposed by adding the
fleet.

**Navigation.** Eight links will overflow the pill nav at laptop width. Regroup into three zones:
`Fleet | This bus (Overview · Health · Replacement · Range · Cost · Optimise) | Evidence`, with a
scope breadcrumb under the nav: **Fleet · 248 buses › B-104 · Depot A**. The breadcrumb is also the
bus switcher, so you can move to the next bus without going back to the roster.

**First run.** The app currently opens straight into a default 12 m bus. A proper empty state with
three doors — *Load the sample fleet* · *Import a CSV* · *Just one bus* — is both better onboarding
and a one-click demo path for a judging panel.

**Tables.** The roster is the first table in the app that needs real table behaviour: sticky header,
virtualised rows, sort, filter, column alignment on numbers, and a keyboard-navigable row focus.
Build it once as a proper component and retrofit `DataTable` onto it, rather than having two kinds
of table.

**States.** Audit every panel for the four states: loading (skeleton, not spinner), empty, error with
a retry, and partial ("7 of 11 classes"). Partial is new and the fleet needs it everywhere.

**Export.** A fleet PDF (budget table by financial year, the roster, the assumptions and limits page)
and a fleet CSV. The PDF reuses `report.py`; the limits page must state the age-conditioning, the
model mixture and the "not yet validated on buses" line.

**Density and scale.** One spacing and type scale audited across pages — the Cost and Replacement
pages drifted slightly during the recent additions. Numbers already use tabular figures; make that
universal, including in the new table.

**375 px.** The fleet page must work on a phone: the budget chart scrolls horizontally with a sticky
y axis, the timeline becomes a per-year list, the roster becomes cards. Check it, because the depot
manager will open this on a phone.

**Keyboard and motion.** A `/` command palette for "go to bus B-104" once there are hundreds of
buses; honour `prefers-reduced-motion` on the new chart transitions; keep focus-visible rings on the
new controls (the app is at 0 axe violations and should stay there).

---

## 8. Order of work

| Phase | What | Why here |
|---|---|---|
| **0** | **Sourced research pass — done** (`docs/fleet-research.md`). Two primary documents read (WRI 2024, Shakti 2019 model tenders), the rest tagged by how much was verified. Decided: no contract-rate-per-km field and no warranty flag will be added. Risk-band cuts, batch rule and CSV columns stay labelled assumptions. | The fleet page's content and the CSV columns rest on it. |
| **1** | `engine/decide/fleet.py`: age conditioning per model, per-model CDFs, Poisson-binomial convolution over class × cohort, km-weighted cost. Pure Python. A one-class, age-zero fleet reproduces today's `FleetPlan` numbers exactly. | Everything else depends on the maths being right, and it is testable with no UI. |
| **2** | `POST /api/v1/fleet`: dedupe by ageing key, serial runs, cache 128 → 512, OpenAPI regen, backend tests. | Gives the frontend something real. |
| **3** | **Fleet data layer, no input UI yet.** `FleetContext`, storage, types with source tags; the grouping engine in pure TypeScript (classes with measured tolerances, segments, risk bands, batches, flags); the sample-fleet generator. Invariants in §2.4 enforced by tests. | Categorisation is the smart feature and the riskiest logic, so it is built and tested before any screen depends on it. |
| **4** | **Input methods.** Import preview and the single gate; roster and duty-log CSV with templates; paste; the Add-buses form; inline and bulk edit; from-the-bus-on-screen; JSON export and import; missing-data rules; rejected-rows download; undo. | Data in, all through one gate. |
| **5** | **Fleet page.** Budget by financial year, class × year timeline, roster with Group by, batches, lever ranking in fleet rupees, chunked loading. | The payoff, and what gets demonstrated. |
| **6** | **Integration.** Drill-down through bus selection, breadcrumb, nav regrouping, "Apply to this class", fleet-aware `FleetPlan` and Cost line. | Makes it one app, not two. |
| **7** | **Production finish.** Fleet PDF and CSV export, 375 px pass, states audit (loading, empty, error, partial), first-run empty state, docs (CHANGELOG, model-card limits, synthetic-data attribution). | Showcase quality. |

Phases 1–2 are the defensible engineering and can be merged with no UI change, so they are a safe first
commit. Phase 3 before 4 is deliberate: the grouping rules and their invariants are settled and tested
before anyone can feed data into them.

**As built in phase 3 (data layer, no input screens).** Code in `frontend/src/lib/fleet/` and
`frontend/src/state/FleetContext.tsx`; 33 new tests (30 in the front end, 3 in `tests/test_fleet_tolerance.py`).

- `classes.ts` builds duty classes from draft buses with the measured tolerances above; `segments.ts` holds
  the groupings, risk bands, batches and flags as pure functions; `io.ts` is the strict fleet-file parser and
  the API request builder; `sample.ts` is the synthetic fleet; `storage.ts` and `FleetContext` hold the roster.
- **Storage.** The fleet is kept in this browser's local storage, validated on load like an imported file. If
  it is over about 3.5 MB or storage is blocked it keeps working in memory and reports `too_big` or `blocked`
  so the screen can offer an export. **Deviation:** no IndexedDB fallback was built; the plan's estimate of
  about 600 kB for 5000 buses leaves room, and an export is the safety net.
- **Sample fleet:** 60 buses, 5 routes, 3 depots, 5 classes, in service 6 to 107 months ago (deliberately wide so the
  grouping has something to show). Counted with the real code on a real engine response: **4 buses in 1 to 3 years,
  10 in 3 to 5 years, 46 in more than 5 years** (median months to the line), forming 10 batches of 24, 9, 9, 4, 3, 3, 3,
  3, 1 and 1 buses. That is the model's answer, not something tuned.
- **Risk bands** were re-cut from 12/24/36 to 12/36/60 months after the first run showed that a ≤9-year-old fleet
  with a ~12-year median life would put every bus in "more than 36 months".
- Also fixed on review: the scenario's `horizon_years` no longer splits classes (the server overrides it to 20), and the
  fleet request is memoised in `useFleetForecast`.
- **Not built yet:** the "reported health outside the model's range" flag. The `/fleet` response carries no
  retention-by-age, so it needs an API addition; `reportedSohPct` is stored and exported but nothing reads it.
- Invariants enforced by tests: every method round-trips; every grouping except flags is a partition whose
  sizes and "due in 12 months" sum to the fleet totals; a one-bus fleet keeps its scenario exactly; a class
  spread bounds every member; a real engine response is found for every bus.

**As built in phase 4 (input methods).** A new `/fleet` page, `frontend/src/pages/Fleet.tsx`, with `components/fleet/` (`AddBuses`, `FleetGate`, `RosterTable`) over pure code in `lib/fleet/roster.ts` (31 tests) and `lib/fleet/intake.ts`; 10 page tests including accessibility scans.

- **One gate.** Every method returns an `Intake` (drafts, rejected rows, what was assumed) and the gate (`mergeFleet`) builds the resulting fleet without touching the current one: new / updated / kept counts, class count before and after, any widening of the grid, rejected rows with reasons and a download. Confirming replaces the fleet through `FleetContext.setFleet`, so the existing one-level undo covers every method.
- **Methods built:** sample, roster CSV, duty-log CSV (parsed in a worker above 200 000 characters), paste, add-buses form, JSON fleet file, in-place edit (depot, route, in-service month), bulk edit (those three and duty), roster CSV export, JSON export. Templates for roster and log are generated in code.
- **Rules as built.** Re-import matches on bus id: new buses are added, buses in the file are updated, buses not in the file are kept. A blank or absent field never erases a value; a file that says nothing about duty keeps the bus's duty (unless it moves the bus to the other bus type). A bus type column alone is not duty. Duty a roster row omits is the median of the other buses on its route and type, else the bus on screen. A real import replaces the sample fleet instead of mixing into it. When old and new classes together exceed 50, everything is re-classed from the class scenarios, carrying each old spread forward (a spread is never reduced). A bus too old for the forecast is rejected at the server's exact boundary: the window is whole financial years starting with the rest of the current one, so the oldest bus the forecast takes is 240 minus the window's length, which depends on the month (115 months in November, 109 in May, 120 in April; the full table is in `tests/test_api_fleet.py::MAX_AGE_BY_MONTH` and `roster.test.ts` keeps a copy, and the server is tested at each boundary). A future month is rejected. The client's clock and the server's `as_of` can differ at a month boundary; phase 5 should send `as_of` explicitly.
- **Deviations from the plan above.** (1) "From the bus on screen" is the form's default duty source, not a separate action. (2) Merging or splitting classes in the preview is not built; the preview shows the class count and the widening instead. (3) A duty-log row gets no inheritance (the log is the duty); a log bus missing depot/route is "Unassigned". (4) The roster table pages 100 rows at a time with a text filter; sorting, grouping and virtualisation are phase 5. (5) Selecting a bus does not yet load it into the scenario (phase 6).
- **Round trips.** The fleet file is the full backup. The roster CSV is a register: it carries bus id, month, depot, route, bus type, climate zone, pack size, battery price per kWh, the duty columns (including heat rise), per-bus pack price and reported health. Replacement threshold, electricity tariff, charger efficiency and the weakest-cell range are not columns: they come from the bus on screen on import (tested, and the page says so). Invariant 10a therefore holds for the fleet file, and for the roster CSV over the columns it has. A roster that names only some columns changes only those fields of a bus already in the fleet.
- **Measured.** Reading a duty log of 300 buses × 365 days (109 500 rows, 8.1 MB) takes about 0.4 s on the main thread in Node, and 300 buses became 7 classes. In the browser a 316 000-character log (12 buses) went through the worker (one worker started) and showed the preview in about 50 ms.
- **Not built / noted for later:** the forecast blocks, the roster's Group by, the "reported health outside the model's range" flag; the roster does not show `reported_soh_pct` at all yet (it is stored and exported; show it beside the model's range in phase 5); the "Your fleet was changed" undo strip stays until the next action (it could expire).

**As built in phase 5 (the Fleet page forecast blocks).** New blocks on `/fleet` above the roster, over pure code in `lib/fleet/forecast.ts` (15 tests) with `components/fleet/{BudgetBlock,TimelineBlock,MoneyBlock,FleetLevers,useFleetBlocks}`; the roster (`RosterTable`) now reads the forecast. 11 page tests (one runs two accessibility scans) and one backend test.

- **Requests.** One day (`as_of`) is fixed per page visit and sent with every call, so the financial-year columns of every response line up. The whole fleet goes first (headline, band, every roster figure). Then, one after another, each duty class (the timeline), each depot (the stack) and the buses of unknown age as one more subset. Same query keys as the whole-fleet call, so a subset that is the whole fleet is a cache hit. Measured on the real engine (11 classes, 200 buses): the whole fleet cold 1.23 s, then the 11 class calls 0.11 s in all (0.011 s at most) and four subsets 0.15 s, because the ageing curves are cached; so the page shows its headline first and the rest follows within about a third of a second, and "k of n duty classes done" is mostly a courtesy.
- **Why a stack by subsets is allowed.** Expected buses and expected spend add exactly across subsets of independent buses, so per-depot series stack to the fleet total, and "Other depots" is the total minus the five largest shown. `tests/test_api_fleet.py::test_expected_counts_and_spend_add_up_across_subsets_but_the_band_does_not` checks this on the real engine (to 1e-9) and checks that the 90th percentiles do not add up. The 10th to 90th percentile whiskers are therefore drawn on the whole-fleet total only, and the page says so. A running total has no band, so it is in the table (marked "no band") and not drawn.
- **Headline.** "Budget about ₹X in FY…" is for the first *full* financial year (index 1). The first period is only the rest of the current year (5 months in November); it is labelled so, and when it is the biggest year that is said in a second line. A zero 10th percentile is written "up to ₹Y at the 90th percentile", never "₹0 to ₹Y". Without a battery price the sentence counts buses and says how to see rupees.
- **Buses of unknown age** are drawn hatched and kept apart in the stack (as §2.2 promised) and the note says they are counted as new, which pushes their replacement later than it may be. The depot split covers buses of known age.
- **Timeline.** Rows are duty classes, columns financial years, cells expected buses; it is a real table (the numbers are the accessible version), with a "Later" column for buses past the forecast. It replaces drawing a curve per bus.
- **Roster.** New columns: months to the line (median; the 10th to 90th percentile is in the cell's tooltip), the financial year it lands in, cost per km (the duty class's figure, labelled "Battery cost per km" when no class has an electricity tariff), and the forecast flags. Sort by bus, months to the line or cost per km (missing values last in both directions; a bus already past the median life sorts first in ascending order, so "which buses first" is one click). A risk-band chip row above the table filters it; the counts are a partition of the fleet. **Group by** (the eight groupings of `segments.ts`, or none) shows collapsed group rows with the count, the expected buses reaching the line in 12 months and the earliest median; opening one shows its buses, 50 at a time. The flat list keeps its 100-row chunks. Controls are real buttons with `aria-sort`/`aria-expanded`. Which grouping was chosen is remembered in this browser; whether grouping is on is not (a revisit starts flat).
- **"Where the battery money goes"** (not "where the fleet loses money": §6 of `fleet-research.md` decided the tool cannot know a margin). Depots, routes, duty classes or bus types ranked by pack price spread over life, per year (the class's battery cost per km at the median times its km a year, per bus), with ₹ per km. It is a cost, not a margin, and says so.
- **"What to do first, in rupees."** The lever steps of the single-bus page, tried one at a time for the five largest duty classes, ranked by per-bus rupee saving times the buses in the class; the page says how many buses those classes cover. 5 base predictions plus up to 15 lever predictions, asked one after another once the timeline is done. Pack price spread over its life: undiscounted, first pack only, rows of one class do not add up. The cooling lever carries "needs your cooling system".
- **Why the budget band is wide.** `spend_p10`/`spend_p90` are quantiles of the 50/50 mixture of the two models, each of which puts the whole fleet on its own ageing curve (the sample's first full year: about 2.4 packs expected, none at the 10th percentile, about 6 at the 90th). The note says the spread is mostly the models disagreeing, not a fleet this size scattering.
- **Measured at the limits.** 5000 buses in 50 classes: building the 55 subset requests takes 10 ms, their JSON 0.5 MB (stringify under 1 ms, parse 2 ms), the roster rows 2 ms, and five groupings with the money ranking 12 ms, so the page does not stall at the cap. Identical subset requests (a depot that is one class) are asked once.
- **Honest wording** on every block: the figures are about the model's line (80 % of a new pack), not how the buses are driven or what their health reports say; the two published models are mixed 50/50 by assumption; not yet validated on buses.
- **Found on the way.** The page was in the main bundle (137 kB gzipped); it is now lazy-loaded and the main bundle is 92.7 kB again, under the 100 kB the build comment promises. The account menu had `role="menu"` without menu items (an axe failure when opened); the role is removed. Two new class names collided with existing ones (`.tl` and `.grp`); renamed.
- **Deviations / not built.** (1) `reported_soh_pct` is still not shown beside the model's range and there is no "worth a physical check" flag: the fleet response carries months to the line, not a retention band at each age, so it cannot be compared without a new field on the API. (2) The lever ranking covers only the five largest classes. (3) Batches (depot × bus type × risk band) are a Group by option, not a separate block. (4) The budget chart is hard to read at 375 px (the chart scales; its table is the phone-width reading); the roster and other blocks scroll or stack. (5) Cost per km is a class figure repeated for every bus of the class.

**As built in phase 6 (integration).** `state/scope.ts`, `components/ScopeBar.tsx`, `components/fleet/useOpenBus.ts`; 6 page tests including an accessibility scan.

- **Open a bus.** Each roster row has an "Open" button: the bus's duty class becomes the scenario on screen, any "try a change" is cleared (it belonged to the last bus), the bus becomes the scope, and the app goes to Health.
- **Scope bar** under the nav on every page except Fleet, only while a bus is opened: "Fleet · 60 buses › B-104 · Depot A · Route 3 · in service Jul 2023", previous/next and (up to 300 buses) a select as the bus switcher, and "Leave the fleet". With no fleet or no opened bus nothing changes anywhere.
- **Apply to this duty class (N buses).** Shown when the scenario on screen, with any what-if on top, differs from the class's own scenario, whether the change came from a slider or from the Scenario panel. It sets that duty on every bus of the class through the same `editBuses` the roster uses (so the same validation and re-classing); each bus keeps its depot, route and month. It is one fleet change, so the Fleet page's undo strip covers it. Until applied, a change is a what-if only.
- **Fleet-aware counts.** With a bus opened, the money lines (Try a change, Optimise, the report) and the Replacement page's plan speak for the buses in that duty class; the plan's count box is read-only and says so. With no opened bus the editable remembered count is unchanged.
- **Navigation zones.** Fleet | Overview, Health, Replacement, Range, Cost, Optimise | Evidence, with dividers. At 1024 px all eight links fit, so no menu was needed.
- **Not built.** The scope bar does not show the fleet-level change after applying (the toast points to the Fleet page); no "/" command palette; "From the bus on screen" stays the Add-buses form's default source; the Cost page's own cost line is not fleet-scaled beyond the shared money lines.

## 9. Deliberately out of scope

- Per-bus BMS health readings and calibration from fleet data. The API is prior-only and calibrated
  mode is not wired in; this is the natural phase 8 but it is a project of its own.
- Charger counts, depot scheduling optimisation and grid-peak constraints. The model has no charger
  queue.
- Route-level simulation (gradient, passenger load, stop spacing). We have no free data for it.
- Discounting, NPV and second packs. Still deliberately absent, as in the single-bus cost page.
- Any claim of validation. Every fleet number carries "not yet validated on buses", same as today.

**As built in phase 7 (production finish).** `POST /api/v1/report/fleet-pdf` (`backend/app/fleet_report.py`, reusing `report.py` and the `/fleet` cache): budget by financial year with a running total marked as having no band, duty classes, cohorts (capped at 40 rows) and an Assumptions and limits page. In the browser: Fleet report (PDF), Forecast CSV and Budget CSV (`lib/fleet/exports.ts`, formula-safe), and a first-run card with three doors (Load the sample fleet, Import a CSV, Just one bus). At 375 px the budget chart keeps a 560 px width and scrolls sideways and the class by year grid becomes one card per class. Not built, by choice: a sticky y axis on the scrolling chart, roster cards (the roster scrolls sideways), a command palette. Tests: 3 exporter tests, 6 backend fleet-PDF assertions in `tests/test_api_fleet.py`, first-run page test.
