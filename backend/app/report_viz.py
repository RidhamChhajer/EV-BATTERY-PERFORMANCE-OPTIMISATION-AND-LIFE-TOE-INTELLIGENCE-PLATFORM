"""Drawings for the comparison report, in the app's own look: Obsidian Volt (near-black, volt yellow), Lexend for numbers and headings, Manrope for text.

Everything is vector (reportlab shapes), so it stays sharp at any zoom and prints cleanly. Each function returns a `Drawing` that the report places on a page.
Colour carries meaning the same way it does in the app: volt yellow is Bus A and "healthy/better", white is Bus B, orange is the replacement line and warnings, red is worse.
"""
from __future__ import annotations

import math
import os

import numpy as np
from reportlab.graphics.shapes import Circle, Drawing, Group, Line, Polygon, PolyLine, Rect, String
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ---- palette (frontend/src/styles/global.css :root) -------------------------------------------------------------------------------------
BG, S1, S2, S3 = colors.HexColor("#09090B"), colors.HexColor("#141417"), colors.HexColor("#1C1C20"), colors.HexColor("#27272A")
LINE, LINE2 = colors.HexColor("#3F3F46"), colors.HexColor("#242428")
TEXT, T2, T3 = colors.HexColor("#FFFFFF"), colors.HexColor("#B4B4BC"), colors.HexColor("#8E8E98")
VOLT, WARN, BAD = colors.HexColor("#FACC15"), colors.HexColor("#FB923C"), colors.HexColor("#F87171")
INK = colors.HexColor("#09090B")


def blend(fg, bg, a: float):
    """A solid colour that looks like `fg` laid over `bg` at opacity `a` (PDF viewers differ on transparency, solid colours never do)."""
    return colors.Color(bg.red + (fg.red - bg.red) * a, bg.green + (fg.green - bg.green) * a, bg.blue + (fg.blue - bg.blue) * a)


# ---- fonts -------------------------------------------------------------------------------------------------------------------------------
FONT_DIR = os.path.join(os.path.dirname(__file__), "fonts")
_ready = False


def register_fonts() -> None:
    """Lexend (headings, big numbers) and Manrope (text), the same families as the app. OFL-licensed files live in backend/app/fonts."""
    global _ready
    if _ready:
        return
    for name, file in (("LX", "Lexend-Medium.ttf"), ("LX-SB", "Lexend-SemiBold.ttf"), ("MR", "Manrope-Regular.ttf"), ("MR-B", "Manrope-Bold.ttf")):
        pdfmetrics.registerFont(TTFont(name, os.path.join(FONT_DIR, file)))
    pdfmetrics.registerFontFamily("MR", normal="MR", bold="MR-B", italic="MR", boldItalic="MR-B")
    pdfmetrics.registerFontFamily("LX", normal="LX", bold="LX-SB", italic="LX", boldItalic="LX-SB")
    _ready = True


