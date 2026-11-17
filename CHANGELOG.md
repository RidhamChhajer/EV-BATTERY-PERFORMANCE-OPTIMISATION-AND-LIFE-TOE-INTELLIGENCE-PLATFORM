# Changelog

Each entry is a git tag (`git show cp-x.y`). Numbers quoted here are the ones in `engine/artifacts/metrics.json` and `docs/model-card.md`.

## Sample fleet redesigned (after v1.0.0)
- Still 60 synthetic buses, 5 routes, 3 depots, but built like a real operator's: bought in delivery batches (an early pilot batch of 6 to 10 buses at 7 to 9 years, then orders 2 to 6 years and a few months old) instead of ages scattered at random, with route lengths that tell a story: one 12 m route is longer than the pack can cover with the 20 % reserve (8 buses), one slips later as packs age, the rest stay covered. Next year's budget is about ₹63 lakh and the five-year spread is visible.
- Names are realistic route numbers (Route 12, 14, 21, 33, 47). Still labelled synthetic everywhere and never used to fit a model.

## Pick a goal, outcome first (after v1.0.0)
- Each goal card leads with one big figure (battery life gained, with its 10th to 90th percentile range), one line for cost per km and range, the changes as short "label, old → new" rows, and a full-width **Try on Bus B** button. The explanation, each change's reason and what the search ruled out are behind "Why these changes".
- The route message is one line ("Range is already tight · 210 km at replacement · route needs 240 km") with the full sentence under "What this means"; the notes at the bottom fold into one line.

## Small print folded (after v1.0.0)
- The long notes under Replacement, Range, Cost and Health are now one quiet line ("About these numbers", "Limits and assumptions behind the numbers") with a count, opening on click. On Health, anything that changes what you should do stays in view; the tested-range reasons and assumptions fold away.

## Layout fix (after v1.0.0)
- Tags with the class `lab` ("published rates", "real weather") picked up a grid layout rule of the same name and stretched across the field, squeezing the label above them into a narrow column. The layout rule no longer applies to tags, and field label rows wrap instead of squeezing. No page overflows sideways at desktop or 375 px.

## Fleet cards simplified (after v1.0.0)
- **Will each bus still cover its route?** One bar per duty class, split into Short now, Short within 3 years, Short after 3 years and Covered, with one sentence on top. Click a segment to filter the roster. The curves are behind "Show the curves behind this".
- **Where the battery money goes:** quieter tiles (neutral surface, volt edge for cost per km), a segmented Rank by control, name, share and rupees on each tile.
- **What to do first:** a ranked list of the three changes, one volt bar each scaled to the fleet total, with the per-class figures under "By duty class".
- Colours stay in the theme: volt, orange, red and greys only.

## Fleet charts rethought (after v1.0.0)
- **Range cover:** a rising step chart of how many buses are short of range, year by year (with a table alternative), the legend as a filter beside it, and one small chart per duty class: the median health curve as range in km, the route's need as a line across it, and every bus as a dot at its own age. A dot under the line is short today. The axis starts below the lowest thing drawn so the gap shows, and its bottom tick says where.
- **Where the battery money goes:** a treemap. Tile area is rupees a year; shade is cost per km.
- **What to do first:** one card per kind of change with its total in rupees across the duty classes it applies to, a bar split by class, and the per-class figures under it. The same change in different classes touches different buses, so it adds up; two changes in one class still do not, so they stay on separate cards.

## Fleet range cover (after v1.0.0)
- **Will each bus still cover its route?** A card on the Fleet page: for every bus, whether a full charge (usable energy × the model's health at the bus's age ÷ energy use) covers its duty class's km per day plus the app's 20 % reserve, and from which financial year it does not. Buses are grouped as short even when new, short now, within 12 months, 1 to 3 years, 3 to 5 years, later, or covered; a duty class table shows the route need, new-pack range, buses short within 3 years and the first bus short.
- **Roster:** a sortable "Range short from" column (hover for the range today and the one-in-ten earlier year), and the legend rows and a new top tile ("Short of range within 3 years") filter it. The forecast CSV gains range columns.
- Median health decides "short"; the 10th percentile curve gives the earlier year. It uses one prediction per duty class, the same requests the lever block already makes. Air conditioning and seasonal use are not modelled. Not in the PDF yet.

## Fleet page v2: insights first (after v1.0.0)
- **Four numbers on top:** next full year's budget with its band, buses due in the next 12 months, the biggest year, and buses past the model's median. The two bus counts are buttons that filter the roster.
- **One "When" card** switches between the budget by financial year (stacked by depot) and the duty class grid, replacing two blocks and their notes.
- **How soon buses reach the line:** one stacked bar and a clickable legend (the filter) beside it, with the duty classes listed under it. One colour scale for risk across the page.
- **One "About this forecast" panel** holds the caveats (model mixture, band, undiscounted money, unknown ages, privacy). The cards keep only one-line notes.
- **Which buses first:** the roster opens on the ten nearest the line, sorted, with "Show all N". The lever ranking shows five rows.
- Phone: the four numbers scroll sideways, no horizontal page scroll at 375 px.

