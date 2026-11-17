# Fleet research pass (phase 0)

Written 11 November 2026. Purpose: decide from public material which of the three manager questions in
`docs/fleet-and-ui-plan.md` §1 are real, who the stakeholder is, and which features and CSV columns rest on how
Indian e-bus fleets are actually contracted and run.

Every claim below carries one of four tags, and a claim without a primary source is never promoted:

- **Read** — I extracted and read the text of the document myself (URL given).
- **Read by agent** — a fetch agent read the page and reported it; I did not re-read it.
- **Search summary** — appeared only in a search-engine summary or a headline; the document was not opened. Treat as a lead, not a fact.
- **Assumption** — no source found. Labelled as such wherever it is used in the product.

## 1. What I could and could not read

| Document | Result |
|---|---|
| WRI India working paper, *Real-world electric bus operation: trend in technology, performance, degradation, and lifespan of batteries* (Jan 2024). Cited below as **[WRI]**. PDF: <https://wri-india.org/sites/default/files/Real-world%20Electric%20Bus%20Operation_Working%20Paper%20final%20_revised.pdf>; page: <https://wri-india.org/research/real-world-electric-bus-operation-trend-technology-performance-degradation-and-lifespan> | **Read** (PDF text extracted) |
| Shakti Foundation, *Procurement mechanisms to scale up adoption of e-buses in Indian cities*, Final Report Vol. II (Aug 2019): model GCC and outright-purchase RfP toolkits and a comparison with the NITI Aayog Model Concession Agreement. Cited as **[Shakti]**, with printed page numbers. <https://shaktifoundation.in/wp-content/uploads/2020/01/Procurement-mechanisms-to-scale-up-electric-buses.pdf> | **Read** (PDF text extracted) |
| Ministry of Heavy Industries pages for the PM e-Bus Sewa Payment Security Mechanism. Cited as **[MHI]**. <https://heavyindustries.gov.in/en/pm-e-bus-sewa-payment-security-mechanism-psm-scheme> and <https://heavyindustries.gov.in/en/pm-ebus-sewa-psm-gazette-notification-and-scheme-guidelines> | **Read by agent** |
| EVreporter interview, 15 Apr 2025: <https://evreporter.com/battery-replacement-strategy-key-to-e-bus-operational-feasibility/>. Autocar Professional interview, 28 Jul 2024: <https://www.autocarpro.in/news/ebus-contacts-need-a-relook-says-switch-mobilitys-ceo-mahesh-babu-121673> | **Read by agent** |
| MoHUA *PM-eBus Sewa Guidelines Part I*: <https://mohua.gov.in/upload/uploadfiles/files/PM-eBus-Sewa-Guidelines-Part-I.pdf> | **Not read**: the site returned HTTP 403 |
| PIB Cabinet release for PM-eBus Sewa (Aug 2023) | **Not read**: HTTP 403; not located elsewhere |
| CESL tender / RfP documents | **Not found** in public search |
| UITP toolkit attachment (<https://cms.uitp.org/wp/wp-content/uploads/2020/09/Toolkit-attachment.pdf>) | **Not read**: HTTP 404 |

So the 2023-era scheme terms (rate per km, contract length, escrow depth, any state-of-health clause) are **not**
verified here. The 2019 toolkit is a model document and predates PM-eBus Sewa; real tenders may differ.

## 2. What the sources establish

### 2.1 How the operator is paid, and who carries battery risk (Read: [Shakti], 2019 model documents)

- Under a **Gross Cost Contract (GCC)** the payment is *service-km operated in the month × quoted rate per km*, with a
  **minimum assured km** (daily or annual) "to safeguard the return on investments" (Table 2, p. 17). Km beyond the assured
  amount is suggested at 0.75× the rate, and non-utilised km are reviewed half-yearly, with no withholding for shortfalls
  not caused by the operator (p. 18).
- Payment is revised for inflation (annual, CPI/WPI) and for **electricity tariff (quarterly)** (p. 18–19). A dedicated escrow
  account holds at least three months of payments in advance (p. 19; the same point is in the MCA comparison, p. 10).
- The model concession agreement "doesn't recommend any vehicle specific warranties" under GCC because the operator is
  responsible for vehicle performance, and OEMs are assumed to be part of the bidding entity (p. 10); the GCC toolkit says a
  warranty and AMC "need not be proposed by the authority" because operation and maintenance rest with the operator (p. 18).
  **Inference (mine, not stated outright): under GCC the battery replacement risk sits with the operator.** The report also
  proposes a bus refurbishment at year 5 (the bus, not the pack) (p. 18).
- Under the **outright purchase** model (Table 3, from p. 22) the transport undertaking (STU) owns and runs the buses. The
  model RfP asks the OEM for a **battery warranty of at least 5 years** (p. 23) and a battery and charger warranty of at least
  5 years with a 5-year comprehensive AMC (p. 25), after which the STU carries it. That is the inference again: the report
  does not say who pays after year 5.
- The report names the **FAME II data-sharing mandate** but says the metrics and protocol "need to be defined" (p. 29).

### 2.2 Battery facts that bear on our defaults (Read: [WRI], executive summary and key findings)

- Batteries are 40–50 % of upfront e-bus cost.
- Ideal life of a lithium-ion e-bus battery "should be 5–7 years"; **end of automotive life is 20 % capacity loss**, which is
  the 80 % replacement line the product already uses.
- LFP reaches 80 % in about 4,000 cycles at 25 °C and about 2,000 cycles at 45 °C (literature figures).
- A 26 % range loss over the automotive life is quoted (literature-based), and a 20 % cut in battery life raises TCO by 2.2 %.
- **No India pack-level degradation data is public.** The paper is built on literature and desk research and recommends
  collecting region-specific pack-level data, putting degradation cost in TCO, and fitting a BMS that records battery
  health for analysis. This supports the project's own framing: real field data is the missing input, and ours is a
  prior until calibrated.

### 2.3 Payment security and scale (Read by agent: [MHI])

The PM-eBus Sewa PSM scheme covers default by public transport authorities on **monthly payment obligations** to operators/OEMs,
with a stated budget of ₹3,435.33 crore, supporting more than 38,000 e-buses (gazette S.O. 4711(E), 28 Oct 2024).
The pages do not state the per-km rate, term, or any battery clause.

### 2.4 Trade press (Read by agent)

EVreporter (Apr 2025): cost parity with diesel is "typically around 200 km per day or more"; battery replacement planning is
called crucial, but **no timing, owner or state-of-health level is given**. Autocar Professional (Jul 2024): operators earn a
per-km fee; OEMs object to running whole networks and favour dedicated operators; payment security is a stated concern. Neither
gives warranty, state-of-health or replacement figures.

## 3. Leads that are not established (Search summary only)

Do not rely on these in the product or the report until the primary text is read.

- CESL tender specifications mentioning battery life and a lifetime warranty on battery, motor and controller: <https://www.motorindiaonline.in/range-vs-least-cost-the-electric-bus-dilemma-for-indian-urban-public-transport-authorities/> (search summary of a trade article).
- CEEW: operators are uncertain about battery life because utilisation data is scarce, and it recommends battery data sharing: <https://www.ceew.in/node/4689> (a later search did not surface the recommendation text, so unconfirmed).
- Nagpur: about 40 % efficiency drop in 3 years for one 40-bus fleet, one newspaper report: <https://www.thehitavada.com/Encyc/2026/7/7/e-bus-efficiency-drops-by-nearly-40-within-3-years.html>.
- GCC contract structure resembles availability-based concessions such as hybrid annuity (India Ratings, via a trade site): <https://emobilityplus.com/2021/06/22/electric-bus-concession-model-similar-to-ham-counterparty-risk-evaluation-critical>.

Per-km support rates for PM-eBus Sewa and an assured-utilisation example (about 200 km per day) appeared in search summaries, but I did
not retain a URL for either, so they are **not used** anywhere in the product or the docs.

## 4. What was not found

- Any contract clause with a **state-of-health threshold** for replacement or an end-of-contract SOH. I searched for 70 % and 80 % clauses; none surfaced.
- A published **₹ replacement cost** for an Indian city e-bus pack.
- An authoritative **charger-to-bus ratio** or STU depot practice.
- The **fleet-record format or telematics fields** an STU or operator actually holds. The only data requirement found is the FAME II mandate, with metrics undefined.
- Any rule for **how operators group buses for pack replacement**. Our batch and risk-band rules have no source.

## 5. What this means for the three manager questions

| Question | Verdict | Reason |
|---|---|---|
| 1. What goes in next year's budget? | **Real, with a narrower stakeholder than the plan said.** | Under GCC the operator (which can be the OEM itself, per Autocar Pro, Jul 2024) carries pack replacement, as an inference from [Shakti], and the city pays per km. Under outright purchase the STU carries it once the 5-year battery warranty ends. So the user is "fleet operator or STU", not "city transport department". Matches the earlier choice "operator as user". |
| 2. Which buses first? | **Real for both.** | The 5-year warranty window and the 80 % line are the two sourced anchors; both make "oldest and hardest-worked first" meaningful. |
| 3. Which route or depot loses money? | **Not supported as worded.** | Under GCC revenue is a contract rate per km, which the tool does not know and which I could not verify. The tool can say which route or depot has the highest **cost per km** and the earliest pack spend. "Loses money" needs a contract rate entered by the user. |

### Findings that change the plan

1. **Stakeholder wording** (plan §1): "depot general manager" becomes "fleet operator or STU". The framing does not change the maths.
2. **Contract rate is a missing input.** A per-km contract rate would turn cost per km into a margin, which is the question GCC operators actually have. It is **not** in the data model today. Proposed as an optional, user-entered, clearly labelled field (default empty; never prefilled, because no rate was verified). It needs your decision before it is built.
3. **Warranty expiry is a sourced anchor.** The only sourced battery-term number in this pass is the 5-year battery warranty in the outright-purchase RfP model. A "past 5-year warranty" flag on buses in service for 60 months or more is defensible as an optional flag, labelled "model RfP, 2019; your contract may differ". The existing risk-band cut at 60 months coincides with it; that is a coincidence, not a source.
4. **Assured km is a contract term, not just duty.** Under GCC a bus can be paid for km it does not run. The km-per-day column should be described as "planned daily km" and not as billing.
5. **Quarterly electricity-tariff revision is standard** (Shakti 2019), which supports the existing tariff-based cost per km as a fleet-level input.
6. **Risk-band cuts (12 / 36 / 60 months) and the depot × type × band batch rule remain assumptions.** They are product choices to make a list actionable, not operator practice. They stay, labelled as such in the UI and docs.
7. **CSV columns** (bus id, depot, route, bus type, in-service month, optional km/day, optional reported SOH) are standard fleet-register fields; no source constrains them. They stay, and every one beyond bus id and bus type stays optional.
8. **Charger count** stays out of scope (no source for ratios).

## 6. Decisions

Decided 11 November 2026: **neither** the optional contract-rate-per-km field **nor** the "past 5-year battery warranty" flag
will be added. The data model and the Fleet page stay as planned in `docs/fleet-and-ui-plan.md`. The cost-per-km ranking by
route and depot stays; it is not turned into a margin. Nothing in phases 4–7 has started.
