import { useState } from 'react'
import { WithTable } from '../DataTable'
import { annualSchedule, bulkWindow, cumulativeSpend, provision } from '../../lib/planner'
import { fmt } from '../../lib/format'
import { rupees } from '../../lib/money'
import { useScopeSize } from '../../state/scope'
import { useYear } from '../../state/YearContext'
import { G, Grid, Tip, X, XAxis, Y, type Box } from './geometry'

const H = { w: 700, h: 210 }
const lakh = rupees

/** The same distribution applied to a fleet: how many buses reach the line each year, and what first packs would cost. */
export function FleetPlan({ cdf, packCostInr, xMax }: { cdf: number[]; packCostInr: number | null; xMax: number }) {
  const [fleet, setFleet, fromFleet] = useScopeSize()
  const { year, setYear } = useYear()
  const [hov, setHov] = useState<number | null>(null)
  const { bars, after } = annualSchedule(cdf, fleet)
  const shown = bars.filter((b) => b.year <= Math.ceil(xMax))
  const cum = packCostInr != null ? cumulativeSpend(bars, packCostInr) : null
  const prov = provision(cdf, fleet), pshown = prov.filter((b) => b.year <= Math.ceil(xMax))
  const top = Math.max(1, Math.ceil(Math.max(...pshown.map((b) => b.high), ...shown.map((b) => b.expected), 0.5) * 1.1))
  const peak = pshown.reduce<(typeof pshown)[number] | null>((a, b) => (a == null || b.expected > a.expected ? b : a), null)
  const win = bulkWindow(cdf)
  const spend = (n: number) => (packCostInr != null ? rupees(n * packCostInr) : null)
  const b: Box = { ...H, xMax: shown.length || 1 }
  const bw = ((H.w - G.L - G.R) / b.xMax) * 0.7
  const yi = Math.min(shown.length, Math.max(1, Math.ceil(year))) - 1
  const doneBy = shown.slice(0, yi + 1).reduce((s, x) => s + x.expected, 0)
  return (
    <>
      <div className="fleet-in">
        <label>{fromFleet ? 'Buses in this duty class' : 'Buses in the fleet'}<input type="number" min={1} max={5000} value={fleet} readOnly={fromFleet} onChange={(e) => setFleet(+e.target.value)} /></label>
        <div className="fleet-k"><small>By year {year.toFixed(1)}</small><b>{fmt(doneBy)}<span> replaced</span></b></div>
        {cum && <div className="fleet-k"><small>First packs by then</small><b>{lakh(cum[yi] ?? 0)}</b></div>}
        <div className="fleet-k"><small>Still going after {xMax >= (cdf.length - 1) / 12 ? 'the forecast' : `year ${Math.ceil(xMax)}`}</small><b>{fmt(after)}<span> buses</span></b></div>
      </div>
      {peak && peak.expected >= 0.05 && (
        <p className="tnote">
          {packCostInr != null ? <>Budget about <b>{spend(peak.expected)}</b> in year {peak.year} ({spend(peak.low)} to {spend(peak.high)}, 10th to 90th percentile).</> : <>Expect about <b>{fmt(peak.expected)}</b> buses in year {peak.year} ({peak.low} to {peak.high}, 10th to 90th percentile).</>}
          {win.from != null && (win.to != null
            ? ` Most of the fleet, 80 %, reaches the line between year ${win.from} and year ${win.to}: a bulk order in that window.`
            : ` The first tenth reach the line by year ${win.from}, and the latest tenth are still going after the forecast.`)}
        </p>
      )}
      <WithTable
        chart={
          <svg className="ch" viewBox={`0 0 ${H.w} ${H.h}`} role="img" aria-label={`Expected number of the ${fleet} buses reaching the replacement line in each year. Year ${yi + 1} expects ${shown[yi]?.expected.toFixed(1) ?? 0} buses, between ${prov[yi]?.low ?? 0} and ${prov[yi]?.high ?? 0} for the 10th to 90th percentile.`}>
            <Grid b={b} ticks={[0, top / 2, top].map((t) => +t.toFixed(1))} lo={0} hi={top} fmt={(t) => `${t}`} />
            <XAxis b={{ ...b, xMax: shown.length }} />
            {shown.map((s) => {
              const x = X(b, s.year - 0.5) - bw / 2, y = Y(b, s.expected, 0, top), on = s.year === yi + 1
              return (
                <g key={s.year} onPointerEnter={() => setHov(s.year)} onPointerLeave={() => setHov(null)} onClick={() => setYear(s.year)} style={{ cursor: 'pointer' }}>
                  <rect x={X(b, s.year - 1)} y={G.T} width={X(b, 1) - X(b, 0)} height={H.h - G.T - G.B} fill="transparent" />
                  <rect x={x} y={y} width={bw} height={Math.max(0, H.h - G.B - y)} rx="4" fill={on ? '#FACC15' : 'rgba(250,204,21,.45)'} />
                  {(() => { const v = prov[s.year - 1]; if (!v || v.high <= v.low) return null; const cx = x + bw / 2, a = Y(b, v.low, 0, top), z = Y(b, v.high, 0, top); return <g stroke="#fff" strokeOpacity=".7" strokeWidth="1.4"><line x1={cx} x2={cx} y1={a} y2={z} /><line x1={cx - 4} x2={cx + 4} y1={a} y2={a} /><line x1={cx - 4} x2={cx + 4} y1={z} y2={z} /></g> })()}
                </g>
              )
            })}
            {hov != null && shown[hov - 1] && <Tip b={b} x={X(b, hov - 0.5)} y={Y(b, shown[hov - 1].expected, 0, top)} lines={[[`Year ${hov}`], [`${shown[hov - 1].expected.toFixed(1)} buses (${prov[hov - 1].low} to ${prov[hov - 1].high})`, '#FACC15'], ...(cum ? [[lakh(cum[hov - 1]), '#D4D4D8'] as [string, string]] : [])]} />}
          </svg>
        }
        head={['Year', 'Expected buses', '10th pct', '90th pct', ...(cum ? ['Spend that year', 'Spend 10th pct', 'Spend 90th pct', 'First packs so far'] : [])]}
        rows={shown.map((s) => { const v = prov[s.year - 1]; return [s.year, s.expected.toFixed(1), v.low, v.high, ...(cum ? [spend(s.expected)!, spend(v.low)!, spend(v.high)!, lakh(cum[s.year - 1])] : [])] })} />
      <p className="note">Assumes buses spread out like the model's runs, they age independently, each is replaced once, and money is not discounted. The whiskers show how far the count of a fleet this size could land from the average (10th to 90th percentile), on top of the model's own spread. {fromFleet ? 'The bus count is the duty class of the bus opened from your fleet.' : 'Fleet size is remembered in this browser only.'}</p>
    </>
  )
}
