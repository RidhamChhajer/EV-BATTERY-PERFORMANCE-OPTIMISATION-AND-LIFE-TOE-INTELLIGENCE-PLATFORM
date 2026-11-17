import { useId, useMemo, useState } from 'react'
import { moneyBy } from '../../lib/fleet/forecast'
import { groupRows, type GroupBy, type Row } from '../../lib/fleet/segments'
import type { FleetForecast } from '../../lib/fleet/types'
import { rupees } from '../../lib/money'
import { EvidenceBadge } from '../EvidenceBadge'

const BYS: { v: GroupBy; label: string }[] = [{ v: 'depot', label: 'Depot' }, { v: 'route', label: 'Route' }, { v: 'class', label: 'Duty class' }, { v: 'type', label: 'Bus type' }]
const TOP = 8

type Rect = { x: number; y: number; w: number; h: number }
/** Slice-and-dice treemap: split the sorted list into two halves of near-equal total and cut the longer side, so every tile's area is its share of the total. */
export function layout(vals: number[], box: Rect): Rect[] {
  if (vals.length === 0) return []
  if (vals.length === 1) return [box]
  const total = vals.reduce((a, b) => a + b, 0)
  let k = 1, acc = vals[0]
  while (k < vals.length - 1 && Math.abs(acc + vals[k] - total / 2) < Math.abs(acc - total / 2)) acc += vals[k++]
  const f = total > 0 ? acc / total : 0.5
  const wide = box.w >= box.h
  const a: Rect = wide ? { ...box, w: box.w * f } : { ...box, h: box.h * f }
  const b: Rect = wide ? { ...box, x: box.x + box.w * f, w: box.w * (1 - f) } : { ...box, y: box.y + box.h * f, h: box.h * (1 - f) }
  return [...layout(vals.slice(0, k), a), ...layout(vals.slice(k), b)]
}

/** Where the battery money goes. Each tile's area is a group's battery rupees a year (its packs' price spread over their life); its shade is what that costs per km, so a big dark tile
 *  is a lot of money and a lot per km. It is a cost, not a margin: the tool does not know what the contract pays per km. */
export function MoneyBlock({ rows, forecast, stale }: { rows: Row[]; forecast: FleetForecast; stale: boolean }) {
  const id = useId()
  const [by, setBy] = useState<GroupBy>('depot')
  const list = useMemo(() => moneyBy(rows, groupRows(rows, by, forecast.as_of).groups, forecast), [rows, by, forecast])
  const priced = list.filter((r) => r.perYear != null && r.perYear > 0)
  const shown = priced.slice(0, TOP)
  const rest = priced.slice(TOP)
  const tiles = rest.length ? [...shown, { key: '_rest', label: `${rest.length} more`, buses: rest.reduce((s, r) => s + r.buses, 0), perYear: rest.reduce((s, r) => s + (r.perYear ?? 0), 0), perKm: null as number | null }] : shown
  const sum = priced.reduce((s, r) => s + (r.perYear ?? 0), 0)
  const rects = layout(tiles.map((t) => t.perYear ?? 0), { x: 0, y: 0, w: 100, h: 100 })
  const kms = priced.map((r) => r.perKm).filter((v): v is number => v != null)
  const lo = Math.min(...kms), hi = Math.max(...kms)
  const shade = (v: number | null) => (v == null || hi <= lo ? 0.2 : 0.1 + 0.42 * ((v - lo) / (hi - lo)))
  const lead = priced[0]
  return (
    <section className="card c5" aria-labelledby={`${id}-h`} aria-busy={stale}>
      <div className="hd"><div><h2 id={`${id}-h`}>Where the battery money goes</h2><div className="sub">Bigger tile, more rupees a year. A brighter edge costs more per km.</div></div><EvidenceBadge level="derived" /></div>
      <div className="seg tabs tm-seg" role="group" aria-label="Rank by">{BYS.map((b) => <button key={b.v} aria-pressed={by === b.v} onClick={() => setBy(b.v)}>{b.label}</button>)}</div>
      {priced.length === 0 ? <p className="tnote">No class has a battery price and a measurable life yet, so there is nothing to show.</p> : (
        <>
          {lead && priced.length > 1 && <p className="headline sm"><b>{lead.label} carries {Math.round(((lead.perYear ?? 0) / sum) * 100)} % of the battery spend.</b></p>}
          <ol className="tm">
            {tiles.map((t, i) => {
              const r = rects[i]
              const small = r.h * 3.6 < 96 || r.w < 24      // a short or narrow tile shows the name and the money only; the title has the rest
              return (
                <li key={t.key} style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}>
                  <div className={`tm-i${small ? ' sm' : ''}`} title={`${t.label}: ${rupees(t.perYear ?? 0)} a year${t.perKm != null ? `, ₹${t.perKm.toFixed(2)} per km` : ''}, ${t.buses} buses`} style={{ background: `rgba(250,204,21,${(shade(t.perKm) * 0.35).toFixed(3)})`, borderColor: `rgba(250,204,21,${(0.15 + shade(t.perKm) * 0.9).toFixed(2)})` }}>
                    <span className="tm-n">{t.label}<em>{Math.round(((t.perYear ?? 0) / sum) * 100)} %</em></span>
                    <b>{rupees(t.perYear ?? 0)} a year</b>
                    {!small && <small>{t.perKm != null ? `₹${t.perKm.toFixed(2)} per km · ` : ''}{t.buses} {t.buses === 1 ? 'bus' : 'buses'}</small>}
                  </div>
                </li>
              )
            })}
          </ol>
          {kms.length > 1 && hi > lo && <div className="tm-k" aria-hidden="true"><span>₹{lo.toFixed(2)} per km</span><i /><span>₹{hi.toFixed(2)} per km</span></div>}
        </>
      )}
      <p className="note">A cost, not a margin: the contract rate per km is not known. Class figures, undiscounted, first pack only.</p>
    </section>
  )
}
