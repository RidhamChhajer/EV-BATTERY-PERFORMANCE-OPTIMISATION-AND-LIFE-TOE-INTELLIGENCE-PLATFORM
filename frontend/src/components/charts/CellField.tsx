import { cellLevel, lossBands, type AgeBand } from '../../lib/ageCells'
import { healthCss } from '../../lib/colors'

const COLS = 16, ROWS = 6, P = 46, R = 17, SW = 6.5
export const CAL = '#71717a', CYC = '#b45309'

/** A pack as 96 rings. Lit arc = capacity left, grey = lost to waiting (calendar ageing), brown = lost to cycling; the tick is the replacement line.
 *  The model gives one health curve with a spread, so cells are scattered inside that spread: it is a picture of the model, not per-cell data. */
export function CellField({ band, calendarShare, linePct }: { band: AgeBand; calendarShare: number; linePct: number }) {
  const tick = linePct / 100 * 2 * Math.PI
  return (
    <svg className="cf" viewBox={`0 0 ${COLS * P} ${ROWS * P}`} aria-hidden="true">
      {Array.from({ length: COLS * ROWS }, (_, i) => {
        const cx = (i % COLS) * P + P / 2, cy = Math.floor(i / COLS) * P + P / 2
        const lvl = cellLevel(i, band), { calendar, cycling } = lossBands(lvl, calendarShare)
        const lit = lvl * 100, cal = calendar * 100, cyc = cycling * 100
        const arc = (len: number, from: number, stroke: string) => len > 0.05 && <circle cx={cx} cy={cy} r={R} fill="none" stroke={stroke} strokeWidth={SW} pathLength={100} strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={-from} transform={`rotate(-90 ${cx} ${cy})`} />
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={SW} />
            {arc(lit, 0, healthCss(lvl * 100, linePct))}
            {arc(cal, lit, CAL)}
            {arc(cyc, lit + cal, CYC)}
            <line x1={cx + (R - 5) * Math.sin(tick)} y1={cy - (R - 5) * Math.cos(tick)} x2={cx + (R + 5) * Math.sin(tick)} y2={cy - (R + 5) * Math.cos(tick)} stroke="#fff" strokeOpacity=".55" strokeWidth="1.4" />
          </g>
        )
      })}
    </svg>
  )
}
