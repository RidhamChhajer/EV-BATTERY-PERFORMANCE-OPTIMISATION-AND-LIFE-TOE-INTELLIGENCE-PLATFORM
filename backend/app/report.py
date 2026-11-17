"""The Bus A vs Bus B comparison report: one PDF in the app's own look, built from the same model results the Optimise page shows.

The server builds the document itself from two scenarios, so the file a user downloads and the file that is emailed are the same, and nobody can use
the mail sender to send content of their own. Every number comes from `run_prediction` / `run_compare`; nothing here is a new model result.
Look: Obsidian Volt (near-black pages, volt yellow accents), Lexend for headings and numbers, Manrope for text; the drawings live in report_viz.py.
Colour means what it means in the app: volt = Bus A and "better", white = Bus B, orange = the replacement line and warnings, red = worse.
"""
from __future__ import annotations

import io
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from reportlab.graphics import renderPDF
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from backend.app import report_viz as V
from backend.app.report_viz import BAD, BG, INK, LINE, LINE2, S1, S2, T2, T3, TEXT, VOLT, WARN, blend
from backend.app.schemas import CompareResult, DISCLAIMER, PredictionResult

RESERVE = 0.2                       # the app's route rule: daily distance plus 20 %
W, H = A4
MARGIN = 16 * mm
FULL = W - 2 * MARGIN
TONE = {"gain": VOLT, "loss": BAD, "warn": WARN, "same": T3}
TAG = {"gain": "GAIN", "loss": "LOSS", "warn": "WATCH", "same": "SAME"}


def HEX(c) -> str:
    return "#%02X%02X%02X" % (round(c.red * 255), round(c.green * 255), round(c.blue * 255))


# ---- numbers -----------------------------------------------------------------------------------------------------------------------------

def _val(x):
    """Plain number from a Labelled (or None)."""
    if x is None:
        return None
    v = x.value
    return None if isinstance(v, list) else float(v)


def _arr(x) -> list[float]:
    v = x.value
    return [float(a) for a in v] if isinstance(v, list) else [float(v)]


def _rupees(v: float) -> str:
    a, s = abs(v), "−" if v < 0 else ""
    if a >= 1e7:
        return f"{s}₹{a / 1e7:.2f} crore" if a < 1e8 else f"{s}₹{a / 1e7:.1f} crore"
    if a >= 1e5:
        return f"{s}₹{a / 1e5:.1f} lakh"
    return f"{s}₹{round(a):,}"


def _years(months: float | None) -> str:
    return "beyond the forecast" if months is None else f"{months / 12:.1f} years"


def _signed(v: float, d: int = 1, unit: str = "") -> str:
    return f"{'+' if v >= 0 else '−'}{abs(v):.{d}f}{unit}"


def _hhmm(h: float) -> str:
    m = round((h % 24) * 60) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


# Scenario fields, in the order a fleet manager reads them: key, label, formatter.
FIELDS: list[tuple[str, str, object]] = [
    ("archetype", "Bus type", lambda v: f"{v} bus"),
    ("pack_kwh", "Pack size", lambda v: f"{v:g} kWh"),
    ("kwh_per_km", "Energy use", lambda v: f"{v:.2f} kWh/km"),
    ("km_per_day", "Distance per day", lambda v: f"{v:g} km"),
    ("operating_days_per_year", "Operating days a year", lambda v: f"{v:g}"),
    ("soc_min_pct", "Lowest charge level", lambda v: f"{v:g} %"),
    ("soc_max_pct", "Charge cap", lambda v: f"{v:g} %"),
    ("charge_power_kw", "Charger power", lambda v: f"{v:g} kW"),
    ("charge_start_hour", "Charging starts", _hhmm),
    ("departure_hour", "Bus departs", _hhmm),
    ("zone", "Climate zone", lambda v: str(v).replace("_", " ")),
    ("heat_rise_c", "Pack heat above air", lambda v: f"{v:g} °C"),
    ("pack_penalty_min", "Weakest-cell penalty, low", lambda v: f"{v * 100:g} %"),
    ("pack_penalty_max", "Weakest-cell penalty, high", lambda v: f"{v * 100:g} %"),
    ("battery_cost_per_kwh_inr", "Battery price", lambda v: "not set" if v is None else f"₹{v:,.0f} per kWh"),
    ("electricity_tariff", "Electricity tariff", lambda v: TARIFF_NAMES.get(v, str(v))),
    ("electricity_custom_inr_per_kwh", "Own electricity price", lambda v: "–" if v is None else f"₹{v:g} per kWh"),
    ("charger_efficiency", "Charger efficiency", lambda v: f"{v * 100:g} %"),
    ("threshold", "Replace when health falls to", lambda v: f"{v * 100:g} %"),
    ("horizon_years", "Forecast length", lambda v: f"{v} years"),
]


TARIFF_NAMES = {"none": "not included", "msedcl_ht_ix": "MSEDCL HT IX, Pune", "msedcl_lt_viii": "MSEDCL LT VIII, Pune", "custom": "own flat price"}


def changes(a, b) -> list[tuple[str, str, str]]:
    out = []
    for key, label, fmt in FIELDS:
        va, vb = getattr(a, key), getattr(b, key)
        if va != vb and not (isinstance(va, float) and isinstance(vb, float) and abs(va - vb) < 1e-9):
            out.append((label, fmt(va) if va is not None else "not set", fmt(vb) if vb is not None else "not set"))
    return out


def route_need_km(s) -> float:
    return s.km_per_day * (1 + RESERVE)


