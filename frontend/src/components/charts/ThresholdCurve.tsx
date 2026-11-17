import type { CostBand } from '../../lib/costcalc'

const W = 560, H = 230, L = 50, R = 16, T = 16, B = 36
const niceStep = (v: number) => { const m = 10 ** Math.floor(Math.log10(v)), f = v / m; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * m }
export type LinePoint = CostBand & { pct: number }
type Props = { pts: LinePoint[]; curPct: number; optPct: number | null; needPct: number | null; ghostPct?: number | null }

/** Cost per km against the replacement line. A lower line means a longer life and a lower cost, so the curve only falls to the left; the shaded part is where the
 *  range left at replacement is below what the route needs. The ring marks the lowest line that still covers the route. */
export function ThresholdCurve({ pts, curPct, optPct, needPct, ghostPct }: Props) {
  const lo = pts[0].pct, hi = pts[pts.length - 1].pct
  const rawMax = Math.max(...pts.map((p) => p.p90), 0.01) * 1.05
  const stepY = niceStep(rawMax / 4), yMax = stepY * Math.ceil(rawMax / stepY)
  const x = (v: number) => L + ((W - L - R) * (v - lo)) / (hi - lo)
  const y = (c: number) => T + ((H - T - B) * (yMax - c)) / yMax
  const line = (k: 'p10' | 'p50' | 'p90') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.pct).toFixed(1)} ${y(p[k]).toFixed(1)}`).join('')
  const area = line('p90') + [...pts].reverse().map((p) => `L${x(p.pct).toFixed(1)} ${y(p.p10).toFixed(1)}`).join('') + 'Z'
  const at = (v: number) => pts.reduce((a, b) => (Math.abs(b.pct - v) < Math.abs(a.pct - v) ? b : a))
  const cur = at(curPct), opt = optPct == null ? null : at(optPct)
  const shortTo = needPct == null ? null : Math.min(hi, Math.max(lo, needPct))
  const yTicks = Array.from({ length: Math.round(yMax / stepY) + 1 }, (_, i) => i * stepY)
  const xTicks = [lo, lo + (hi - lo) / 3, lo + ((hi - lo) * 2) / 3, hi].map(Math.round)
  const label = `Cost per kilometre against the replacement line, from ${Math.round(lo)} to ${Math.round(hi)} percent health. At ${Math.round(curPct)} percent the median is ₹${cur.p50.toFixed(2)} per km, from ₹${cur.p10.toFixed(2)} to ₹${cur.p90.toFixed(2)}.${opt ? ` The lowest line that still covers your route is ${Math.round(opt.pct)} percent, at ₹${opt.p50.toFixed(2)} per km.` : ' No line in this range leaves enough range for your route.'}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="tcurve">
      {yTicks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,.07)" /><text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11.5" fill="var(--t3)">₹{+t.toFixed(2)}</text></g>)}
      {xTicks.map((t) => <text key={t} x={x(t)} y={H - 12} textAnchor="middle" fontSize="11.5" fill="var(--t3)">{t} %</text>)}
      <text x={W - R} y={H - 1} textAnchor="end" fontSize="11" fill="var(--t3)">replace at this health</text>
      {shortTo != null && shortTo > lo && <g><rect x={x(lo)} y={T} width={x(shortTo) - x(lo)} height={H - T - B} fill="rgba(245,158,11,.12)" /><text x={x(lo) + 6} y={T + 13} fontSize="11" fill="#f59e0b">too little range for your route</text></g>}
      <path d={area} fill="rgba(250,204,21,.16)" />
      <path d={line('p10')} fill="none" stroke="rgba(250,204,21,.45)" strokeDasharray="4 4" />
      <path d={line('p90')} fill="none" stroke="rgba(250,204,21,.45)" strokeDasharray="4 4" />
      <path d={line('p50')} fill="none" stroke="var(--volt)" strokeWidth="2.4" />
      {opt && <g><line x1={x(opt.pct)} x2={x(opt.pct)} y1={T} y2={H - B} stroke="#fff" strokeOpacity=".4" strokeDasharray="2 5" /><circle cx={x(opt.pct)} cy={y(opt.p50)} r="6" fill="#09090b" stroke="#fff" strokeWidth="1.8" /></g>}
      {ghostPct != null && ghostPct >= lo && ghostPct <= hi && <circle cx={x(ghostPct)} cy={y(at(ghostPct).p50)} r="6" fill="none" stroke="#fff" strokeWidth="1.6" strokeDasharray="3 3" />}
      <circle cx={x(cur.pct)} cy={y(cur.p50)} r="7" fill="var(--volt)" stroke="#09090b" strokeWidth="2.5" style={{ filter: 'drop-shadow(0 0 8px rgba(250,204,21,.7))' }} />
    </svg>
  )
}
