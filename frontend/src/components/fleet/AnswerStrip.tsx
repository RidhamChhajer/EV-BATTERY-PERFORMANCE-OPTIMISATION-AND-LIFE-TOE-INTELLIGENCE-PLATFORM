import type { Series } from '../../lib/fleet/forecast'
import { SOON, type RangeFilter } from '../../lib/fleet/range'
import type { Band, Row } from '../../lib/fleet/segments'
import { rupees } from '../../lib/money'
import { BAND_COLOR } from './bands'

const toRoster = () => document.getElementById('roster')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/** Four numbers a fleet manager asks first. Each one is a plain figure from the forecast; the two about buses are buttons that filter the roster to those buses. */
export function AnswerStrip({ series, rows, loading, onBand, onRange }: { series: Series | null; rows: Row[]; loading: boolean; onBand: (b: Band) => void; onRange: (f: RangeFilter) => void }) {
  if (!series) return loading ? <div className="c12 tiles" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="tile"><span className="skel" style={{ display: 'block', height: 52 }} /></div>)}</div> : null
  const i = 1, label = series.labels[i]
  const inr = series.spend != null
  const e = inr ? series.spend![i] : series.buses[i]
  const lo = inr ? series.spendP10?.[i] ?? 0 : series.busesP10[i], hi = inr ? series.spendP90?.[i] ?? e : series.busesP90[i]
  const f = (v: number) => (inr ? rupees(v) : v < 10 ? v.toFixed(1) : String(Math.round(v)))
  const shortSoon = rows.filter((r) => r.range && SOON.includes(r.range.band)).length, haveRange = rows.filter((r) => r.range).length
  const n = rows.length
  const due = rows.filter((r) => r.band === 'within_12').length, past = rows.filter((r) => r.band === 'past_median').length
  const go = (b: Band) => { onBand(b); toRoster() }
  return (
    <div className="c12 tiles" role="group" aria-label="The fleet in four numbers">
      <div className="tile">
        <span className="t-l">{inr ? `Budget for ${label}` : `Buses reaching the line in ${label}`}</span>
        <b className="t-v">{f(e)}</b>
        <span className="t-s">{hi <= e + 1e-9 && lo >= e - 1e-9 ? 'No spread expected' : `${f(lo)} to ${f(hi)} · 10th to 90th percentile`}</span>
      </div>
      <button className="tile t-b" onClick={() => go('within_12')}>
        <span className="t-l">Due in the next 12 months</span>
        <b className="t-v" style={{ color: due ? BAND_COLOR.within_12 : undefined }}>{due}<small> of {n}</small></b>
        <span className="t-s">buses; show them</span>
      </button>
      <button className="tile t-b" onClick={() => { onRange('soon'); toRoster() }} disabled={haveRange === 0}>
        <span className="t-l">Short of range within 3 years</span>
        <b className="t-v" style={{ color: shortSoon ? BAND_COLOR.within_12 : undefined }}>{haveRange === 0 ? '…' : shortSoon}<small>{haveRange === 0 ? '' : ` of ${haveRange}`}</small></b>
        <span className="t-s">{haveRange === 0 ? 'working out' : 'buses; show them'}</span>
      </button>
      <button className="tile t-b" onClick={() => go('past_median')}>
        <span className="t-l">Past the model’s median</span>
        <b className="t-v" style={{ color: past ? BAND_COLOR.past_median : undefined }}>{past}<small> of {n}</small></b>
        <span className="t-s">buses; show them</span>
      </button>
    </div>
  )
}