def range_at_replacement(p: PredictionResult) -> float:
    return (_val(p.range.new_pack_range_km) or 0.0) * p.scenario.threshold


def life_value_per_bus_year(pa: PredictionResult, pb: PredictionResult) -> float | None:
    """Pack price spread over the median life, A minus B (positive: B is cheaper per year). Needs the same price on both and both medians."""
    ca, cb = _val(pa.cost.battery_cost), _val(pb.cost.battery_cost)
    ma, mb = _val(pa.replacement.months_p50), _val(pb.replacement.months_p50)
    if ca is None or cb is None or abs(ca - cb) >= 1 or not ca or not ma or not mb or ma <= 0 or mb <= 0:
        return None
    return ca / (ma / 12) - ca / (mb / 12)


def _tone(delta: float, eps: float, higher_is_better: bool = True) -> str:
    if abs(delta) < eps:
        return "same"
    return "gain" if (delta > 0) == higher_is_better else "loss"


def facts(pa: PredictionResult, pb: PredictionResult, cmp: CompareResult, fleet: int) -> dict:
    """Every figure the report shows, with who gains and who loses. One place, so the pages and the email summary always agree."""
    d = cmp.deltas[0]
    mon = lambda p, k: _val(getattr(p.replacement, f"months_{k}"))
    f: dict = {"fleet": fleet, "later": None if not changes(pa.scenario, pb.scenario) else _val(d.prob_variant_later)}
    f["m"] = {k: (mon(pa, k), mon(pb, k)) for k in ("p10", "p50", "p90")}
    ma, mb = f["m"]["p50"]
    f["dm"] = None if ma is None or mb is None else mb - ma
    f["life_tone"] = "same" if f["dm"] is None else _tone(f["dm"], 0.5)
    ca, cb = _val(pa.cost.cost_per_km_p50), _val(pb.cost.cost_per_km_p50)
    f["cost"] = (ca, cb) if ca is not None and cb is not None else None
    f["cost_tone"] = _tone(cb - ca, 0.005, higher_is_better=False) if f["cost"] else "same"
    ea = _val(pa.cost.electricity.cost_per_km) if pa.cost.electricity else None
    eb = _val(pb.cost.electricity.cost_per_km) if pb.cost.electricity else None
    f["elec"] = (ea, eb) if ea is not None and eb is not None else None
    f["total"] = (ca + ea, cb + eb) if f["cost"] and f["elec"] else None
    f["total_tone"] = _tone(f["total"][1] - f["total"][0], 0.005, higher_is_better=False) if f["total"] else "same"
    f["cost_head_tone"] = f["total_tone"] if f["total"] else f["cost_tone"]  # the figure the tile and snapshot show: with electricity it is the total
    f["need"] = route_need_km(pa.scenario)
    f["new_a"], f["new_b"] = _val(pa.range.new_pack_range_km) or 0.0, _val(pb.range.new_pack_range_km) or 0.0
    f["ra"], f["rb"] = range_at_replacement(pa), range_at_replacement(pb)
    f["a_ok"], f["b_ok"] = f["ra"] >= f["need"] - 0.5, f["rb"] >= f["need"] - 0.5
    f["risk"] = f["a_ok"] and not f["b_ok"]
    if f["risk"]:
        f["range_tone"] = "warn"
    elif f["b_ok"] and not f["a_ok"]:
        f["range_tone"] = "gain"
    else:
        f["range_tone"] = _tone(f["rb"] - f["ra"], 0.5)
    f["money"] = life_value_per_bus_year(pa, pb)
    f["money_tone"] = "same" if f["money"] is None or abs(f["money"]) < 1 else "gain" if f["money"] > 0 else "loss"
    # the snapshot year: where Bus A's pack is due for replacement (the point at which the two buses differ most visibly), kept inside the forecast
    horizon = pa.replacement.months[-1] / 12
    f["horizon"] = horizon
    f["year"] = min(horizon, max(1.0, round(ma / 12 * 2) / 2)) if ma is not None else min(horizon, 10.0)
    return f


