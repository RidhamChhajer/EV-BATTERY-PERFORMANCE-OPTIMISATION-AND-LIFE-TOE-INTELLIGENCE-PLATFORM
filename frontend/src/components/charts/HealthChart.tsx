import { useId } from 'react'
import { useTween } from '../../lib/useTween'
import { useYear } from '../../state/YearContext'
import { atYear } from '../../lib/format'
import { band, Grid, path, Tip, X, XAxis, Y, yearAt, G, type Box } from './geometry'

export type HealthProps = { p10: number[]; p50: number[]; p90: number[]; thresholdPct: number; medianYear: number | null; xMax: number; showBand?: boolean; showThreshold?: boolean; label?: string; other?: number[]; otherLabel?: string }
const H = { w: 700, h: 300 }
const LO = 30, HI = 100

export function HealthChart({ p10, p50, p90, thresholdPct, medianYear, xMax, showBand = true, showThreshold = true, label, other, otherLabel = 'Bus B' }: HealthProps) {
  const [a10, a50, a90, ao] = useTween([p10, p50, p90, other ?? p50])
  const { year, setYear, hover, setHover } = useYear()
  const id = useId().replace(/:/g, '')
  const b: Box = { ...H, xMax }
  const yr = hover ?? year
  const v = atYear(a50, yr)
  const ty = Y(b, thresholdPct, LO, HI)
  return (
    <svg className="ch" viewBox={`0 0 ${H.w} ${H.h}`} role="img" aria-label={label ?? 'Battery health versus years in service, with the range across the reference runs'}
      onPointerMove={(e) => setHover(yearAt(b, e.clientX, e.currentTarget.getBoundingClientRect()))} onPointerLeave={() => setHover(null)}
      onClick={() => hover != null && setYear(hover)} style={{ cursor: 'crosshair' }}>
      <defs><linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FACC15" stopOpacity=".3" /><stop offset="1" stopColor="#FACC15" stopOpacity=".08" /></linearGradient></defs>
      <Grid b={b} ticks={[40, 60, 80, 100]} lo={LO} hi={HI} fmt={(t) => `${t}%`} />
      <XAxis b={b} />
      {showThreshold && <><line x1={G.L} x2={H.w - G.R} y1={ty} y2={ty} stroke="#fff" strokeOpacity=".8" strokeDasharray="6 5" /><text x={H.w - G.R - 4} y={ty - 8} textAnchor="end" style={{ fill: '#fff' }}>Replace at {Math.round(thresholdPct)}%</text></>}
      {showBand && <>
        <path d={band(b, a90, a10, LO, HI)} fill={`url(#g${id})`} />
        <path d={path(b, a90, LO, HI)} fill="none" stroke="#FACC15" strokeOpacity=".6" strokeDasharray="3 4" />
        <path d={path(b, a10, LO, HI)} fill="none" stroke="#FACC15" strokeOpacity=".6" strokeDasharray="3 4" />
      </>}
      <path d={path(b, a50, LO, HI)} fill="none" stroke="#FACC15" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(250,204,21,.5))' }} />
      {other && <>
        <path d={path(b, ao, LO, HI)} fill="none" stroke="#fff" strokeWidth="2.4" strokeDasharray="7 5" strokeLinecap="round" />
        <text x={X(b, Math.min(xMax, ao.length / 12 - 1 / 12)) - 6} y={Y(b, Math.max(ao[Math.min(ao.length - 1, Math.round(xMax * 12))], LO), LO, HI) - 10} textAnchor="end" style={{ fill: '#fff', fontWeight: 700 }}>{otherLabel}</text>
      </>}
      {medianYear != null && medianYear <= xMax && <><line x1={X(b, medianYear)} x2={X(b, medianYear)} y1={G.T} y2={H.h - G.B} stroke="#fff" strokeOpacity=".3" strokeDasharray="2 4" /><text x={X(b, medianYear) + 6} y={G.T + 12} style={{ fill: '#fff' }}>median {medianYear.toFixed(1)} y</text></>}
      <line x1={X(b, yr)} x2={X(b, yr)} y1={G.T} y2={H.h - G.B} stroke="rgba(255,255,255,.55)" />
      <circle cx={X(b, yr)} cy={Y(b, Math.max(v, LO), LO, HI)} r="6" fill="#FACC15" stroke="#09090B" strokeWidth="2.5" />
      {hover != null && <Tip b={b} x={X(b, yr)} y={Y(b, Math.max(v, LO), LO, HI)} lines={[[`Year ${yr.toFixed(1)}`], [`median ${v.toFixed(0)}%`, '#FACC15'], ...(other ? [[`${otherLabel} ${atYear(ao, yr).toFixed(0)}%`, '#fff'] as [string, string]] : []), [`range ${Math.max(atYear(a10, yr), 0).toFixed(0)} to ${atYear(a90, yr).toFixed(0)}%`, '#B4B4BC']]} />}
    </svg>
  )
}
