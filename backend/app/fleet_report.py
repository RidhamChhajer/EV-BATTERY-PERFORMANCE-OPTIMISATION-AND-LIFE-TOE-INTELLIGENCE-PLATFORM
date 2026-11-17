"""The fleet forecast as a PDF, in the same look as the comparison report. Built from the same /fleet result the Fleet page shows; nothing here is a new model result.

Depots and routes are deliberately not in it: they stay in the browser (only duty classes and bus ages are ever sent), so the document lists duty classes and age groups,
and says so."""
from __future__ import annotations

import io
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from reportlab.platypus import PageBreak, SimpleDocTemplate, Spacer

from backend.app import report_viz as V
from backend.app.report import FULL, MARGIN, VOLT, WARN, _arr, _grid, _Numbered, _page, _rupees, _styles, _val, col, P
from backend.app.report import A4, mm
from backend.app.schemas import DISCLAIMER, FleetResponse

MAX_COHORT_ROWS = 40
LIMITS = [
    "Each bus is counted once: one pack, no second pack, no discounting, and buses age independently.",
    "A bus still in service is taken to have not yet reached the model's replacement line (80 % of a new pack's capacity). Operators often run packs below it, so this is a statement about the model's line, not about your replacement behaviour.",
    "Older buses are conditioned on having survived to their age; a bus with no in-service month is counted as new, which pushes its replacement later than it may be.",
    "The two published laboratory models are mixed 50/50 by assumption. The 10th to 90th percentile spread is mostly the two models disagreeing, not a fleet this size scattering.",
    "Expected buses and spend add across subsets of the fleet; percentiles do not, so the band is for the whole fleet's total only. A running total has no band.",
    "Duty classes group buses whose duty is within a measured step of each other; buses in one class share one model run.",
    "Depots, routes and reported battery health stay in your browser and are not in this document. Reported health is never used by the model.",
]


def _headline(f: FleetResponse) -> str:
    labels = f.period_labels
    if len(labels) < 2:
        return "Fleet forecast"
    sp = _arr(f.spend_expected) if f.spend_expected else None
    if sp is None:
        e = _arr(f.buses_expected)[1]
        return f"Expect about {col(VOLT, f'{e:.1f} buses')} to reach the line in {labels[1]}"
    e = sp[1]
    if e < 1:
        return f"No pack spend is expected in {labels[1]}"
    hi = _arr(f.spend_p90)[1] if f.spend_p90 else e
    return f"Budget about {col(VOLT, _rupees(e))} in {labels[1]}" + (f", up to {_rupees(hi)} at the 90th percentile" if hi > e + 1 else "")


def filename(now: datetime | None = None) -> str:
    return f"pack-horizon-fleet-forecast-{(now or datetime.now(timezone.utc)).strftime('%Y%m%d')}.pdf"