def headline(pa: PredictionResult, pb: PredictionResult, d) -> list[str]:
    """Plain-text summary lines (used by the email body)."""
    out: list[str] = []
    ma, mb = _val(pa.replacement.months_p50), _val(pb.replacement.months_p50)
    if ma is not None and mb is not None:
        dm = mb - ma
        out.append(f"Bus B's median battery life is about the same as Bus A's: {ma / 12:.1f} years against {mb / 12:.1f} years." if abs(dm) < 0.5 else
                   f"Bus B's battery lasts about {abs(dm):.1f} months {'longer' if dm > 0 else 'less'} than Bus A's at the median ({ma / 12:.1f} years for Bus A, {mb / 12:.1f} years for Bus B).")
    elif ma is None and mb is None:
        out.append("Neither bus reaches the replacement line within the forecast at the median, so the difference in life cannot be measured.")
    else:
        out.append(f"The median replacement date is beyond the forecast for {'Bus A' if ma is None else 'Bus B'}, so the difference in life cannot be measured exactly.")
    later = _val(d.prob_variant_later) if changes(pa.scenario, pb.scenario) else None
    if later is not None:
        out.append(f"Bus B lasts longer than Bus A in {round(later * 100)} % of the model's reference runs.")
    ca, cb = _val(pa.cost.cost_per_km_p50), _val(pb.cost.cost_per_km_p50)
    if ca is not None and cb is not None:
        dc = cb - ca
        out.append("Battery cost per kilometre is about the same." if abs(dc) < 0.005 else f"Battery cost per kilometre is ₹{abs(dc):.2f} {'lower' if dc < 0 else 'higher'} for Bus B (₹{cb:.2f} against ₹{ca:.2f}).")
    ea_, eb_ = (_val(pa.cost.electricity.cost_per_km) if pa.cost.electricity else None), (_val(pb.cost.electricity.cost_per_km) if pb.cost.electricity else None)
    if ea_ is not None and eb_ is not None:
        de = eb_ - ea_
        out.append("Electricity cost per kilometre is about the same." if abs(de) < 0.005 else f"Electricity cost per kilometre is ₹{abs(de):.2f} {'lower' if de < 0 else 'higher'} for Bus B (₹{eb_:.2f} against ₹{ea_:.2f}).")
    ra, rb, need = range_at_replacement(pa), range_at_replacement(pb), route_need_km(pa.scenario)
    a_ok, b_ok = ra >= need - 0.5, rb >= need - 0.5
    if a_ok and b_ok:
        out.append(f"Both buses keep enough range for the route at replacement: Bus A {ra:.0f} km, Bus B {rb:.0f} km against {need:.0f} km needed (daily distance plus a 20 % reserve).")
    elif a_ok:
        out.append(f"Range warning: when Bus B's pack is due for replacement it could drive about {rb:.0f} km on a charge, below the {need:.0f} km the route needs (daily distance plus a 20 % reserve). Bus A would still manage {ra:.0f} km.")
    elif b_ok:
        out.append(f"Bus A falls below the {need:.0f} km the route needs at replacement ({ra:.0f} km), while Bus B keeps {rb:.0f} km.")
    else:
        out.append(f"Neither bus keeps the {need:.0f} km the route needs (daily distance plus a 20 % reserve) at replacement: Bus A {ra:.0f} km, Bus B {rb:.0f} km.")
    return out


def insights(f: dict) -> list[dict]:
    """The few things that matter most: a tone (gain, loss, warn, same), a short title and a sentence of detail. Risks first, then losses, then gains."""
    out: list[dict] = []
    ma, mb = f["m"]["p50"]
    if f["dm"] is None:
        out.append({"tone": "same", "title": "Life difference cannot be measured", "text": "At least one bus has its median replacement beyond the forecast, so only the ranges in the charts can be compared."})
    elif f["life_tone"] == "same":
        out.append({"tone": "same", "title": "Battery life is about the same", "text": f"Median replacement: {ma / 12:.1f} years for Bus A, {mb / 12:.1f} years for Bus B."})
    else:
        p10a, p10b = f["m"]["p10"]
        early = f" The earliest tenth of runs move by {_signed(p10b - p10a, 1, ' months')}." if p10a is not None and p10b is not None else ""
        word = "longer" if f["dm"] > 0 else "less"
        out.append({"tone": f["life_tone"], "title": f"Battery lasts {abs(f['dm']):.1f} months {word}", "text": f"Median replacement moves from {ma / 12:.1f} to {mb / 12:.1f} years.{early}"})
    if f["cost"]:
        ca, cb = f["total"] if f["total"] else f["cost"]
        tone = f["cost_head_tone"]
        what = "Battery plus electricity per kilometre" if f["total"] else "Battery cost per kilometre"
        tail = " (published tariff, held flat)." if f["total"] else " (pack price over the kilometres driven until replacement)."
        if tone == "same":
            out.append({"tone": "same", "title": "Cost per km is about the same", "text": f"Median ₹{ca:.2f} for Bus A and ₹{cb:.2f} for Bus B."})
        else:
            word = "cheaper" if cb < ca else "dearer"
            out.append({"tone": tone, "title": f"₹{abs(cb - ca):.2f} {word} per km", "text": f"{what} moves from ₹{ca:.2f} to ₹{cb:.2f}{tail}"})
    need, ra, rb = f["need"], f["ra"], f["rb"]
    if f["risk"]:
        out.append({"tone": "warn", "title": "Range falls below your route", "text": f"At replacement Bus B could drive about {rb:.0f} km on a charge, short of the {need:.0f} km the route needs (daily distance plus 20 %). Bus A keeps {ra:.0f} km."})
    elif not f["a_ok"] and not f["b_ok"]:
        out.append({"tone": "warn", "title": "Neither bus keeps the route range", "text": f"At replacement Bus A manages {ra:.0f} km and Bus B {rb:.0f} km against the {need:.0f} km the route needs (daily distance plus 20 %)."})
    elif f["b_ok"] and not f["a_ok"]:
        out.append({"tone": "gain", "title": "Bus B keeps the route range", "text": f"Bus A drops to {ra:.0f} km at replacement, below the {need:.0f} km needed. Bus B keeps {rb:.0f} km."})
    elif abs(rb - ra) >= 0.5:
        sign = "+" if rb > ra else "−"
        out.append({"tone": "same", "title": f"Range at replacement {sign}{abs(rb - ra):.0f} km, still enough", "text": f"{ra:.0f} km for Bus A and {rb:.0f} km for Bus B, both above the {need:.0f} km the route needs."})
    if f["money"] is not None and f["money_tone"] != "same":
        per, n = f["money"], f["fleet"]
        word = "saved" if per > 0 else "more"
        out.append({"tone": f["money_tone"], "title": f"About {_rupees(abs(per))} per bus a year {word}",
                    "text": f"{_rupees(abs(per) * n)} a year for {n} bus{'es' if n != 1 else ''}. The pack price spread over its median life: straight-line, undiscounted, first pack only."})
    if f["later"] is not None:
        later = f["later"]
        out.append({"tone": "gain" if later >= 0.6 else "loss" if later <= 0.4 else "same", "title": f"Bus B lasts longer in {round(later * 100)} % of runs",
                    "text": "Share of the model's 50 reference runs in which Bus B reaches the replacement line later than Bus A."})
    order = {"warn": 0, "loss": 1, "gain": 2, "same": 3}
    return sorted(out, key=lambda x: order[x["tone"]])


