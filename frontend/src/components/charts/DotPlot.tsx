import { useFit } from '../../lib/useFit'
import { quantileDots } from '../../lib/planner'
import { useYear } from '../../state/YearContext'

const BASE_W = 700, L = 50, R = 16, TOP = 36, ROW = 170, GHOST = 120, GAP = 18, AXIS = 52
type Props = { cdf: number[]; ghost?: number[] | null; xMax: number; horizonYears: number; marks: [number | null, number | null, number | null] }

/** Fifty dots, each one 2 % of the model's runs, placed where that run reaches the replacement line. Filled = already there at the chosen year. */
export function DotPlot({ cdf, ghost, xMax, horizonYears, marks }: Props) {
  const { year, setYear, hover, setHover } = useYear()
  const yr = hover ?? year
  const H = TOP + ROW + (ghost ? GAP + GHOST : 0) + AXIS
  const { ref, W } = useFit(BASE_W, H)
  const nb = Math.ceil(xMax * 2), cols = nb + 3, cw = (W - L - R) / cols
  const px = (y: number) => L + y * 2 * cw
  const afterX = L + (nb + 2) * cw
  const rows = [{ dots: quantileDots(cdf), h: ROW, top: TOP, ghost: false }, ...(ghost ? [{ dots: quantileDots(ghost), h: GHOST, top: TOP + ROW + GAP, ghost: true }] : [])]
  const place = (dots: (number | null)[]) => {
    const count: number[] = Array(nb + 1).fill(0)
    return dots.map((m) => {
      const inside = m != null && m / 12 <= xMax
      const bin = inside ? Math.min(nb - 1, Math.floor(m / 6)) : nb
      return { m, inside, bin, k: count[bin]++ }
    })
  }
  const placed = rows.map((r) => place(r.dots))
  const maxIn = Math.max(1, ...placed.flatMap((p) => p.filter((d) => d.inside).map((d) => d.k + 1)))
  const maxAfter = Math.max(0, ...placed.map((p) => p.filter((d) => !d.inside).length))
  const minH = Math.min(...rows.map((x) => x.h))
  // the "after" pile is laid out as a small grid so it never forces the other dots to shrink
  let r = Math.max(2.5, Math.min(cw / 2 - 1.2, minH / (2.05 * maxIn), 10))
  const grid = (rr: number) => ({ cols: Math.max(1, Math.floor((2 * cw) / (2 * rr + 1))), per: Math.max(1, Math.floor((minH - 4) / (2 * rr + 0.8))) })
  while (r > 2.5 && grid(r).cols * grid(r).per < maxAfter) r -= 0.5
  const g = grid(r)
  const reached = placed[0].filter((d) => d.m != null && d.m / 12 <= yr).length
  const afterN = placed[0].filter((d) => !d.inside).length
  const afterLabel = xMax >= horizonYears - 1e-9 ? 'beyond the forecast' : `after year ${xMax}`
  const step = xMax > 10 ? 3 : 2, ticks: number[] = []
  for (let y = 0; y <= xMax; y += step) ticks.push(y)
  const at = (clientX: number, rect: DOMRect) => Math.max(0, Math.min(xMax, ((((clientX - rect.left) / rect.width) * W - L) / (2 * cw))))
  return (
    <svg ref={ref} className="ch dots" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Fifty dots, each one 2 percent of the model's runs, placed by the year that run reaches the replacement line. ${reached} of 50 have reached it by year ${yr.toFixed(1)}. ${afterN} are ${afterLabel}.`}
      onPointerMove={(e) => setHover(at(e.clientX, e.currentTarget.getBoundingClientRect()))} onPointerLeave={() => setHover(null)}
      onClick={() => hover != null && setYear(hover)} style={{ cursor: 'crosshair', height: `clamp(300px, calc(100vh - 360px), ${Math.round(H * 1.15)}px)` }}>
      {rows.map((row, ri) => {
        const base = row.top + row.h
        return (
          <g key={ri}>
            <line x1={L} x2={W - R} y1={base} y2={base} stroke="rgba(255,255,255,.14)" />
            <text x={L} y={row.top + 12} style={{ fill: row.ghost ? '#fff' : '#8E8E98' }}>{row.ghost ? 'with your change' : 'your scenario'}</text>
            {placed[ri].map((d, i) => {
              const col = d.inside ? 0 : Math.floor(d.k / g.per), kk = d.inside ? d.k : d.k % g.per
              const cx = d.inside ? L + (d.bin + 0.5) * cw : afterX + (col - (g.cols - 1) / 2) * (2 * r + 1), cy = base - r - 1 - kk * (2 * r + 0.8)
              const on = d.m != null && d.m / 12 <= yr
              return row.ghost
                ? <circle key={i} cx={cx} cy={cy} r={r - 0.8} fill="none" stroke="#fff" strokeWidth="1.5" strokeOpacity={on ? 1 : 0.5} strokeDasharray={on ? undefined : '2 2.5'} />
                : <circle key={i} cx={cx} cy={cy} r={r} fill={on ? '#FACC15' : 'rgba(250,204,21,.16)'} stroke={on ? '#FACC15' : 'rgba(250,204,21,.4)'} strokeWidth="1" style={on ? { filter: 'drop-shadow(0 0 4px rgba(250,204,21,.55))' } : undefined} />
            })}
          </g>
        )
      })}
      {marks.map((v, i) => v != null && v <= xMax ? (
        <g key={i}><line x1={px(v)} x2={px(v)} y1={TOP + 18} y2={TOP + ROW} stroke="#fff" strokeOpacity=".5" strokeDasharray="3 4" />
          <text x={px(v)} y={i === 1 ? 14 : 28} textAnchor="middle" style={{ fill: '#fff' }}>{['p10', 'p50', 'p90'][i]} · {v.toFixed(1)} y</text></g>
      ) : null)}
      <line x1={px(yr)} x2={px(yr)} y1={TOP} y2={TOP + ROW + (ghost ? GAP + GHOST : 0)} stroke="rgba(255,255,255,.55)" />
      {ticks.map((t) => <text key={t} x={px(t)} y={H - 20} textAnchor="middle">{t}</text>)}
      <text x={L - 9} y={H - 20} textAnchor="end" style={{ fill: '#8E8E98' }}>years</text>
      <text x={W - R} y={H - 4} textAnchor="end" style={{ fill: '#8E8E98' }}>{afterN} {afterN === 1 ? 'run' : 'runs'} {afterLabel}</text>
      <line x1={L + (nb + 1) * cw} x2={L + (nb + 1) * cw} y1={TOP + 40} y2={TOP + ROW} stroke="rgba(255,255,255,.1)" strokeDasharray="2 5" />
    </svg>
  )
}
