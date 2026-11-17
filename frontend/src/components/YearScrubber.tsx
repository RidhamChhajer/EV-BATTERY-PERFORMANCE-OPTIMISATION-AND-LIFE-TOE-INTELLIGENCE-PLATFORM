import { useYear } from '../state/YearContext'
import { usePlayYear } from '../lib/usePlayYear'

export type CompareLine = { p50: number[]; aYear: number | null; bYear: number | null }
/** `other` is Bus B. When it is given, Bus A turns grey, Bus B is drawn in yellow, the gap between them is shaded and each bus's replacement year is marked. */
type Props = { p10: number[]; p50: number[]; p90: number[]; thresholdPct: number; xMax: number; win?: [number | null, number | null]; other?: CompareLine }
const W = 800, H = 50
export function YearScrubber({ p10, p50, p90, thresholdPct, xMax, win, other }: Props) {
  const { year, setYear } = useYear()
  const { playing, toggle, stop } = usePlayYear(xMax)
  const x = (y: number) => (W * y) / xMax, v = (a: number) => 4 + (H - 8) * (100 - Math.max(a, 30)) / 70
  const n = Math.min(p50.length, Math.round(xMax * 12) + 1)
  const line = (a: number[]) => a.slice(0, n).map((e, i) => `${i ? 'L' : 'M'}${x(i / 12).toFixed(1)} ${v(e).toFixed(1)}`).join('')
  const rv = (a: number[]) => { let s = ''; for (let i = n - 1; i >= 0; i--) s += `L${x(i / 12).toFixed(1)} ${v(a[i]).toFixed(1)}`; return s }
  const gain = other ? other.p50.slice(0, n).reduce((s, b, i) => s + (b - p50[i]), 0) : 0
  const pct = (yr: number | null) => (yr == null || yr > xMax ? null : `${(yr / xMax) * 100}%`)
  const top = `${(v(thresholdPct) / H) * 100}%`
  const ticks: number[] = []
  for (let t = 0; t <= xMax; t += xMax > 10 ? 3 : 2) ticks.push(t)
  return (
    <div className="tl glass">
      <span className="yrl">Year <b>{year.toFixed(1)}</b></span>
      <button className="play" aria-label={playing ? 'Pause' : 'Play through the years'} aria-pressed={playing} onClick={toggle}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d={playing ? 'M3 2h3.4v12H3zM9.6 2H13v12H9.6z' : 'M4 2v12l10-6z'} fill="#09090B" /></svg>
      </button>
      <div className="trk">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {win?.[0] != null && <rect x={x(win[0])} width={Math.max(0, x(Math.min(win[1] ?? xMax, xMax)) - x(win[0]))} height={H} fill="rgba(255,255,255,.06)" />}
          <line x1="0" x2={W} y1={v(thresholdPct)} y2={v(thresholdPct)} stroke="rgba(255,255,255,.3)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <path d={line(p90) + rv(p10) + 'Z'} fill={other ? 'rgba(142,142,152,.16)' : 'rgba(250,204,21,.2)'} />
          {other && <path d={line(p50) + rv(other.p50) + 'Z'} fill={gain >= 0 ? 'rgba(250,204,21,.3)' : 'rgba(248,113,113,.32)'} />}
          <path d={line(p50)} fill="none" stroke={other ? '#A1A1AA' : '#FACC15'} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
          {other && <path d={line(other.p50)} fill="none" stroke={gain >= 0 ? '#FACC15' : '#F87171'} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />}
          <line x1={x(year)} x2={x(year)} y1="0" y2={H} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {other && ([['a', other.aYear, 'A'], ['b', other.bYear, 'B']] as const).map(([k, yr, l]) => pct(yr) && (
          <span key={k} className={`rmk ${k}`} style={{ left: pct(yr)!, top }} title={`Bus ${l} reaches the replacement line at ${yr!.toFixed(1)} years`}><i /><b>{l} {yr!.toFixed(1)} y</b></span>
        ))}
        <input type="range" min={0} max={xMax} step={0.05} value={Math.min(year, xMax)} aria-label="Years in service" aria-valuetext={`${year.toFixed(1)} years`} onChange={(e) => { stop(); setYear(+e.target.value) }} />
      </div>
      <div className="axis" style={{ gridColumn: 2 }}>{ticks.map((t) => <span key={t}>{t === 0 ? 'New' : t}</span>)}<span>years</span></div>
    </div>
  )
}