## Fleet page redesign (after v1.0.0)
- **First run:** one card, "Where do you want to start?": *Bring your buses* (a drop zone with Upload, Paste and Add-by-hand tabs) beside two quiet options, the sample fleet and Just one bus.
- **Loaded fleet:** one primary button (Add buses), an **Export** panel (report, forecast, budget and roster files, with what each holds, and Save fleet file) and a **⋯** panel with Remove fleet behind a confirm. The header is one line; the sample is just "Sample fleet" with its synthetic tag.
- Budget chart axis ticks are shorter (₹2.5 cr) so they fit; this also fixes labels being clipped.

## Fleet production finish (after v1.0.0)
- **Fleet report (PDF):** cover headline, battery budget by financial year, duty classes, cohorts and an Assumptions and limits page that says the figures are age-conditioned, the two models are mixed 50/50, and none of it is validated on buses yet. Depots, routes and reported health are not in it.
- **Forecast CSV** (one row per bus) and **Budget CSV** (per financial year, running total with no band), both safe to open in a spreadsheet.
- **First run:** an empty Fleet page offers three doors: Load the sample fleet, Import a CSV, Just one bus.
- **Phone width:** the budget chart scrolls sideways at a readable size and the class by year grid becomes a card per class. No horizontal page scroll at 375 px.
- Docs: model-card limits, and the sample fleet is now named in `docs/data-attribution.md` as the one synthetic item.

## Fleet and the analysis pages as one app (after v1.0.0)
- Each roster row has **Open**: that bus's duty class loads into Health, Replacement, Range, Cost and Optimise, and a **scope bar** under the nav shows "Fleet · N buses › B-104 · Depot A · Route · in service month" with previous/next and a bus switcher.
- A change made on any page stays a what-if until you choose **Apply to this duty class (N buses)**, which sets the duty of every bus in that class (depot, route and month untouched) as one undoable fleet change.
- With a bus opened, the rupee lines and the Replacement plan speak for the buses in its duty class instead of a typed number. With no fleet or no opened bus the app behaves exactly as before.
- Navigation is grouped Fleet | the six bus pages | Evidence.
- Tests: 6 page tests (284 frontend in all). Not built: a fleet-level before/after on applying, a command palette. See `docs/fleet-and-ui-plan.md`.

