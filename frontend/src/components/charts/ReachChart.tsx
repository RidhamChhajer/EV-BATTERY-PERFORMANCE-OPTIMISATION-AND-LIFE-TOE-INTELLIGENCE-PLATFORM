import { atYear } from '../../lib/format'
import { useFit } from '../../lib/useFit'
import { useYear } from '../../state/YearContext'
import { Grid, path, Tip, X, XAxis, Y, yearAt, G, type Box } from './geometry'

const BASE = { w: 700, h: 260 }
type Props = { newKm: number; p50: number[]; p10: number[]; needKm: number; xMax: number; ghost?: { newKm: number; p50: number[] } | null }
const km = (newKm: number, pct: number[]) => pct.map((r) => (newKm * r) / 100)

/** Range of a full charge as the pack ages, against what the route needs. Where the median line drops below the need, the chart shades the shortfall. */
export function ReachChart({ newKm, p50, p10, needKm, xMax, ghost }: Props) {
  const { year, setYear, hover, setHover } = useYear()
  const { ref, W } = useFit(BASE.w, BASE.h)
  const H = { w: W, h: BASE.h }
  const b: Box = { ...H, xMax }
  const top = Math.max(50, Math.ceil((Math.max(newKm, needKm) * 1.05) / 50) * 50)
  const m = km(newKm, p50), c = km(newKm, p10)
  const yr = hover ?? year, ym = atYear(m, yr), yc = atYear(c, yr)
  const cross = m.findIndex((v) => v < needKm - 1e-9)
  const ticks = [0, top / 4, top / 2, (top * 3) / 4, top].map((t) => Math.round(t))
  return (
    <svg ref={ref} className="ch" viewBox={`0 0 ${H.w} ${H.h}`} role="img" aria-label={`Range on a full charge by pack age against the ${Math.round(needKm)} km the route needs. Median ${Math.round(ym)} km at year ${yr.toFixed(1)}, cautious ${Math.round(yc)} km.`}
      onPointerMove={(e) => setHover(yearAt(b, e.clientX, e.currentTarget.getBoundingClientRect()))} onPointerLeave={() => setHover(null)} onClick={() => hover != null && setYear(hover)} style={{ cursor: 'crosshair', height: `clamp(190px, calc(89vh - 490px), ${Math.round(BASE.h * 1.15)}px)` }}>
      <Grid b={b} ticks={ticks} lo={0} hi={top} fmt={(t) => `${t}`} />
      <XAxis b={b} />
      {cross >= 0 && <rect x={X(b, cross / 12)} y={G.T} width={Math.max(0, X(b, Math.min(xMax, (m.length - 1) / 12)) - X(b, cross / 12))} height={H.h - G.T - G.B} fill="rgba(251,146,60,.12)" />}
      <line x1={G.L} x2={H.w - G.R} y1={Y(b, needKm, 0, top)} y2={Y(b, needKm, 0, top)} stroke="#fff" strokeOpacity=".7" strokeDasharray="4 5" />
      <text x={H.w - G.R - 4} y={Y(b, needKm, 0, top) - 7} textAnchor="end" style={{ fill: '#fff' }}>route + 20 % · {Math.round(needKm)} km</text>
      <path d={path(b, c, 0, top)} fill="none" stroke="rgba(250,204,21,.55)" strokeWidth="1.8" strokeDasharray="5 4" />
      <path d={path(b, m, 0, top)} fill="none" stroke="#FACC15" strokeWidth="2.8" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px rgba(250,204,21,.45))' }} />
      {ghost && <path d={path(b, km(ghost.newKm, ghost.p50), 0, top)} fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="2 5" />}
      <line x1={X(b, yr)} x2={X(b, yr)} y1={G.T} y2={H.h - G.B} stroke="rgba(255,255,255,.55)" />
      <circle cx={X(b, yr)} cy={Y(b, ym, 0, top)} r="6" fill="#FACC15" stroke="#09090B" strokeWidth="2.5" />
      {hover != null && <Tip b={b} x={X(b, yr)} y={Y(b, ym, 0, top)} lines={[[`Year ${yr.toFixed(1)}`], [`${Math.round(ym)} km median`, '#FACC15'], [`${Math.round(yc)} km cautious`, '#D4D4D8']]} />}
    </svg>
  )
}