def tw(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def _txt(d, x, y, s, font="MR", size=7.5, fill=T3, anchor="start"):
    d.add(String(x, y, s, fontName=font, fontSize=size, fillColor=fill, textAnchor=anchor))


# ---- health colour ramp (port of frontend/src/lib/colors.ts healthRGB) ------------------------------------------------------------------
_HEALTHY, _LINE, _WORN = (250, 204, 21), (249, 115, 22), (239, 68, 68)


def health_color(h: float, line: float = 80.0):
    mix = lambda a, b, t: tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
    clamp = lambda x: max(0.0, min(1.0, x))
    r, g, b = mix(_HEALTHY, _LINE, clamp((100 - h) / (100 - line))) if h >= line else mix(_LINE, _WORN, clamp((line - h) / 25))
    return colors.Color(r / 255, g / 255, b / 255)


def series_at(months, series, year: float) -> float:
    return float(np.interp(year * 12, months, series))


def _logo(d, x, y, s=22):
    d.add(Rect(x, y, s, s, rx=s * 0.3, ry=s * 0.3, fillColor=VOLT, strokeColor=None))
    k = s / 20.0
    pts = [(11.5, 3.5), (5.5, 11.2), (9.4, 11.2), (8.4, 16.6), (14.6, 8.4), (10.6, 8.4)]
    d.add(Polygon([c for px, py in pts for c in (x + px * k, y + (20 - py) * k)], fillColor=INK, strokeColor=None))


def brand_mark(size: float = 22) -> Drawing:
    d = Drawing(size, size)
    _logo(d, 0, 0, size)
    return d


# ---- the bus snapshot --------------------------------------------------------------------------------------------------------------------
COLS, ROWS = 24, 4                     # 96 cells, the same count as the app's pack


def _cell_u(i: int) -> float:
    """A fixed spread in (0, 1) per cell (golden-ratio sequence), so Bus A and Bus B scatter the same way and only the model's numbers differ."""
    return (0.5 + i * 0.6180339887498949) % 1.0


def cell_health(p10: float, p50: float, p90: float, u: float) -> float:
    return p10 + (p50 - p10) * (u / 0.5) if u < 0.5 else p50 + (p90 - p50) * ((u - 0.5) / 0.5)


def bus_snapshot(w: float, band: tuple[float, float, float], line_pct: float, accent) -> Drawing:
    """A cutaway of a 12 m e-bus with its 96 battery cells coloured by health at the snapshot year, scattered inside the model's 10th to 90th percentile range."""
    h = 112.0
    d = Drawing(w, h)
    bx, by, bw, bh = 2.0, 16.0, w - 4, 90.0
    d.add(Rect(bx, by, bw, bh, rx=11, ry=11, fillColor=S3, strokeColor=LINE, strokeWidth=0.8))
    # windows along the top, a taller windscreen at the front (right)
    wy, wh = by + bh - 27, 17
    n = 8
    gap = 4.0
    ww = (bw - 70) / n - gap
    for i in range(n):
        d.add(Rect(bx + 14 + i * (ww + gap), wy, ww, wh, rx=3, ry=3, fillColor=blend(accent, S3, 0.16), strokeColor=None))
    d.add(Rect(bx + bw - 44, wy - 4, 34, wh + 8, rx=5, ry=5, fillColor=blend(accent, S3, 0.22), strokeColor=None))
    # battery pack cutaway
    px, py, pw, ph = bx + 18, by + 11, bw - 36 - 30, 40.0
    d.add(Rect(px - 4, py - 4, pw + 8, ph + 8, rx=5, ry=5, fillColor=BG, strokeColor=LINE2, strokeWidth=0.6))
    cw, ch = pw / COLS, ph / ROWS
    for i in range(COLS * ROWS):
        r, c = divmod(i, COLS)
        hc = cell_health(*band, _cell_u(i * 7 + 3))
        d.add(Rect(px + c * cw + 0.7, py + (ROWS - 1 - r) * ch + 0.7, cw - 1.4, ch - 1.4, rx=1.4, ry=1.4, fillColor=health_color(hc, line_pct), strokeColor=None))
    # wheels
    for cx in (bx + 58, bx + bw - 66):
        d.add(Circle(cx, by - 1, 10, fillColor=BG, strokeColor=LINE, strokeWidth=1.2))
        d.add(Circle(cx, by - 1, 4, fillColor=S3, strokeColor=None))
    return d


def health_scale(w: float, line_pct: float) -> Drawing:
    """The colour key for the cells: worn, at the replacement line, healthy."""
    d = Drawing(w, 22)
    steps = 40
    x0, x1 = 0.0, w
    for i in range(steps):
        h = 100 - (100 - (line_pct - 12)) * (i / (steps - 1))
        d.add(Rect(x0 + (x1 - x0) * i / steps, 12, (x1 - x0) / steps + 0.4, 5, fillColor=health_color(h, line_pct), strokeColor=None))
    _txt(d, 0, 2, "healthy", size=6.8)
    _txt(d, w / 2, 2, f"replacement line {line_pct:g} %", size=6.8, anchor="middle")
    _txt(d, w, 2, "past the line", size=6.8, anchor="end")
    return d


# ---- charts ------------------------------------------------------------------------------------------------------------------------------

def _frame(d, L, B, W, H, ymin, ymax, step, xmax, xstep, xlabel, ylabel):
    d.add(Rect(L, B, W - L, H - B, fillColor=S1, strokeColor=LINE2, strokeWidth=0.6, rx=4, ry=4))
    v = ymin
    while v <= ymax + 1e-9:
        y = B + (H - B) * (v - ymin) / (ymax - ymin)
        d.add(Line(L, y, W, y, strokeColor=LINE2, strokeWidth=0.4))
        _txt(d, L - 5, y - 2.5, f"{v:g}", size=7, anchor="end")
        v += step
    for yr in range(0, int(xmax) + 1, xstep):
        _txt(d, L + (W - L) * yr / xmax, B - 11, str(yr), size=7, anchor="middle")
    _txt(d, L + (W - L) / 2, B - 22, xlabel, size=7, anchor="middle")
    _txt(d, 0, H + 8, ylabel, size=7)


def health_chart(pa, pb, w: float, h: float, val, arr) -> Drawing:
    """Health over time. Bus A: volt line with its 10th to 90th percentile band. Bus B: white dashed. The orange line is where a pack is replaced.
    Where each bus crosses it is marked, and the gap between the two is labelled in months."""
    months = pa.replacement.months
    get = lambda p, k: [v * 100 for v in arr(getattr(p.replacement, f"retention_{k}"))]
    ya, yb = {k: get(pa, k) for k in ("p10", "p50", "p90")}, {k: get(pb, k) for k in ("p10", "p50", "p90")}
    meds = [val(pa.replacement.months_p50), val(pb.replacement.months_p50)]
    xmax = min(months[-1] / 12, 15 if any(m is None or m / 12 > 9 for m in meds) else 10)
    n = int(xmax * 12)
    thr = pa.scenario.threshold * 100
    lo = min(min(ya["p10"][: n + 1]), min(yb["p50"][: n + 1]), thr)
    ymin = max(0.0, 5 * int((lo - 11) // 5))
    L, B, Wd, Hd = 30.0, 30.0, w - 6, h - 20
    d = Drawing(w, h)
    _frame(d, L, B, Wd, Hd, ymin, 100, 5 if 100 - ymin <= 30 else 10, xmax, 1 if xmax <= 10 else 2, "years in service", "% of new capacity left")
    X = lambda yr: L + (Wd - L) * yr / xmax
    Y = lambda v: B + (Hd - B) * (v - ymin) / (100 - ymin)
    band = [c for i in range(n + 1) for c in (X(months[i] / 12), Y(ya["p90"][i]))] + [c for i in range(n, -1, -1) for c in (X(months[i] / 12), Y(ya["p10"][i]))]
    d.add(Polygon(band, fillColor=blend(VOLT, S1, 0.16), strokeColor=None))
    d.add(Line(L, Y(thr), Wd, Y(thr), strokeColor=WARN, strokeWidth=0.9, strokeDashArray=[3, 2.5]))
    _txt(d, L + 8, Y(thr) - 10, f"replacement line {thr:g} %", size=7, fill=WARN)
    d.add(PolyLine([c for i in range(n + 1) for c in (X(months[i] / 12), Y(ya["p50"][i]))], strokeColor=VOLT, strokeWidth=2.0))
    d.add(PolyLine([c for i in range(n + 1) for c in (X(months[i] / 12), Y(yb["p50"][i]))], strokeColor=TEXT, strokeWidth=1.7, strokeDashArray=[5, 3]))
    pts = []
    for name, m, c in (("A", meds[0], VOLT), ("B", meds[1], TEXT)):
        if m is not None and m / 12 <= xmax:
            x = X(m / 12)
            d.add(Line(x, Y(thr) - 5, x, Y(thr) - 24, strokeColor=blend(c, S1, 0.5), strokeWidth=0.6, strokeDashArray=[1.5, 1.5]))
            d.add(Circle(x, Y(thr), 4.2, fillColor=BG, strokeColor=c, strokeWidth=1.6))
            pts.append((name, m, x, c))
        elif m is None:
            _txt(d, Wd - 6, Y(thr) - 14 - (0 if name == "A" else 11), f"Bus {name}: beyond the forecast", size=7, fill=VOLT if name == "A" else TEXT, anchor="end")
    # below the line: a bracket for the gap between the two crossings, and each bus's crossing time under it
    yy = Y(thr) - 24
    if len(pts) == 2:
        (_, ma, xa, _), (_, mb, xb, _) = pts
        gain = mb - ma
        if abs(gain) >= 0.5:
            tone = VOLT if gain > 0 else BAD
            d.add(Line(xa, yy, xb, yy, strokeColor=tone, strokeWidth=1.2))
            for xe in (xa, xb):
                d.add(Line(xe, yy - 3, xe, yy + 3, strokeColor=tone, strokeWidth=1.2))
            _txt(d, (xa + xb) / 2, yy - 12, f"{'+' if gain > 0 else '−'}{abs(gain):.1f} months", font="LX-SB", size=8.5, fill=tone, anchor="middle")
    close = len(pts) == 2 and abs(pts[1][2] - pts[0][2]) < 110
    for k, (name, m, x, c) in enumerate(pts):
        y_lab = yy - 24 - (11 if close and k == 1 else 0)          # under the gap label; stacked when the two crossings are close together
        _txt(d, x, y_lab, f"Bus {name} · {m / 12:.1f} y", font="LX", size=7.5, fill=c, anchor="end" if x + 28 > Wd else "middle")
    return d


def chart_legend(w: float) -> Drawing:
    d = Drawing(w, 14)
    d.add(Line(0, 7, 18, 7, strokeColor=VOLT, strokeWidth=2.0)); _txt(d, 24, 4.5, "Bus A median", font="MR", size=7.8, fill=T2)
    d.add(Rect(100, 3, 18, 8, fillColor=blend(VOLT, BG, 0.22), strokeColor=None)); _txt(d, 124, 4.5, "Bus A, 10th to 90th percentile", size=7.8, fill=T2)
    d.add(Line(262, 7, 280, 7, strokeColor=TEXT, strokeWidth=1.7, strokeDashArray=[5, 3])); _txt(d, 286, 4.5, "Bus B median", size=7.8, fill=T2)
    return d


def timing_chart(pa, pb, w: float, val, horizon_years: float) -> Drawing:
    """When packs reach the replacement line: the bar runs from the earliest tenth to the latest tenth, the dot is the median.
    A bar that runs off the end means the latest tenth are still going after the forecast."""
    h = 112.0
    d = Drawing(w, h)
    L, R = 44.0, w - 10
    xmax = float(math.ceil(horizon_years))
    X = lambda yr: L + (R - L) * min(yr, xmax) / xmax
    for yr in range(0, int(xmax) + 1, 1 if xmax <= 10 else 3):
        d.add(Line(X(yr), 24, X(yr), h - 4, strokeColor=LINE2, strokeWidth=0.4))
        _txt(d, X(yr), 13, str(yr), size=7, anchor="middle")
    _txt(d, R, 1, "years until the pack reaches the replacement line", size=7, anchor="end")
    for row, (name, p, col) in enumerate((("Bus A", pa, VOLT), ("Bus B", pb, TEXT))):
        y = h - 30 - row * 40
        _txt(d, 0, y - 3, name, font="LX", size=8, fill=col)
        m10, m50, m90 = (val(getattr(p.replacement, f"months_{k}")) for k in ("p10", "p50", "p90"))
        d.add(Rect(L, y - 2, R - L, 4, rx=2, ry=2, fillColor=S3, strokeColor=None))
        if m10 is not None:
            x0 = X(m10 / 12)
            x1 = X(m90 / 12) if m90 is not None else R
            d.add(Rect(x0, y - 4, max(2, x1 - x0), 8, rx=4, ry=4, fillColor=blend(col, BG, 0.30), strokeColor=None))
            if m90 is None:
                d.add(Polygon([R, y, R - 6, y + 4, R - 6, y - 4], fillColor=col, strokeColor=None))
        if m50 is not None and m50 / 12 <= xmax:
            d.add(Circle(X(m50 / 12), y, 5, fillColor=col, strokeColor=BG, strokeWidth=1.5))
            _txt(d, X(m50 / 12), y + 10, f"{m50 / 12:.1f} y", font="LX", size=7.5, fill=col, anchor="middle")
        else:
            _txt(d, R - 12, y + 10, "median beyond the forecast", size=7, fill=col, anchor="end")
        if m10 is not None:
            _txt(d, X(m10 / 12) - 2, y - 15, f"{m10 / 12:.1f} y", size=6.8, fill=T3, anchor="end")
        if m90 is not None:
            _txt(d, X(m90 / 12) + 2, y - 15, f"{m90 / 12:.1f} y", size=6.8, fill=T3)
        elif m10 is not None:
            _txt(d, R - 2, y - 15, "latest tenth: beyond the forecast", size=6.8, fill=T3, anchor="end")
    return d


def bars_chart(rows: list[dict], w: float, unit: str, flag: tuple[float, str] | None = None, xmax: float | None = None) -> Drawing:
    """Horizontal bars for A and B. Each row: label, value, colour, optional low/high whisker, optional `ghost` (an outline bar behind, e.g. new-pack range),
    and a value label. `flag` draws a vertical orange line with a caption (the range the route needs)."""
    rh = 30.0
    h = 20 + rh * len(rows) + (16 if flag else 0)
    d = Drawing(w, h)
    L, R = 40.0, w - 56
    top = max([r.get("ghost", 0) or 0 for r in rows] + [r["value"] for r in rows] + [r.get("high", 0) or 0 for r in rows] + [flag[0] if flag else 0]) * 1.08
    xm = xmax or top
    X = lambda v: L + (R - L) * v / xm
    d.add(Line(L, 12, L, h - (16 if flag else 4), strokeColor=LINE, strokeWidth=0.6))
    for i, r in enumerate(rows):
        y = h - (16 if flag else 4) - 20 - i * rh
        _txt(d, 0, y - 3, r["label"], font="LX", size=8, fill=r["color"])
        if r.get("ghost"):
            d.add(Rect(L, y - 7, X(r["ghost"]) - L, 14, rx=3, ry=3, fillColor=None, strokeColor=blend(r["color"], BG, 0.55), strokeWidth=0.8, strokeDashArray=[2, 2]))
        d.add(Rect(L, y - 7, max(2, X(r["value"]) - L), 14, rx=3, ry=3, fillColor=r["color"], strokeColor=None))
        if r.get("low") is not None and r.get("high") is not None:
            ym = y
            d.add(Line(X(r["low"]), ym, X(r["high"]), ym, strokeColor=INK if r["color"] != TEXT else INK, strokeWidth=1.0))
            for v in (r["low"], r["high"]):
                d.add(Line(X(v), ym - 3, X(v), ym + 3, strokeColor=INK, strokeWidth=1.0))
        _txt(d, max(X(r["value"]), X(r.get("high") or 0), X(r.get("ghost") or 0)) + 9, y - 3, r["text"], font="LX-SB", size=8.5, fill=TEXT)
    if flag:
        fx = X(flag[0])
        d.add(Line(fx, 10, fx, h - 14, strokeColor=WARN, strokeWidth=1.1, strokeDashArray=[3, 2.5]))
        _txt(d, fx, h - 10, flag[1], size=7.2, fill=WARN, anchor="middle")
    return d
