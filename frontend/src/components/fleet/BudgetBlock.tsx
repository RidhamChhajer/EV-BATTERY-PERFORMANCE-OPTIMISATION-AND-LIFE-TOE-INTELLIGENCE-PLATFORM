import { useId, useState } from 'react'
import { budgetHeadline, cumulative, peakPeriod, stackBy, type Series } from '../../lib/fleet/forecast'
import { rupees } from '../../lib/money'
import { WithTable } from '../DataTable'
import { G, Grid, Tip, X, Y, type Box } from '../charts/geometry'
import { EvidenceBadge } from '../EvidenceBadge'
import type { Part } from './useFleetBlocks'

const H = { w: 760, h: 250 }
const COLORS = ['#FACC15', '#38BDF8', '#A78BFA', '#34D399', '#FB923C', '#F472B6']
const OTHER = '#71717A'
const short = (l: string) => l.replace(/^FY\d\d/, '')

const niceTop = (v: number) => {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}

/** What to budget, by financial year. The bars are the expected pack spend (or bus count without a battery price), stacked by depot; the whiskers are the
 *  10th to 90th percentile of the whole fleet's total, which does not split by depot, so it sits on the total only. */
export function BudgetBlock({ series, depots, unknown, moreDepots, stale, bare }: { series: Series; depots: Part[]; unknown: Part | null; moreDepots: boolean; stale: boolean; /** Inside the When card: no card, title, headline or long notes (the answer strip and the About panel carry them). */ bare?: boolean }) {
  const rid = useId()
  const id = rid.replace(/:/g, '')           // React's ids contain colons, which are not safe inside an SVG url(#…) reference
  const [hov, setHov] = useState<number | null>(null)
  const head = budgetHeadline(series)
  const peak = peakPeriod(series)
  const inr = series.spend != null
  const parts = depots.filter((d) => d.series).map((d) => ({ name: d.name, series: d.series as Series, buses: d.buses }))
  const split = depots.length + (unknown ? 1 : 0) > 1
  const stack = split && parts.length === depots.length && (!unknown || unknown.series) ? stackBy(parts, series, depots.length, moreDepots, unknown?.series ?? null) : null
  const names = stack?.names ?? ['Whole fleet']
  const values = stack?.values ?? [inr ? (series.spend as number[]) : series.buses]
  const total = inr ? (series.spend as number[]) : series.buses
  const hi = inr ? series.spendP90 ?? total : series.busesP90
  const lo = inr ? series.spendP10 ?? total.map(() => 0) : series.busesP10
  const n = series.labels.length
  const top = niceTop(Math.max(0.0001, ...total, ...hi))
  const b: Box = { ...H, xMax: n }
  const slot = (H.w - G.L - G.R) / n, bw = slot * 0.62
  const fmtV = (v: number) => (inr ? rupees(v) : v < 10 ? v.toFixed(1) : String(Math.round(v)))
  // Axis ticks are short so they fit the left margin; the headline, tooltip and table keep the full wording.
  const tick = (v: number) => (!inr ? fmtV(v) : v === 0 ? '₹0' : v >= 1e7 ? `₹${+(v / 1e7).toFixed(v < 1e8 ? 1 : 0)} cr` : v >= 1e5 ? `₹${+(v / 1e5).toFixed(v < 1e6 ? 1 : 0)} L` : rupees(v))
  const isOther = (i: number) => !!stack?.other && i === names.length - 1
  const isUnknown = (i: number) => stack?.unknownIndex === i
  const col = (i: number) => (isOther(i) ? OTHER : isUnknown(i) ? '#E4E4E7' : COLORS[i % COLORS.length])
  const fillOf = (i: number) => (isUnknown(i) ? `url(#${id}-hatch)` : col(i))
  const monthsIn = (i: number) => Math.round((series.edges[i + 1] ?? 0) - (series.edges[i] ?? 0))
  const cum = inr ? cumulative(series.spend as number[]) : cumulative(series.buses)
  const label = (i: number) => (i === 0 ? `${series.labels[0]}, the ${monthsIn(0)} months left` : series.labels[i])

  const rows = series.labels.map((l, i) => [
    i === 0 ? `${l} (${monthsIn(0)} months left)` : l,
    series.buses[i].toFixed(1), series.busesP10[i], series.busesP90[i],
    ...(inr ? [rupees(total[i]), rupees(lo[i]), rupees(hi[i])] : []),
    ...(stack ? stack.names.map((_, k) => (inr ? rupees(values[k][i]) : values[k][i].toFixed(1))) : []),
    fmtV(cum[i]),
  ])
  const head2 = ['Financial year', 'Expected buses', 'Buses, 10th pct', 'Buses, 90th pct', ...(inr ? ['Expected spend', 'Spend, 10th pct', 'Spend, 90th pct'] : []), ...(stack ? stack.names.map((x) => `${x}${inr ? ' spend' : ' buses'}`) : []), 'Cumulative (no band)']

  const Wrap = bare ? 'div' : 'section'
  return (
    <Wrap className={bare ? undefined : 'card c12'} aria-labelledby={bare ? undefined : `${id}-h`} aria-busy={stale}>
      {!bare && <div className="hd"><div><h2 id={`${id}-h`}>Battery budget by financial year</h2><div className="sub">Packs reaching the replacement line, first pack per bus only.</div></div><EvidenceBadge level="derived" /></div>}
      {!bare && <p className="headline" aria-live="polite"><b>{head.text}</b></p>}
      {!bare && peak && peak.index !== head.index && <p className="tnote">The biggest year is {peak.label}: {peak.spend != null ? <>about {rupees(peak.spend)}</> : <>about {peak.buses.toFixed(1)} buses</>}{peak.index === 0 ? ` (only the ${monthsIn(0)} months left of this year).` : '.'}</p>}
      <WithTable
        chart={
          <>
            <div className="bscroll"><svg className="ch" viewBox={`0 0 ${H.w} ${H.h}`} role="img" aria-label={`${inr ? 'Expected pack spend' : 'Expected buses reaching the line'} in each of the next ${n} financial years. ${head.text}`}>
              <defs><pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#27272A" /><rect width="2.5" height="6" fill="#E4E4E7" /></pattern></defs>
              <Grid b={b} ticks={[0, top / 2, top]} lo={0} hi={top} fmt={tick} />
              {series.labels.map((l, i) => {
                const cx = X(b, i + 0.5), x0 = cx - bw / 2
                let acc = 0
                return (
                  <g key={l} onPointerEnter={() => setHov(i)} onPointerLeave={() => setHov(null)}>
                    <rect x={X(b, i)} y={G.T} width={slot} height={H.h - G.T - G.B} fill="transparent" />
                    {values.map((v, k) => { const y1 = Y(b, acc + v[i], 0, top), y0 = Y(b, acc, 0, top); acc += v[i]; return <rect key={names[k]} x={x0} y={y1} width={bw} height={Math.max(0, y0 - y1)} fill={fillOf(k)} fillOpacity={i === 0 ? 0.55 : 0.9} /> })}
                    {hi[i] > lo[i] && <g stroke="#fff" strokeOpacity=".85" strokeWidth="1.4"><line x1={cx} x2={cx} y1={Y(b, lo[i], 0, top)} y2={Y(b, hi[i], 0, top)} /><line x1={cx - 5} x2={cx + 5} y1={Y(b, lo[i], 0, top)} y2={Y(b, lo[i], 0, top)} /><line x1={cx - 5} x2={cx + 5} y1={Y(b, hi[i], 0, top)} y2={Y(b, hi[i], 0, top)} /></g>}
                    <text x={cx} y={H.h - 9} textAnchor="middle">{short(l)}</text>
                  </g>
                )
              })}
              {hov != null && <Tip b={b} x={X(b, hov + 0.5)} y={Y(b, total[hov], 0, top)} lines={[[label(hov)], [`${fmtV(total[hov])} expected`, '#FACC15'], [`${fmtV(lo[hov])} to ${fmtV(hi[hov])}`, '#D4D4D8']]} />}
            </svg></div>
            <ul className="legend" aria-label="Depots in the stack">
              {names.map((nm, k) => <li key={nm}><i className={isUnknown(k) ? 'hatch' : undefined} style={isUnknown(k) ? undefined : { background: col(k) }} />{nm}</li>)}
              <li><i className="whisk" />10th to 90th percentile of the whole fleet</li>
            </ul>
          </>
        }
        head={head2} rows={rows} />
      {bare ? (
        <p className="note">{split && !stack ? 'Working out the split by depot. ' : ''}Whiskers: 10th to 90th percentile of the whole fleet.{unknown ? ' Hatched: buses with no in-service month, counted as new.' : ''}{series.beyond >= 0.05 && ` About ${series.beyond.toFixed(1)} buses are not expected to reach the line inside the forecast.`}</p>
      ) : (
      <p className="note">
        {split && !stack ? 'Working out the split by depot. ' : ''}{unknown ? `${unknown.buses} ${unknown.buses === 1 ? 'bus has' : 'buses have'} no in-service month, so ${unknown.buses === 1 ? 'it is' : 'they are'} counted as new, which pushes ${unknown.buses === 1 ? 'its' : 'their'} replacement later than it may be; ${unknown.buses === 1 ? 'it is' : 'they are'} hatched and kept apart so ${unknown.buses === 1 ? 'it' : 'they'} cannot pass as known. ` : ''}The model’s line is 80 % of a new pack’s capacity; the figures are about that line, not about how your buses are driven or what their health reports say.
        The two published models are mixed 50/50, which is an assumption, and it is the main reason the whiskers are wide: each model puts the whole fleet on its own ageing curve, so the spread comes mostly from the models disagreeing, not from a fleet this size scattering. The whiskers are for the whole fleet’s total and do not split by depot. A running total has no band, so none is shown.
        {series.beyond >= 0.05 && ` About ${series.beyond.toFixed(1)} buses are not expected to reach the line inside the forecast.`} Not yet validated on buses.
      </p>
      )}
    </Wrap>
  )
}