## Fleet forecast blocks (after v1.0.0)
- The Fleet page now forecasts. **Battery budget by financial year:** one headline sentence for the next full financial year ("Budget about ₹X crore in FY…", "up to ₹Y at the 90th percentile" when the low end is zero), expected pack spend per year stacked by depot with the 10th to 90th percentile on the whole-fleet total, buses of unknown age hatched and kept apart, and a table alternative with a running total (marked as having no band).
- **When each duty class reaches the line:** a class by financial year grid of expected buses, filled in as each class is worked out ("k of n duty classes done"). It replaces drawing a curve per bus.
- **Roster:** months to the line (median), the year it lands in, cost per km (the class's figure), flags; sort by any of them ("which buses first" is a click); risk-band chips; **Group by** depot, route, bus type, in-service year, duty class, risk band, replacement batch or flag, as collapsed rows with counts.
- **Where the battery money goes** (a cost, not a margin) ranks depots, routes, classes or bus types by pack price spread over life, with ₹ per km. **What to do first, in rupees** tries one lever at a time for the five largest classes and ranks them by what they are worth to the whole class.
- Every call for the page is worked out for the same day. Expected buses and spend add exactly across subsets (pinned by a backend test against the real engine), the percentiles do not, so the band is drawn on the total only. On the real engine the whole fleet takes 1.23 s cold (11 classes, 200 buses) and the per-class and per-depot calls after it about 0.3 s together.
- The Fleet page is now loaded on demand (the main bundle is back to 92.7 kB gzipped from 137 kB). The account menu lost an invalid `role="menu"`.
- Tests: 15 for the forecast logic, 11 page tests including accessibility scans, 1 backend test. Not built: reported health beside the model's range (the API returns no retention band per age), lever ranking beyond the five largest classes. See `docs/fleet-and-ui-plan.md`.

## Fleet page and input methods (after v1.0.0)
- New **Fleet** page (nav item between Optimise and Evidence). With no fleet loaded every other page behaves exactly as before; nothing here changes a single-bus number.
- **Ways in, all through one gate:** upload a roster CSV (one row per bus), a duty-log CSV (one row per bus per day; duty is derived per bus with the existing single-bus rules), or a saved fleet file; paste cells copied from a spreadsheet (tab, comma or semicolon); add a batch of buses by hand (1 to 500, id prefix and start number, duty from the bus on screen, an existing class, or entered now); or load the synthetic sample. Roster and log are told apart automatically (a date column with repeating bus ids is a log). Templates can be downloaded.
- **The gate:** every method produces draft buses and a preview before anything changes: new, updated and kept buses (re-imports match on bus id and never delete), the duty classes that result (and any coarser grid that was needed to stay within 50), what was assumed (including the bus type and battery price taken from the bus on screen), and the rows that were not imported with a reason each and a download. Nothing is stored until the preview is confirmed; one undo restores the previous fleet.
- **Age limit matches the server.** A bus too old for the forecast is rejected at the server's exact boundary, which depends on the month (the window is whole financial years): 115 months in November, 109 in May, 120 in April. `tests/test_api_fleet.py` checks the endpoint at each boundary and the front end keeps the same table, so a fleet that passes the gate cannot 422 the forecast on age.
- **Missing data is said, not filled silently:** no in-service month means the bus is counted as new and flagged; missing duty is taken from the other buses on the same route (same bus type), else from the bus on screen; missing depot and route are "Unassigned". A re-import that leaves a field out keeps what is there. A bus type column alone does not reset a bus's duty; moving a bus to the other type does.
- **Editing:** depot, route and in-service month edit in place; select rows to change several at once, including their duty (re-classes only those buses and carries the old class spread forward, so a spread is never understated). The fleet file is the full backup and round-trips exactly. The roster CSV is a register (id, month, depot, route, bus type, zone, pack size, battery price, duty, pack price, reported health): importing an export gives the same buses and classes, but the replacement threshold, electricity tariff, charger efficiency and cell range come from the bus on screen, and the page says so.
- Limits unchanged: 5000 buses, 50 classes; a log file can be up to 20 MB or 200 000 rows and is read off the main thread. Everything is read in the browser; only duty classes and bus ages are ever sent to the server.
- Tests: 36 for the readers and merge rules (`frontend/src/lib/fleet/roster.test.ts`), 11 for the page including accessibility scans, 12 added for the age boundary on the endpoint. Not built yet: the forecast blocks on the Fleet page (budget by year, timeline, sorted and grouped roster, lever ranking), sorting and virtualised scrolling, merging or splitting classes in the preview. See `docs/fleet-and-ui-plan.md`.

## Fleet data layer (after v1.0.0; no screens yet)
- New code, not yet shown in the app: the fleet roster and the rules for grouping it, in `frontend/src/lib/fleet/` and `state/FleetContext.tsx`. With no fleet loaded the app behaves exactly as before; the provider only reads this browser's storage.
- **Duty classes from measurement.** Buses share a model run only if every non-duty input matches exactly and each duty input is within a step. The steps come from `scripts/measure_fleet_tolerance.py`, which measures how far life moves per unit of each input over 43 base buses (all 8 presets and 35 of 40 random buses) and sets the step so one step moves life by at most 1 month in the worst case. This showed the first guess (10 km a day) was far too coarse: one such step moves life by up to 14 months. A class stores an estimate of how far apart in life its members can be; a test draws buses inside classes at 1× and 8× the step and checks the real change stays within it (largest real/bound 0.97 at 1×, so little headroom, and 0.31 at 8×). If buses need more than 50 classes the step is widened 2×, 4×, 8× and the widening is reported.
- **Segments, computed not stored:** group by depot, route, bus type, in-service year, duty class, risk band (past the model's median life, within 12 months, 1 to 3 years, 3 to 5 years, more than 5 years, beyond the horizon, age unknown), replacement batch (depot, bus type and risk band; a first rule of half-year windows around each bus's median crossing gave 39 batches for 60 buses, because the model's spread for one bus is years wide) and flags. Every grouping except flags is a partition whose sizes and "due in 12 months" add up to the fleet.
- A strict fleet file parser and exporter (round-trips), a request builder that sends only classes and bus ages (never depots, routes or reported health), a validated local-storage store with one undo, and a deterministic **synthetic** sample fleet (60 buses, 3 depots, 5 classes) labelled as such.
- Not built yet: input screens, the Fleet page, the "reported health outside the model's range" flag. See `docs/fleet-and-ui-plan.md`.

## Fleet forecast engine and `POST /api/v1/fleet` (after v1.0.0; API only, no screens yet)
- New: forecast a fleet of mixed-age, mixed-duty buses. Buses are grouped into **duty classes** (one model run each; classes that differ only in price share a run, because price is not part of the ageing-curve key). The response gives, per Indian financial year (April to March, the first period being the rest of the current one): expected buses reaching the replacement line with a 10th to 90th percentile, first-pack spend with the same band, the years in which 10 % and 90 % of the fleet are expected to have reached the line, a km-weighted cost per km, per-class summaries, and per-cohort (class and age) months to the line with a "chance due in the next 12 months" and flags.
- **Bus age matters.** A bus already in service has survived to today, so its chance in each later period is conditional: (F(a+end) − F(a+start)) ÷ (1 − F(a)). This reads "still in service" as "not yet at the model's line", which is not the same as "not replaced": operators often run packs below it. Buses with no in-service date are counted as new and flagged `age_unknown`.
- **Shared model risk.** The 50 reference runs are two published NREL models × five scalars × five pack penalties, and which model is closer is one fact for the whole fleet. The fleet is a 50/50 mixture over the two models (the weight is an assumption), with independent buses inside each. This makes the fleet band wider than treating all 50 runs as independent per bus, which is what the single-bus planner's whiskers do. Counts are an exact Poisson-binomial (convolution over class × age cells); spend is convolved exactly over distinct pack prices (rounded to ₹1000, at most 8 levels).
- Guards, each flagged: a model with no runs left at a bus's age borrows the other (`one_model_only`); a bus older than every run is due at once (`past_all_runs`); past the pooled median life (`past_median_life`). Every class runs at a 20-year horizon, so age plus the forecast window must fit inside it; if not, the request is refused (422) with the number of years that would fit.
- Checked: a new one-class fleet reproduces the single-bus `probability_by_month` to 1e-12; splitting a fleet by class sums back to the whole; Poisson-binomial and spend equal brute-force enumeration; an independent Monte Carlo (mixed ages, two classes) matches expected counts and the 10th and 90th percentiles. Measured: 0.077 s per distinct class; 5000 buses in under a second once the classes are cached. Threads do not help (the ageing loop holds the GIL; 4 threads were 0.53× as fast), so classes run serially.
- Limits: 50 classes and 5000 buses per request; the response cache grows from 128 to 512 entries. Per-cohort months to the line are percentiles of the model's runs conditional on age, so for a new pack they differ slightly from the Replacement page's headline (that is the crossing of the percentile curves; about 2 months at the 50th percentile for the default bus). Not modelled: a second pack, discounting, charger or depot limits, duty variation inside a class. Not yet validated on buses.
- Spec and the remaining phases (input methods, categorisation, Fleet page): `docs/fleet-and-ui-plan.md`.

## "Try the cheaper case" shows its result (after v1.0.0)
- On the Cost page, the button in "What moves it most" did work, but its only visible effect was in the Try a change bar and a ghost on the charts, far from the button, so it looked dead. It now says what it did right under the button ("With this change: ₹4.09 per km (was ₹5.12)"), and turns into **Undo** while applied.

## Electricity cost per km, Pune (after v1.0.0)
- New: what the operator pays the utility to charge the bus, added to the battery cost per km. Maharashtra only for now. Choose **Electricity** in the scenario panel: **MSEDCL HT IX** (HT EV charging station, energy 8.92 + wheeling 0.81 = ₹9.73 per unit) or **MSEDCL LT VIII** (LT EV charging station, 7.73 + 1.52 = ₹9.26), both FY 2026-27, in force from 1 April 2026, or your own flat price. Off by default; nothing existing changes until it is on.
- Source: MERC order in Case No. 75 of 2025 (post-remand), 25 March 2026, Annexure II. It supersedes the March 2025 MYT order in Case 217 of 2024 (whose ₹8.02 and ₹8.46 figures are not used). Both categories are single-part tariffs: no fixed or demand charge. Rates, page numbers and the link are in `engine/bus/tariffs.json` and `docs/data-attribution.md`.
- **Time of day matters.** The order removes the night rebate and charges +20 % on the energy charge (not wheeling) from 17:00 to 24:00; 09:00 to 17:00 is a rebate (15 % April to September, 25 % October to March, about 20 % on average); 00:00 to 09:00 is unchanged. The engine weights the energy charge by the hours the bus charges (start time and charge length), so with the default 22:00 start about two hours of every charge sit in the evening peak. Starting at midnight avoids it, which makes "Charging starts" a cost lever as well as a battery lever.
- Electricity per km = energy per km ÷ charger efficiency (assumed 92 %, editable) × price per unit. The tariff is per kVAh and is treated as per kWh at unity power factor. Electricity is one tariff, not a spread: the total is the battery's p10/p50/p90 plus the same electricity amount.
- API: `cost.electricity`, `cost.total_cost_per_km_p10/p50/p90` are new and additive; the battery figures, their scaling and the Cost page's threshold curve are untouched (locked by tests). Electricity is computed even without a battery price. New scenario fields: `electricity_tariff`, `electricity_custom_inr_per_kwh`, `charger_efficiency`.
- App: a "Cost to run the bus, per km" card on Cost (stacked battery and electricity bar, one sentence on which dominates, the price and charging window used, what is left out); total cost on Overview and Optimise when electricity is on; the Cost page's "Try a change" bar gains Charging starts. Report: total cost per km in the tile and snapshot, electricity and total rows in the table, tariff and efficiency in the inputs.
- Not included, and stated where the cost is shown: electricity duty, the fuel adjustment charge, tax on sale of electricity, power-factor penalties, tariff changes after FY 2026-27, and other utilities (BEST, Tata, Adani). The peak premium for EV is read from the MERC press note's rule for "other categories" (the order's own footnote for it was not in the extracted text); check it on the first bill. Not yet validated on buses.

## Cost and Range heroes fit one screen too (after v1.0.0)
- The same fix as the Replacement dot plot for the other big pictures: the cost-against-price curve (Cost), and the route road and the range-by-age curve (Range). Each is as tall as the window allows (with a floor) and as wide as its card, with the drawing's width following the box's shape so lines, dots and text keep one scale. One small shared helper, `lib/useFit.ts`, does it for all four charts. At 800 px of window height the Cost hero is 576 px tall and the Range hero 694 px, so each fits once scrolled to it.

## Replacement dot plot fits one screen (after v1.0.0)
- The "Fifty runs, fifty replacement dates" picture used to scale with the card's width, so on a wide window it grew taller than the screen and pushed the "with your change" row and the axis out of view. Its height is now limited by the window (down to 300 px, up to its natural size), and its drawing width follows the card's shape, so dots and text keep one scale instead of stretching. At 800 px of window height the whole card, including the second row, fits once scrolled to it.

## Scenario drawer: one toolbar (after v1.0.0)
- "Import your duty data", "Reset to defaults" and "Copy link" no longer sit as two loose rows of buttons at the bottom of the long Bus A drawer. They are one slim toolbar at the top: **Import CSV** on the left, **Reset** and **Copy link** on the right, with icons and tooltips. Import CSV folds open a small panel (what it fills in, that the file is read in the browser and never uploaded, Choose CSV file, Download a sample) and the results table appears inside it; closed, nothing extra is on screen. The behaviour of all three is unchanged.

## Settings from a local `.env` (after v1.0.0)
- The backend now reads `EV_*` settings from a git-ignored `.env` in the project root at start-up (small built-in reader, no new dependency). Variables already set in the environment win; blank values and comments are skipped; `EV_NO_DOTENV=1` turns it off (the tests set it). This is how the report email password is kept between runs without exporting it in a terminal each time. `.env` is in `.gitignore` and was never committed.

## Report redesigned in the app's own look (after v1.0.0)
- The Bus A vs Bus B PDF now looks like the app: near-black pages with the volt yellow accent, Lexend for headings and numbers, Manrope for text, the same colour meaning (volt = Bus A and better, white = Bus B, orange = the replacement line and warnings, red = worse). Four pages instead of a light-theme document.
- **Page 1, the snapshot**: one headline ("Bus B's battery lasts 28.9 months longer"), a one-line verdict of gains, losses and watch-outs, four tiles (battery life, cost per km, range at replacement, rupees per bus per year) each tagged GAIN, LOSS, WATCH or SAME, and both buses as a cutaway with their 96 cells coloured by health at the year Bus A is due for replacement. The cells are scattered inside the model's 10th to 90th percentile range and the page says it is an illustration of the forecast, not a measurement. Below: what changed on Bus B.
- **Page 2**: "What matters most" insight cards ranked risks first, then losses, then gains; a health chart with both crossings and the gap in months marked; and a chart of when the earliest tenth, median and latest tenth of packs reach the replacement line.
- **Page 3**: cost per km and range bars (with the route need drawn as a line), a side-by-side table with the change in each row coloured, and what the report cannot tell you. **Page 4**: notes returned by the model and every input, with the ones that differ highlighted.
- Everything is vector drawing, so it stays sharp and prints cleanly. Identical buses make no "lasts longer" claim; with no battery price the cost tile says "NOT SET" instead of a made-up figure.
- Fonts: Lexend and Manrope (SIL Open Font Licence 1.1) are bundled in `backend/app/fonts/` with their licence texts, converted to static files that include the rupee sign. DejaVu is no longer used. No new dependency.

## Optimise report: PDF and email (after v1.0.0)
- New **Report** button on the Optimise dock opens "Send report". Once Bus B differs from Bus A it can **download a PDF** of the comparison, or **email it to one address**.
- The report: what the comparison found (battery life, how often Bus B lasts longer, cost per km, range at replacement against the route need, rupees per bus per year and for the fleet when a price is set), what was changed on Bus B, a health chart for both buses with Bus A's 10th to 90th percentile band, a side-by-side results table, the limits of the forecast and every input in an appendix. Every page carries "Not yet validated on buses".
- The server builds the PDF from the two scenarios (`POST /api/v1/report/pdf`), so the download and the email attachment are the same document and the mail sender cannot be used for content of someone's choosing. `POST /api/v1/report/email` accepts one address; subject and body are fixed text. New dependency: `reportlab`; fonts are DejaVu Sans from matplotlib, because the standard PDF fonts have no rupee sign.
- Email goes over SMTP (made for Gmail with an app password) and is off until `EV_SMTP_USER` and `EV_SMTP_PASSWORD` are set; the panel then says so and the download still works. Limits: one address, 5 sends an hour per client and 30 for the service, credentials only from the environment. Render's free plan blocks outgoing SMTP, so email will not send from a free hosted copy.

## Decision insights in the existing panels (after v1.0.0)
- No new pages and no new endpoint. Each insight sits in the panel where the decision is made, behind a click or "Show as table" where it is detailed. Everything stays labelled not yet validated on buses.
- **What to do first** (Health): the charge cap, start time and pack heating each moved one sensible step on their own, ranked by the months of battery life they add (median, with the 10th percentile in the table), plus rupees per bus per year when a battery price is set. Rows that drop range at replacement below the route need carry a "below your route" mark; heat is tagged "needs your cooling system". One change at a time: they do not add up. Each row applies the move to the "Try a change" bar. These are three or four extra `/predict` calls asked one after another a moment after the page settles; measured cold at about 0.32 s each (about 1 s for the set), cached by the same keys the page itself uses, so clicking a row is instant. Calls stop while any input is invalid.
- **Stagger window** (Health, day strip): how far charging can start later and still finish 30 minutes before departure, with a "Try 02:30 start" button. Charger counts and tariffs are not modelled, so it says what is possible, not how many chargers are needed.
- **Cost against the replacement line** (Cost): replaces "Pack cost per year of life". Cost per km (10th to 90th percentile band) for lines from 60 % to 90 % health, worked out in the browser from the model's health curves and pinned to the engine's own answer at your current line (`tests/test_cost_threshold.py` checks it against `/predict` at 70, 80 and 90 %: 10th and 90th within 1 %, median within 5 %). The ring marks the lowest line that still leaves enough range for the route; the amber zone is where it does not. Cost only falls as the line is lowered, so this is the lowest line that is safe, not a free minimum.
- **Money, not months**: the life chip on "Try a change" and the Bus B insight on Optimise add "about ₹9,800 per bus per year (₹4.9 lakh a year for 50 buses)". Pack price spread over its life, straight-line, undiscounted, first pack only, shown only when a price is set, the price is the same on both sides and both medians are measurable. Fleet size is the one kept on the Replacement page.
- **Budget planning** (Replacement): the fleet plan bars carry 10th to 90th percentile whiskers for a fleet of that size (binomial on the model's yearly share, independent buses) with one line: the peak year's budget and the years in which most of the fleet, 80 %, reaches the line. The table gains 10th and 90th columns.
- **Risk framing** (Range): "One bus in ten is short by year 1.4, half by year 2.7, and nine in ten by year 6.8", read from where the 10th, 50th and 90th percentile curves cross the route need. The verdict names a bucket (fewer than 1 in 10, 1 in 10 to half, half to 9 in 10, more than 9 in 10), never an interpolated percentage. A sentence and a "Try 160 km a day" button show what a route 20 % shorter does to life and coverage (one extra `/predict`).

## Smaller key numbers and change bar (after v1.0.0)
- The row of change chips plus the insight sentence at the bottom of Optimise is now one small pill, "Bus B · 5 changes". Click it to open the headline sentence and the full list above it; hovering a row still highlights that part of Bus B. Escape or a click elsewhere closes it.
- The key-numbers block on Overview and Optimise is a compact translucent card with a small title chip ("Your bus", "Bus B"), smaller type and thin dividers, and a chevron that folds it to a single line of values so it stays out of the way when you zoom in.

## Analysis pages as instruments (after v1.0.0)
- Health, Replacement, Range and Cost each lead with one interactive picture and a one-line insight built from the page's own numbers, with a "Try it" button where a lever applies. Frontend only: no API changes.
- **Cost lab**: cost per km against battery price (10th to 90th percentile band), draggable price marker that sets the scenario price, a target cost per km with the break-even price, "Pack cost per year of life", and a tornado whose bars show the cheaper and dearer case with a "Try the cheaper case" button. Cost per run is pack price over km, so every percentile scales exactly with the battery price; `tests/test_cost_scaling.py` locks that. Threshold and km per day are never extrapolated: they come back from `/predict`.
- **Route fit** (Range): a road meter of range now (median and cautious) against the route plus 20 % reserve, a draggable route flag that sets km per day, and range over the years with the shortfall shaded. Range at any age is new-pack range times the health curve.
- **Replacement planner**: fifty dots, each 2 % of the model's runs, placed where that run reaches the line, with a "beyond the forecast" pile; a fleet planner (fleet size kept in this browser) turning the same spread into expected replacements per year and undiscounted first-pack spend. Assumes independent buses and one replacement each.
- **Ageing lab** (Health): 96 rings drained by the shared year with play, a one-day strip (drive, charge, rest full), a twelve-month cell temperature ring, and warnings moved into the shared Notes list. The waiting / cycling split is the share at replacement applied to the loss, not a time series.
- **Try a change** bar on each page: sliders for the levers that page cares about draw a ghost (hollow dots, dashed line, "was" values) and a life-change chip from a second `/predict`. The real scenario is never modified. "See it on the bus" links open the 3D page on the matching lens.
- Everything stays labelled not yet validated on buses.

## 3D views as instruments (after v1.0.0)
- Four lenses on both 3D pages (Ageing, Charge, Heat, Range; keys A, G, T, R), one at a time so the scene stays clear.
- Ageing: every battery cell is a ring that drains as the years pass. Lit arc = capacity left (median at that year), slate = lost to calendar ageing, umber = lost to cycling (split from the model's driver shares), white tick = replacement line, faint outer arc = the 10th to 90th percentile range. Cell-to-cell spread is illustrative scatter inside that range, not measured per cell. Cells below the replacement line glow orange (steady; a pulse there read as screen flicker).
- A depot charger beside each bus with a thin cable to the charge port; light pulses speed up with charger power. Pack thickness steps with pack energy.
- Charge lens: 24-hour day animation (drive, charge, rest) shared by both buses, a client port of the engine's day profile; rings show state of charge with ticks for the cap and minimum; a hatched bar means charging does not finish before departure.
- Heat lens: ring colour from the model's cell temperature, rising motes scaled by pack warmth. Range lens: a ground ruler of range on a full charge against the route plus 20 % reserve, with the shortfall in amber.
- Warnings moved off the bus: a Notes drawer (Needs attention, Outside the tested range, Good to know) with a count on the dock; the red overlays on Optimise are gone. An amber dot on the bus label marks items needing attention.
- Optimise: hovering a "Bus B changes" chip highlights the matching part of Bus B, a one-line insight (time resting full, battery life), and a small replacement-year bar on each bus label.
- Look: bloom and vignette (dropped automatically if the frame rate falls), soft depot floor and ground shadow, hover text on packs.
- Not yet validated on buses, like every number here. New dependencies: `@react-three/postprocessing`, `postprocessing`.

## NREL BLAST-Lite is now the engine (after v1.0.0)
- The app's capacity curves, replacement timing, range, cost and recommendations now come from a Python port of NREL's two LFP cell models (`engine/reference/`, notice in `engine/reference/NOTICE`). Our own laboratory-fitted model is kept in the code behind `EV_ENGINE=lab` and is no longer shown.
- Why: the cross-check below found our fit the most pessimistic in every scenario (4 to 5 year replacement) against NREL models and published EV-battery lifetimes of 10 to 15 years. Default 12 m hot-dry bus is now about 12 years (10th percentile about 8; 90th beyond the 15-year horizon).
- Each result is 50 runs (2 models x 5 degradation scalars x 5 pack penalties); the range is a spread of models, not a confidence interval. Pack penalty default is now 20 to 30 % (was 0 to 8 %).
- Port checked against package outputs: largest gap 0.47 points of capacity on bus scenarios, 0.005 on fixed conditions (`engine/artifacts/reference_port_check.json`).
- Evidence page rewritten around the NREL models, their tested ranges and the port check; the old cross-check card and the lab-model accuracy figures are gone. `/evidence` now returns `reference_engine` and `engine`, and no longer returns `crosscheck`.
- Replacement months at the 10th, 50th and 90th percentile come from the percentile retention curves, shared by Predict, Compare and Recommend. A percentile beyond the horizon is returned as null.
- Uncached prediction is slower (about 0.2 s against 0.07 s locally).

## Interface redesign (after v1.0.0)
- Removed the status chips ("Prior mode", "Not yet validated on buses", "Outside lab data", "Service online") and the "assumption" tags on scenario inputs. The not-validated statement stays in the page footer, on the Evidence page, in hover text and in every API number.
- The scenario inputs on Health, Replacement, Range and Cost are a slide-out drawer opened from a "Scenario" button; they open by themselves when an input is invalid.
- Larger key-number panels, set lower under the navigation bar. On Optimise, "Change Bus B to compare" appears once.
- Optimise comparison: Health / Difference colouring (Bus A grey, Bus B red to yellow by health difference), delta badges on Bus B, a "Bus B changes" bar, a two-curve timeline with replacement markers, and a one-off pulse when a new result arrives.
- Label colour is the brand yellow. The README screenshots show the earlier layout.

## BLAST-Lite cross-check (after v1.0.0)
- (Card since removed: see the entry above.) New Evidence card: our cell model against two public LFP models from NREL's BLAST-Lite on identical bus duty cycles (10 scenarios), a loss split into calendar and cycling, and same-condition storage and cycling runs. Generated offline by `scripts/crosscheck_blast.py` into `engine/artifacts/crosscheck_blast.json`; `/evidence` serves it as `crosscheck` (null if the file is absent). BLAST-Lite is not an app dependency.
- Finding: our model is the most pessimistic of the three in every scenario (12 m hot-dry, 10 years: 40 % retained against 82 to 88 %). Calendar ageing is in the same range as the two BLAST-Lite models (which differ 2 to 3× from each other); the gap is in cycling beyond about 1,000 cycles. The default replacement timing is probably early. The model itself was not changed.

## v1.0.0
First release. Prior mode only: models trained on public laboratory data, every output marked "not yet validated on buses". Adds the release documentation (README with screenshots, `docs/data-attribution.md`, this changelog) and the claims audit of the README against the stored metrics.

## Phase 8: hardening and release
- **cp-8.3, cp-8.3.1** `scripts/run_all.sh` serves the API and the built app on one port; single-page-app fallback, hashed-asset caching and path-traversal protection; works offline and without the `data/` folder. (`cp-8.3` shipped with two older tests failing because of the new catch-all route; `cp-8.3.1` fixes the tests.)
- **cp-8.2** Security headers on every response; the token key no longer has a public default; `pip-audit`, `npm audit --omit=dev` and `gitleaks` clean; `/predict` p95 0.08 s. See `docs/security-review.md`, `docs/performance.md`.
- **cp-8.1, cp-8.1.1** Accessibility: axe scans on every page (0 violations after fixes), skip link, landmarks, heading order, drawer focus handling, phone overflow, reduced motion. (`cp-8.1` shipped a stylesheet typo that broke the production build; `cp-8.1.1` fixes it.) See `docs/accessibility.md`.

## Phase 7: evidence and calibration
- **cp-7.2** Calibration method demonstration on EVBattery (`engine/calibrate/`, `docs/calibration-interface.md`): capacity error 2.19 % with no vendor labels, 1.55 % with 5, 1.41 % with 100. Shown on the Evidence page with the not-LFP caveat.

## Phase 6: 3D views
- **cp-6.5** Overview and Optimise became full-screen 3D scenes with a dock, side drawers, a key-number strip and the year scrubber floating over them.
- **cp-6.4** Removed the small label above page headings.
- **cp-6.3** Visual polish of the 3D views and the Optimise page.
- **cp-6.2** Procedural 3D bus with battery packs coloured by projected health; two-bus Optimise compare with live Bus B sliders and five goal presets from `/recommend`.

## Phase 5: frontend
- **cp-5.3** React frontend: sign-in, floating glass navigation, scenario panel with CSV import, Health, Replacement, Range, Cost and Evidence pages.

## Phase 4: API
- **cp-4.4** `/recommend` goal presets from a search over charge cap and charging start time; demo login with signed tokens; route-feasibility rule (range at replacement at least the route plus 20 %).
- **cp-4.3** Complete API: `/presets`, `/zones`, `/evidence`, `/compare`.
- **cp-4.2** `/predict` with labelled values (`value`, `unit`, `evidence_level`, `validated_on_buses: false`).
- **cp-4.1** FastAPI skeleton, uniform errors, body-size limit.

## Phase 3: decisions
- **cp-3.4** Range, cost per km and charging what-ifs on shared random draws.
- **cp-3.3** Replacement-window Monte Carlo (2,000 draws).
- **cp-3.2** Bus translation: duty cycle to cell conditions, with real weather for four climate zones.
- **cp-3.1** Uncertainty: bootstrap plus split-conformal bands (80 % band contains 72.5 % of cycling and 79.6 % of storage measurements).

## Phase 2: cell models
- **cp-2.4** Early-life cycle-life predictor: 12.7 % error against 17.7 % for guessing the average, on 77 held-out cells.
- **cp-2.3** Cycle-ageing model fitted on HUST.
- **cp-2.2** Calendar model validated across labs (fit one, predict the other).
- **cp-2.1** Calendar-ageing model fitted on Stanford and Naumann storage data.

## Phase 1: data
- **cp-1.3** EVBattery charging snippets processed for the calibration demonstration.
- **cp-1.2** NASA POWER weather for four climate zones.
- **cp-1.1** Laboratory datasets ingested with provenance.

## Phase 0: groundwork
- **cp-0.3** Phase 0 baselines reproducible. **cp-0.2** Environment and project skeleton. **cp-0.1** Repository initialised.