# ---- styles ------------------------------------------------------------------------------------------------------------------------------

def _styles() -> dict[str, ParagraphStyle]:
    def s(name, **k):
        return ParagraphStyle(name, **{"fontName": "MR", "fontSize": 9, "leading": 13, "textColor": T2, "alignment": TA_LEFT, **k})
    return {
        "kicker": s("kicker", fontName="LX-SB", fontSize=8, leading=11, textColor=VOLT),
        "h1": s("h1", fontName="LX-SB", fontSize=25, leading=29, textColor=TEXT),
        "sub": s("sub", fontSize=9.4, leading=14),
        "h2": s("h2", fontName="LX-SB", fontSize=12.5, leading=16, textColor=TEXT, spaceBefore=14, spaceAfter=6),
        "p": s("p"), "small": s("small", fontSize=7.8, leading=11, textColor=T3), "tiny": s("tiny", fontSize=7, leading=9.5, textColor=T3), "note": s("note", fontSize=7.8, leading=11, textColor=T3, leftIndent=9, firstLineIndent=-9, spaceAfter=2),
        "cell": s("cell", fontSize=8.6, leading=11.6), "head": s("head", fontName="LX", fontSize=7.2, leading=10, textColor=T3),
        "lab": s("lab", fontName="LX", fontSize=7, leading=9, textColor=T3),
        "tag": s("tag", fontName="LX-SB", fontSize=6.6, leading=9, alignment=TA_RIGHT),
        "big": s("big", fontName="LX-SB", fontSize=21, leading=24, textColor=TEXT),
        "ttl": s("ttl", fontName="LX-SB", fontSize=10.4, leading=13.5, textColor=TEXT),
        "num": s("num", fontName="LX-SB", fontSize=15, leading=18, textColor=TEXT),
        "cardh": s("cardh", fontName="LX-SB", fontSize=10, leading=13, textColor=TEXT),
        "right": s("right", fontSize=8.6, leading=11.6, alignment=TA_RIGHT, textColor=TEXT),
    }


def P(t: str, st: ParagraphStyle) -> Paragraph:
    return Paragraph(t, st)


def col(c, text: str) -> str:
    return f'<font color="{HEX(c)}">{text}</font>'


# ---- page furniture ----------------------------------------------------------------------------------------------------------------------

def _page(c: canvas.Canvas, doc) -> None:
    c.saveState()
    c.setFillColor(BG); c.rect(0, 0, W, H, stroke=0, fill=1)
    # a soft volt glow in the top-right corner, like the app's hero cards (stacked solid discs: viewers differ on transparency)
    for i, a in enumerate((0.012, 0.016, 0.02, 0.024, 0.028)):
        c.setFillColor(blend(VOLT, BG, a)); c.circle(W - 14 * mm, H - 4 * mm, (74 - i * 13) * mm, stroke=0, fill=1)
    renderPDF.draw(V.brand_mark(17), c, MARGIN, H - 15.5 * mm)
    c.setFont("LX-SB", 10.5); c.setFillColor(TEXT); c.drawString(MARGIN + 23, H - 12.4 * mm, "Pack Horizon")
    c.setFont("MR", 8); c.setFillColor(T3); c.drawRightString(W - MARGIN, H - 12.3 * mm, getattr(doc, "header_title", "E-bus battery lifecycle · Bus comparison report"))
    c.setStrokeColor(LINE2); c.setLineWidth(0.6); c.line(MARGIN, H - 18.5 * mm, W - MARGIN, H - 18.5 * mm)
    c.restoreState()


class _Numbered(canvas.Canvas):
    """Canvas that knows the page count, so every footer can say "Page 2 of 4"."""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self._saved: list[dict] = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self.setStrokeColor(LINE2); self.setLineWidth(0.6); self.line(MARGIN, 14 * mm, W - MARGIN, 14 * mm)
            self.setFont("MR", 7.5); self.setFillColor(T3)
            self.drawString(MARGIN, 9.5 * mm, "Not yet validated on buses · Prior mode: published laboratory cell models, assumed inputs")
            self.drawRightString(W - MARGIN, 9.5 * mm, f"Page {self._pageNumber} of {total}")
            super().showPage()
        super().save()


def _plain(pad_l=0, pad_r=0, pad_t=0, pad_b=0) -> list:
    return [("LEFTPADDING", (0, 0), (-1, -1), pad_l), ("RIGHTPADDING", (0, 0), (-1, -1), pad_r), ("TOPPADDING", (0, 0), (-1, -1), pad_t), ("BOTTOMPADDING", (0, 0), (-1, -1), pad_b), ("VALIGN", (0, 0), (-1, -1), "TOP")]


