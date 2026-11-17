import { useId } from 'react'
import { useTween } from '../../lib/useTween'
import { atYear } from '../../lib/format'
import { useYear } from '../../state/YearContext'
import { Grid, path, Tip, X, XAxis, Y, yearAt, G, type Box } from './geometry'

const H = { w: 700, h: 280 }
type Props = { prob: number[]; repYears: [number | null, number | null, number | null]; xMax: number }

export function ProbChart({ prob, repYears, xMax }: Props) {
  const [a] = useTween([prob])
  const { year, setYear, hover, setHover } = useYear()
  const id = useId().replace(/:/g, '')
  const b: Box = { ...H, xMax }
  const yr = hover ?? year, pv = atYear(a, yr)
  const marks: [string, number | null, number][] = [['p10', repYears[0], 10], ['p50', repYears[1], 50], ['p90', repYears[2], 90]]
  const line = path(b, a, 0, 100)
  return (
    <svg className="ch" viewBox={`0 0 ${H.w} ${H.h}`} role="img" aria-label="Chance that the replacement line has been reached by each year"
      onPointerMove={(e) => setHover(yearAt(b, e.clientX, e.currentTarget.getBoundingClientRect()))} onPointerLeave={() => setHover(null)} onClick={() => hover != null && setYear(hover)} style={{ cursor: 'crosshair' }}>
      <defs><linearGradient id={`p${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FACC15" stopOpacity=".32" /><stop offset="1" stopColor="#FACC15" stopOpacity="0" /></linearGradient></defs>
      <Grid b={b} ticks={[0, 25, 50, 75, 100]} lo={0} hi={100} fmt={(t) => `${t}%`} />
      <XAxis b={b} />
      <path d={`${line}L${X(b, Math.min(xMax, (a.length - 1) / 12))} ${Y(b, 0, 0, 100)}L${X(b, 0)} ${Y(b, 0, 0, 100)}Z`} fill={`url(#p${id})`} />
      <path d={line} fill="none" stroke="#FACC15" strokeWidth="2.8" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px rgba(250,204,21,.45))' }} />
      {marks.map(([n, v, p]) => v != null && v <= xMax ? (
        <g key={n}><line x1={X(b, v)} x2={X(b, v)} y1={Y(b, p, 0, 100)} y2={H.h - G.B} stroke="#fff" strokeOpacity=".5" strokeDasharray="3 4" /><circle cx={X(b, v)} cy={Y(b, p, 0, 100)} r="5" fill="#fff" stroke="#09090B" strokeWidth="2" />
          <text x={X(b, v) + (n === 'p10' ? -10 : 10)} y={Y(b, p, 0, 100) + (n === 'p10' ? -9 : 18)} textAnchor={n === 'p10' ? 'end' : 'start'} style={{ fill: '#fff' }}>{n} · {v.toFixed(1)} y</text></g>
      ) : null)}
      <line x1={X(b, yr)} x2={X(b, yr)} y1={G.T} y2={H.h - G.B} stroke="rgba(255,255,255,.55)" />
      <circle cx={X(b, yr)} cy={Y(b, pv, 0, 100)} r="6" fill="#FACC15" stroke="#09090B" strokeWidth="2.5" />
      {hover != null && <Tip b={b} x={X(b, yr)} y={Y(b, pv, 0, 100)} lines={[[`Year ${yr.toFixed(1)}`], [`${pv.toFixed(0)}% reached the line`, '#FACC15']]} />}
    </svg>
  )
}
