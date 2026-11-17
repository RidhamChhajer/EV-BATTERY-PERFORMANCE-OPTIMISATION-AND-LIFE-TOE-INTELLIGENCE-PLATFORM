# Temperature effect on usable range: source status (M3.4)

Searched 2026-11-07 (one web search, standard depth) for measured LFP usable capacity versus temperature. Found only:
- A manufacturer datasheet for a 12 V LFP battery (Conexpro LFP-12.8-50): capacity relative to 25 C at 0.5 C: 40 C = 101 %, 25 C = 100 %, 0 C = 90 %, -10 C = 75 %. Not a bus pack, not peer reviewed, no 10 C value.
- Peer-reviewed LFP pouch-cell work that qualitatively shows temperature and rate effects change below 10 C, without a usable table.

Decision: the default temperature factor is 1.0 ("not modelled"). The datasheet curve is available as an optional, clearly labelled illustrative mode. No claim about bus range versus temperature is made. HVAC consumption, the larger real effect on bus range, has no public data in this project.