def _card(rows, width: float, accent=None, pad: float = 10, heights=None) -> Table:
    t = Table(rows, colWidths=[width], rowHeights=heights)
    st = [("BACKGROUND", (0, 0), (-1, -1), S1), ("BOX", (0, 0), (-1, -1), 0.7, LINE2), ("ROUNDEDCORNERS", [10, 10, 10, 10]),
          ("LEFTPADDING", (0, 0), (-1, -1), pad), ("RIGHTPADDING", (0, 0), (-1, -1), pad), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
          ("TOPPADDING", (0, 0), (-1, 0), 10), ("BOTTOMPADDING", (0, -1), (-1, -1), 9), ("VALIGN", (0, 0), (-1, -1), "TOP")]
    if accent is not None:
        st.append(("LINEABOVE", (0, 0), (-1, 0), 2.2, accent))
    t.setStyle(TableStyle(st))
    return t


def _grid(rows, widths, pad: float = 5) -> Table:
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                           ("TOPPADDING", (0, 0), (-1, -1), pad), ("BOTTOMPADDING", (0, 0), (-1, -1), pad), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE2),
                           ("BACKGROUND", (0, 0), (-1, -1), S1), ("BACKGROUND", (0, 0), (-1, 0), S2), ("LINEBELOW", (0, 0), (-1, 0), 0.8, LINE),
                           ("BOX", (0, 0), (-1, -1), 0.6, LINE2), ("ROUNDEDCORNERS", [8, 8, 8, 8])]))
    return t


def _row_of(items: list, widths: list[float], gap: float) -> Table:
    cells, ws = [], []
    for i, (it, w) in enumerate(zip(items, widths)):
        if i:
            cells.append(""); ws.append(gap)
        cells.append(it); ws.append(w)
    t = Table([cells], colWidths=ws)
    t.setStyle(TableStyle(_plain()))
    return t


def _tile(S, label: str, value: str, sub: str, tone: str, width: float, tag: str | None = None) -> Table:
    c = TONE[tone]
    head = Table([[P(label.upper(), S["lab"]), P(col(c, tag or TAG[tone]), S["tag"])]], colWidths=[(width - 14) * 0.62, (width - 14) * 0.38])
    head.setStyle(TableStyle(_plain()))
    return _card([[head], [P(col(c if tone != "same" else TEXT, value), S["big"])], [P(sub, S["small"])]], width, accent=c, pad=7, heights=[36, 32, 32])


# ---- the document ------------------------------------------------------------------------------------------------------------------------