def fleet_story(f: FleetResponse, n_buses: int, name: str | None, now: datetime) -> list:
    """The document's flowables (separate from the build so the wording can be tested without reading a PDF back)."""
    S = _styles()
    labels, edges = f.period_labels, _arr(f.period_edges_months)
    be, b10, b90 = _arr(f.buses_expected), _arr(f.buses_p10), _arr(f.buses_p90)
    sp = _arr(f.spend_expected) if f.spend_expected else None
    s10 = _arr(f.spend_p10) if f.spend_p10 else None
    s90 = _arr(f.spend_p90) if f.spend_p90 else None
    story: list = [P("FLEET FORECAST", S["kicker"]), Spacer(1, 5), P(_headline(f), S["h1"]), Spacer(1, 5),
                   P(escape(f"{n_buses:,} buses in {len(f.classes)} duty classes · from {f.as_of} · financial years April to March · prepared {now.strftime('%d %B %Y')}" + (f" · {name}" if name else "")), S["small"]), Spacer(1, 4),
                   P("First pack per bus only, undiscounted, in rupees. Prior mode: published laboratory cell models and assumed inputs, not yet validated on buses.", S["small"]), Spacer(1, 8)]

    # budget table
    story.append(P("Budget by financial year", S["h2"]))
    head = ["Financial year", "Expected buses", "10th to 90th pct"] + (["Expected spend", "10th to 90th pct", "Running total (no band)"] if sp else [])
    rows = [[P(h, S["head"]) for h in head]]
    run = 0.0
    for i, lab in enumerate(labels):
        part = f" ({round(edges[i + 1] - edges[i])} months left)" if i == 0 else ""
        cells = [escape(lab + part), f"{be[i]:.1f}", f"{b10[i]:.0f} to {b90[i]:.0f}"]
        if sp:
            run += sp[i]
            cells += [_rupees(sp[i]), f"{_rupees(s10[i]) if s10 else '–'} to {_rupees(s90[i]) if s90 else '–'}", _rupees(run)]
        rows.append([P(c, S["cell"]) for c in cells])
    w = [FULL * x for x in ((0.22, 0.14, 0.16, 0.16, 0.18, 0.14) if sp else (0.4, 0.3, 0.3))]
    story.append(_grid(rows, w, pad=4))
    beyond = _val(f.beyond_forecast_buses) or 0
    story += [Spacer(1, 4), P(escape(f"About {beyond:.1f} buses are not expected to reach the line inside the forecast. The band is for the whole fleet's total."), S["small"])]

    # classes
    story.append(P("Duty classes", S["h2"]))
    rows = [[P(h, S["head"]) for h in ("Class", "Buses", "Months to the line (10th / median / 90th)", "Battery cost per km", "Outside the lab range")]]
    for c in f.classes:
        m = [_val(c.months_p10), _val(c.months_p50), _val(c.months_p90)]
        mm_ = " / ".join(f"{v:.0f}" if v is not None else "beyond" for v in m)
        k = _val(c.total_cost_per_km_p50) if c.total_cost_per_km_p50 else _val(c.battery_cost_per_km_p50)
        rows.append([P(escape(c.id), S["cell"]), P(f"{_val(c.n_buses):.0f}", S["cell"]), P(mm_, S["cell"]), P(f"₹{k:.2f}" if k is not None else "–", S["cell"]), P(col(WARN, "yes") if c.extrapolation_reasons else "no", S["cell"])])
    story.append(_grid(rows, [FULL * x for x in (0.2, 0.1, 0.3, 0.2, 0.2)], pad=4))

    # cohorts
    story += [PageBreak(), P("Buses by duty class and age", S["h2"]),
              P("Buses of one class and one age share a figure. Depots and routes are not in this document. Months count from today and assume the bus is still in service; sorted by the nearest median.", S["small"]), Spacer(1, 6)]
    coh = sorted(f.cohorts, key=lambda c: (_val(c.months_to_line_p50) is None, _val(c.months_to_line_p50) or 0))
    rows = [[P(h, S["head"]) for h in ("Class", "Age (months)", "Buses", "10th / median / 90th (months)", "Chance due in 12 months", "Flags")]]
    for c in coh[:MAX_COHORT_ROWS]:
        age = _val(c.age_months)
        m = [_val(c.months_to_line_p10), _val(c.months_to_line_p50), _val(c.months_to_line_p90)]
        rows.append([P(escape(c.class_id), S["cell"]), P(f"{age:.0f}" if age is not None else "unknown", S["cell"]), P(f"{_val(c.n_buses):.0f}", S["cell"]),
                     P(" / ".join(f"{v:.0f}" if v is not None else "beyond" for v in m), S["cell"]), P(f"{(_val(c.chance_due_next_12_months) or 0) * 100:.0f} %", S["cell"]), P(escape(", ".join(x.replace("_", " ") for x in c.flags)), S["small"])])
    story.append(_grid(rows, [FULL * x for x in (0.14, 0.12, 0.09, 0.27, 0.16, 0.22)], pad=3))
    if len(coh) > MAX_COHORT_ROWS:
        story += [Spacer(1, 4), P(f"{len(coh) - MAX_COHORT_ROWS} more groups are not listed here; the Roster CSV from the Fleet page has every bus.", S["small"])]

    # limits
    story += [PageBreak(), P("Assumptions and limits", S["h2"])]
    story += [P(escape(t), S["note"]) for t in LIMITS]
    story += [Spacer(1, 8), P(escape(DISCLAIMER), S["small"])]
    return story


def build_fleet_pdf(f: FleetResponse, n_buses: int, name: str | None = None, now: datetime | None = None) -> bytes:
    V.register_fonts()
    now = now or datetime.now(timezone.utc)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=24 * mm, bottomMargin=19 * mm,
                            title="Pack Horizon: fleet battery forecast", author="Pack Horizon", subject="Fleet battery lifecycle forecast, prior mode")
    doc.header_title = "E-bus battery lifecycle · Fleet forecast"
    doc.build(fleet_story(f, n_buses, name, now), onFirstPage=_page, onLaterPages=_page, canvasmaker=_Numbered)
    return buf.getvalue()