def build_pdf(pa: PredictionResult, pb: PredictionResult, cmp: CompareResult, fleet: int = 50, now: datetime | None = None) -> bytes:
    """The full report as PDF bytes. `pa`/`pb` are the predictions for Bus A and Bus B, `cmp` the paired comparison of the same two scenarios."""
    V.register_fonts()
    S = _styles()
    now = now or datetime.now(timezone.utc)
    f = facts(pa, pb, cmp, fleet)
    sa, sb = pa.scenario, pb.scenario
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=24 * mm, bottomMargin=19 * mm,
                            title="Pack Horizon: Bus A vs Bus B comparison", author="Pack Horizon", subject="Battery lifecycle comparison, prior mode")
    story: list = []
    ma, mb = f["m"]["p50"]
    risk = f["risk"]

    # -- page 1: the snapshot ------------------------------------------------------------------------------------------------------------
    if f["dm"] is None:
        hl = f"Bus A and Bus B, {col(VOLT, 'compared')}"
    elif f["life_tone"] == "same":
        hl = f"Bus B's battery life is {col(T2, 'about the same')} as Bus A's"
    else:
        amount = f"{abs(f['dm']):.1f} months {'longer' if f['dm'] > 0 else 'less'}"
        hl = f"Bus B's battery lasts {col(TONE[f['life_tone']], amount)}"
    named = (("battery life", f["life_tone"]), ("cost per km", f["cost_head_tone"]), ("range at replacement", f["range_tone"]), ("yearly money", f["money_tone"]))
    gains, losses = [n for n, t in named if t == "gain"], [n for n, t in named if t == "loss"]
    verdict = []
    if gains:
        verdict.append(f"{col(VOLT, '<b>Gains</b>')} in {', '.join(gains)}")
    if losses:
        verdict.append(f"{col(BAD, '<b>Losses</b>')} in {', '.join(losses)}")
    if risk:
        verdict.append(f"{col(WARN, '<b>Watch</b>')}: range at replacement is below what your route needs")
    story += [P("BUS A VS BUS B · COMPARISON SNAPSHOT", S["kicker"]), Spacer(1, 5), P(hl, S["h1"]), Spacer(1, 5),
              P(" · ".join(verdict) if verdict else "No gains or losses beyond the model's noise.", S["sub"]), Spacer(1, 2),
              P(escape(f"{sa.archetype} bus · {sa.zone.replace('_', ' ')} climate · {sa.km_per_day:g} km a day · prepared {now.strftime('%d %B %Y')}"), S["small"]), Spacer(1, 11)]

    gap = 7.0
    tw4 = (FULL - 3 * gap) / 4
    tiles = [_tile(S, "Battery life", "—" if f["dm"] is None else _signed(f["dm"], 1, " mo"),
                   f"{ma / 12:.1f} to {mb / 12:.1f} years (median)" if f["dm"] is not None else "median beyond the forecast", f["life_tone"], tw4, tag=None if f["dm"] is not None else "N/A")]
    if f["cost"]:
        ca, cb = f["total"] if f["total"] else f["cost"]
        tone = f["cost_head_tone"]
        cval = "₹0.00" if tone == "same" else ("−" if cb < ca else "+") + f"₹{abs(cb - ca):.2f}"
        tiles.append(_tile(S, "Cost per km", cval, f"₹{ca:.2f} to ₹{cb:.2f} " + ("(median, with electricity)" if f["total"] else "(median)"), tone, tw4))
    else:
        tiles.append(_tile(S, "Cost per km", "—", "set a battery price to see it", "same", tw4, tag="NOT SET"))
    rdelta = f["rb"] - f["ra"]
    tiles.append(_tile(S, "Range at replacement", _signed(rdelta, 0, " km") if abs(rdelta) >= 0.5 else "0 km", f"{f['ra']:.0f} to {f['rb']:.0f} km · route needs {f['need']:.0f} km", f["range_tone"], tw4))
    if f["money"] is not None and f["money_tone"] != "same":
        n = f["fleet"]
        tiles.append(_tile(S, "Per bus, per year", ("+" if f["money"] > 0 else "−") + _rupees(abs(f["money"])), f"{_rupees(abs(f['money']) * n)} a year for {n} bus{'es' if n != 1 else ''}", f["money_tone"], tw4))
    else:
        later = f["later"]
        tone = "same" if later is None else "gain" if later >= 0.6 else "loss" if later <= 0.4 else "same"
        tiles.append(_tile(S, "Lasts longer", "—" if later is None else f"{round(later * 100)} %", "share of runs where Bus B outlasts Bus A", tone, tw4))
    story += [_row_of(tiles, [tw4] * 4, gap), Spacer(1, 6)]

    # the two buses, cut away, coloured by health at the snapshot year
    yr = f["year"]
    line_pct = sa.threshold * 100

    def band(p):
        return tuple(V.series_at(p.replacement.months, [v * 100 for v in _arr(getattr(p.replacement, f"retention_{k}"))], yr) for k in ("p10", "p50", "p90"))
    band_a, band_b = band(pa), band(pb)
    due = ", when Bus A's pack is due for replacement" if ma is not None and abs(yr - ma / 12) < 0.76 else ""
    story += [P(f"Snapshot at year {yr:g}{due}", S["h2"])]
    cw = (FULL - 10) / 2
    inner = cw - 20

    def bus_card(name: str, sub: str, accent, p, bnd, is_b: bool) -> Table:
        m = lambda k: _val(getattr(p.replacement, f"months_{k}"))
        median_colour = col(V.health_color(bnd[1], line_pct), f"{bnd[1]:.1f} %")
        rows = [[P(f'{col(accent, name)}  <font color="{HEX(T3)}" size="8">{escape(sub)}</font>', S["cardh"])],
                [V.bus_snapshot(inner, bnd, line_pct, accent)],
                [P(f'{median_colour} <font name="MR" size="8.5" color="{HEX(T3)}">median health · {bnd[0]:.0f} to {bnd[2]:.0f} % across runs</font>', S["num"])]]
        fr = []

        def add(label, val, delta="", tone="same"):
            fr.append([P(label, S["cell"]), P(val, S["right"]), P(col(TONE[tone], delta) if delta else "", S["right"])])
        add("Replace around", _years(m("p50")), _signed(f["dm"], 1, " mo") if is_b and f["dm"] is not None and abs(f["dm"]) >= 0.5 else "", f["life_tone"])
        if f["cost"]:
            ca, cb = f["total"] if f["total"] else f["cost"]
            tone = f["cost_head_tone"]
            add("Cost per km", f"₹{(cb if is_b else ca):.2f}", (("−" if cb < ca else "+") + f"₹{abs(cb - ca):.2f}") if is_b and tone != "same" else "", tone)
        rr = f["rb"] if is_b else f["ra"]
        add("Range at replacement", f"{rr:.0f} km", _signed(f["rb"] - f["ra"], 0, " km") if is_b and abs(f["rb"] - f["ra"]) >= 0.5 else "", f["range_tone"])
        add("Earliest tenth", _years(m("p10")))
        ft = Table(fr, colWidths=[inner * 0.40, inner * 0.36, inner * 0.24])
        ft.setStyle(TableStyle(_plain(0, 0, 4, 4) + [("LINEABOVE", (0, 0), (-1, -1), 0.4, LINE2), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        rows.append([ft])
        return _card(rows, cw, accent=accent)

    story += [_row_of([bus_card("BUS A", "baseline", VOLT, pa, band_a, False), bus_card("BUS B", "with your changes", TEXT, pb, band_b, True)], [cw, cw], 10), Spacer(1, 6),
              V.health_scale(FULL, line_pct), Spacer(1, 5),
              P("Each of the 96 cells is coloured by its health, scattered inside the model's 10th to 90th percentile range. An illustration of the forecast, not a measurement of any bus.", S["tiny"]), Spacer(1, 6)]

    ch = changes(sa, sb)
    story += [P("What changed on Bus B", S["h2"])]
    if ch:
        chips = [P(f'<font color="{HEX(T3)}">{escape(a)}</font>  {escape(b)} <font color="{HEX(VOLT)}">to</font> <b><font color="{HEX(TEXT)}">{escape(c)}</font></b>', S["cell"]) for a, b, c in ch[:6]]
        if len(ch) > 6:
            chips[-1] = P(f'<font color="{HEX(T3)}">and {len(ch) - 5} more, listed on the last page</font>', S["cell"])
        per = 2
        rows = [chips[i:i + per] + [""] * (per - len(chips[i:i + per])) for i in range(0, len(chips), per)]
        t = Table(rows, colWidths=[FULL / per] * per)
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), S1), ("ROUNDEDCORNERS", [8, 8, 8, 8]), ("BOX", (0, 0), (-1, -1), 0.6, LINE2), ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE2),
                               ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story += [t]
    else:
        story += [P("Bus B uses the same settings as Bus A.", S["p"])]

    # -- page 2: what matters, and when ---------------------------------------------------------------------------------------------------
    story += [PageBreak(), P("What matters most", S["h2"])]
    cards = insights(f)
    for it in cards:
        t = Table([["", [P(it["title"], S["ttl"]), Spacer(1, 1), P(escape(it["text"]), S["small"])]]], colWidths=[4, FULL - 4])
        t.setStyle(TableStyle([("BACKGROUND", (1, 0), (1, 0), S1), ("BACKGROUND", (0, 0), (0, 0), TONE[it["tone"]]), ("LEFTPADDING", (1, 0), (1, 0), 11), ("RIGHTPADDING", (1, 0), (1, 0), 10),
                               ("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (0, 0), (0, 0), 0), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                               ("BOX", (1, 0), (1, 0), 0.5, LINE2), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story += [t, Spacer(1, 5)]

    story += [KeepTogether([P("Battery health over time", S["h2"]), V.chart_legend(FULL), Spacer(1, 4), V.health_chart(pa, pb, FULL, 215 if len(cards) <= 4 else 170, _val, _arr), Spacer(1, 2),
                            P("Where a line meets the orange line, that pack is due for replacement. The gap between the two crossings is the difference in battery life.", S["tiny"])]),
              KeepTogether([P("When packs reach the replacement line", S["h2"]), V.timing_chart(pa, pb, FULL, _val, f["horizon"]), Spacer(1, 12),
                            P("Each bar runs from the earliest tenth to the latest tenth of the model's runs, the dot is the median.", S["tiny"])])]

    # -- page 3: cost, range, the full table -----------------------------------------------------------------------------------------------
    story += [PageBreak(), P("Cost and range", S["h2"])]
    half = (FULL - 12) / 2
    right = [P("Range on a full charge", S["cardh"]), Spacer(1, 3), V.bars_chart([
        {"label": "A", "value": f["ra"], "ghost": f["new_a"], "color": VOLT, "text": f"{f['ra']:.0f} km"},
        {"label": "B", "value": f["rb"], "ghost": f["new_b"], "color": TEXT, "text": f"{f['rb']:.0f} km"}], half - 20, "km",
        flag=(f["need"], f"route needs {f['need']:.0f} km"), xmax=max(f["new_a"], f["new_b"], f["need"]) * 1.08),
        P("Solid = at replacement, dashed outline = new pack. The orange line is your daily distance plus a 20 % reserve.", S["tiny"])]
    if f["cost"]:
        ca, cb = f["cost"]
        g = lambda p, k: _val(getattr(p.cost, f"cost_per_km_{k}"))
        left = [P("Battery cost per km", S["cardh"]), Spacer(1, 3), V.bars_chart([
            {"label": "A", "value": ca, "color": VOLT, "low": g(pa, "p10"), "high": g(pa, "p90"), "text": f"₹{ca:.2f}"},
            {"label": "B", "value": cb, "color": TEXT, "low": g(pb, "p10"), "high": g(pb, "p90"), "text": f"₹{cb:.2f}"}], half - 20, "₹"),
            Spacer(1, 27), P("Bar = median, line = 10th to 90th percentile. Lower is better.", S["tiny"])]
        story += [_row_of([_card([[left]], half), _card([[right]], half)], [half, half], 12)]
    else:
        story += [_card([[right]], FULL)]
    story += [Spacer(1, 10)]

    def row(label, a, b, diff="", tone="same"):
        return [P(label, S["cell"]), P(a, S["right"]), P(b, S["right"]), P(col(TONE[tone], diff) if diff else "", S["right"])]
    mon = lambda p, k: _val(getattr(p.replacement, f"months_{k}"))
    pair = lambda k: (mon(pa, k), mon(pb, k))
    rows = [[P("", S["head"]), P("BUS A", S["head"]), P("BUS B", S["head"]), P("CHANGE (B − A)", S["head"])]]
    rows.append(row("Replace around (median)", _years(ma), _years(mb), _signed(f["dm"], 1, " months") if f["dm"] is not None else "not measurable", f["life_tone"]))
    for label, k in (("Earliest tenth reach the line", "p10"), ("Latest tenth reach the line", "p90")):
        xa, xb = pair(k)
        both = xa is not None and xb is not None
        rows.append(row(label, _years(xa), _years(xb), _signed(xb - xa, 1, " months") if both else "", _tone(xb - xa, 0.5) if both else "same"))
    if f["cost"]:
        ca, cb = f["cost"]
        rows.append(row("Battery cost per km (median)", f"₹{ca:.2f}", f"₹{cb:.2f}", ("−" if cb < ca else "+") + f"₹{abs(cb - ca):.2f}", f["cost_tone"]))
        if f["elec"]:
            xa, xb = f["elec"]
            rows.append(row("Electricity cost per km", f"₹{xa:.2f}", f"₹{xb:.2f}", ("−" if xb < xa else "+") + f"₹{abs(xb - xa):.2f}" if abs(xb - xa) >= 0.005 else "", _tone(xb - xa, 0.005, higher_is_better=False)))
            ta, tb = f["total"]
            rows.append(row("Total cost per km (median)", f"₹{ta:.2f}", f"₹{tb:.2f}", ("−" if tb < ta else "+") + f"₹{abs(tb - ta):.2f}" if abs(tb - ta) >= 0.005 else "", f["total_tone"]))
    rows.append(row("Range, new pack", f"{f['new_a']:.0f} km", f"{f['new_b']:.0f} km", _signed(f["new_b"] - f["new_a"], 0, " km"), _tone(f["new_b"] - f["new_a"], 0.5)))
    rows.append(row(f"Range at replacement ({sa.threshold * 100:g} % health)", f"{f['ra']:.0f} km", f"{f['rb']:.0f} km", _signed(f["rb"] - f["ra"], 0, " km"), f["range_tone"]))
    rows.append(row("Range the route needs", f"{f['need']:.0f} km", f"{route_need_km(sb):.0f} km"))
    rows.append(row("Share of loss from waiting (calendar ageing)", f"{(_val(pa.driver_split.calendar_share) or 0) * 100:.0f} %", f"{(_val(pb.driver_split.calendar_share) or 0) * 100:.0f} %"))
    if f["later"] is not None:
        rows.append(row("Bus B outlasts Bus A in", "", "", f"{round(f['later'] * 100)} % of runs"))
    if f["money"] is not None:
        rows.append(row("Pack price spread over life, per bus a year", "", "", ("+" if f["money"] > 0 else "−") + _rupees(abs(f["money"])), f["money_tone"]))
    story += [P("Side by side", S["h2"]), _grid(rows, [FULL * 0.40, FULL * 0.20, FULL * 0.20, FULL * 0.20])]

    limits = ["Nothing here has been checked against a battery pack in service. Capacity comes from published laboratory cell models; every scenario input is an assumption or your own figure.",
              "The 10th to 90th percentile spread is the difference between two published cell models plus assumptions. It is not a statistical confidence interval.",
              "Range uses usable energy times battery health divided by energy use. Air conditioning, season and temperature effects on range are not modelled.",
              ("Battery cost per km is the pack price divided by the kilometres driven until replacement; electricity is energy per km over charger efficiency times the published Maharashtra tariff, with the time you charge shifting the energy charge. Both ignore interest, inflation and resale value; electricity also leaves out duty, the fuel adjustment charge, taxes and power-factor penalties, and holds today's tariff flat."
               if f["elec"] else "Cost per km is the pack price divided by the kilometres driven until replacement. It ignores interest, inflation, resale value and the cost of charging."),
              "Money figures spread the pack price evenly over its median life. They are undiscounted and cover the first pack only."]
    box = Table([[P("What this report cannot tell you", S["cardh"])]] + [[P(f'<font color="{HEX(WARN)}">•</font>  ' + t, S["note"])] for t in limits], colWidths=[FULL])
    box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), blend(WARN, BG, 0.07)), ("BOX", (0, 0), (-1, -1), 0.7, blend(WARN, BG, 0.45)), ("ROUNDEDCORNERS", [10, 10, 10, 10]),
                             ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                             ("TOPPADDING", (0, 0), (-1, 0), 9), ("BOTTOMPADDING", (0, -1), (-1, -1), 9)]))
    story += [Spacer(1, 12), KeepTogether([box])]

    # -- notes and inputs -------------------------------------------------------------------------------------------------------------------
    tidy = lambda w: w.replace(" (see extrapolation_reasons)", "")
    ext = lambda p: [f"Outside the tested conditions: {r}" for r in p.replacement.extrapolation_reasons]
    wa = [tidy(w) for w in [*pa.warnings, *ext(pa)] if w != DISCLAIMER]
    wb = [tidy(w) for w in [*pb.warnings, *ext(pb)] if w != DISCLAIMER and tidy(w) not in wa]
    wc = [tidy(w) for w in [*cmp.warnings, *cmp.notes] if w != DISCLAIMER and tidy(w) not in wa and tidy(w) not in wb]
    story += [PageBreak(), P("Notes from the model", S["h2"])]
    for title, ws in (("Returned for Bus A", wa), ("Apply to Bus B only", wb), ("On the comparison", wc)):
        if ws:
            story += [P(col(VOLT, title.upper()), S["head"]), Spacer(1, 2)] + [P(f'<font color="{HEX(T3)}">•</font>  ' + escape(w), S["note"]) for w in ws] + [Spacer(1, 7)]

    rows = [[P("INPUT", S["head"]), P("BUS A", S["head"]), P("BUS B", S["head"])]]
    tariffs = {sa.electricity_tariff, sb.electricity_tariff}
    for key, label, fmt in FIELDS:
        if (key == "electricity_custom_inr_per_kwh" and "custom" not in tariffs) or (key == "charger_efficiency" and tariffs == {"none"}):
            continue  # inputs that do nothing in this comparison stay off the page
        va, vb = getattr(sa, key), getattr(sb, key)
        fm = lambda v: "not set" if v is None else fmt(v)
        rows.append([P(label, S["cell"]), P(fm(va), S["cell"]), P(fm(vb) if va == vb else col(VOLT, f"<b>{fm(vb)}</b>"), S["cell"])])
    story += [KeepTogether([P("Every input", S["h2"]), _grid(rows, [FULL * 0.44, FULL * 0.28, FULL * 0.28], pad=3.4 if tariffs == {"none"} else 2.7), Spacer(1, 4),
                            P("Highlighted in the Bus B column: it differs from Bus A.", S["tiny"])])]

    doc.build(story, onFirstPage=_page, onLaterPages=_page, canvasmaker=_Numbered)
    return buf.getvalue()


def filename(now: datetime | None = None) -> str:
    return f"pack-horizon-bus-comparison-{(now or datetime.now(timezone.utc)).strftime('%Y%m%d')}.pdf"
