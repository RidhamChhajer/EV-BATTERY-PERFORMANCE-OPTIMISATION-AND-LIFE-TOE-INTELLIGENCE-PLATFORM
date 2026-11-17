import { useId, useMemo, useState } from 'react'
import { groupOf, GROUP_LABEL, GROUP_ORDER, SOON, type ClassRange, type RangeBand, type RangeFilter, type RangeGroup } from '../../lib/fleet/range'
import type { Row } from '../../lib/fleet/segments'
import type { Fleet } from '../../lib/fleet/types'
import { EvidenceBadge } from '../EvidenceBadge'
import { ClassRangeChart, ShortOverTime } from './RangeCharts'

/** Range status uses the theme's own signals: red is short now, orange is short within three years, grey is later, and the volt yellow (the theme's "ok") is covered. */
export const GROUP_COLOR: Record<RangeGroup, string> = { now: 'var(--bad)', '3y': 'var(--warn)', later: '#52525B', ok: 'var(--volt)', unknown: '#E4E4E7' }
export const RANGE_COLOR: Record<RangeBand, string> = { never: 'var(--bad)', now: 'var(--bad)', within_12: 'var(--warn)', y1_3: 'var(--warn)', y3_5: '#71717A', later: '#71717A', covered: 'var(--volt)', unknown: '#E4E4E7' }
const km = (v: number) => `${Math.round(v)} km`

/** Will each bus still have the range for its route? One row per duty class: a bar of its buses by when they fall short. A segment filters the roster below. The year-by-year
 *  and per-class curves are behind a button, because they are the working, not the answer. */
export function RangeCard({ fleet, rows, ranges, done, total, filter, onFilter }: { fleet: Fleet; rows: Row[]; ranges: Map<string, ClassRange>; done: number; total: number; filter: RangeFilter | null; onFilter: (f: RangeFilter | null) => void }) {
  const id = useId()
  const [more, setMore] = useState(false)
  const withRange = rows.filter((r) => r.range)
  const per = useMemo(() => fleet.classes.map((c) => {
    const rs = rows.filter((r) => r.bus.classId === c.id && r.range)
    if (!rs.length) return null
    const counts = Object.fromEntries(GROUP_ORDER.map((g) => [g, 0])) as Record<RangeGroup, number>
    for (const r of rs) counts[groupOf(r.range!.band)]++
    return { c, n: rs.length, cr: ranges.get(c.id), counts, rs, soon: rs.filter((r) => SOON.includes(r.range!.band)).length }
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.soon / b.n - a.soon / a.n || b.n - a.n), [fleet, rows, ranges])
  const nSoon = withRange.filter((r) => SOON.includes(r.range!.band)).length
  const never = withRange.filter((r) => r.range!.band === 'never').length
  const usedGroups = GROUP_ORDER.filter((g) => per.some((p) => p.counts[g] > 0))
  return (
    <section className="card c12" aria-labelledby={`${id}-h`} aria-busy={done < total}>
      <div className="hd"><div><h2 id={`${id}-h`}>Will each bus still cover its route?</h2><div className="sub">A full charge against the route’s km plus a 20 % reserve, as the pack ages.</div></div><EvidenceBadge level="derived" /></div>
      {done < total && <p className="tnote" role="status">{done} of {total} duty classes done.</p>}
      {withRange.length > 0 && (
        <>
          <p className="rg-lead" aria-live="polite"><b>{nSoon === 0 ? 'Every bus keeps enough range for the next 3 years.' : `${nSoon} of ${withRange.length} buses will not cover their route within 3 years.`}</b>
            {never > 0 && <span> {never} {never === 1 ? 'is' : 'are'} short even when new: the pack is too small for that route.</span>}</p>
          <ul className="rr" aria-label="Range against the route, by duty class">
            {per.map(({ c, n, cr, counts }) => (
              <li key={c.id} className="rr-row">
                <div className="rr-l"><b>{c.name}</b><span>{n} {n === 1 ? 'bus' : 'buses'}{cr ? ` · needs ${km(cr.needKm)}, new pack ${km(cr.newKm)}` : ''}</span>{cr?.never && <em>pack too small, even new</em>}</div>
                <div className="rr-bar">
                  {GROUP_ORDER.filter((g) => counts[g] > 0).map((g) => {
                    const key = `${g}@${c.id}`, on = filter === key
                    return <button key={g} className={g === 'unknown' ? 'hatch' : undefined} style={{ flexGrow: counts[g], background: g === 'unknown' ? undefined : GROUP_COLOR[g], opacity: filter && !on ? 0.4 : 1 }} aria-pressed={on}
                      aria-label={`${c.name}: ${counts[g]} ${GROUP_LABEL[g].toLowerCase()}`} title={`${counts[g]} ${GROUP_LABEL[g].toLowerCase()}`} onClick={() => onFilter(on ? null : key)}>{counts[g] / n >= 0.09 ? counts[g] : ''}</button>
                  })}
                </div>
              </li>
            ))}
          </ul>
          <ul className="rr-key" aria-label="Colours">{usedGroups.map((g) => <li key={g}><i className={g === 'unknown' ? 'hatch' : undefined} style={g === 'unknown' ? undefined : { background: GROUP_COLOR[g] }} />{GROUP_LABEL[g]}</li>)}</ul>
          <button className="btn sm" aria-expanded={more} onClick={() => setMore((m) => !m)}>{more ? 'Hide the curves' : 'Show the curves behind this'}</button>
          {more && (
            <div className="rr-more">
              <h3 className="rg-h">Buses short of range, year by year</h3>
              <ShortOverTime rows={withRange} />
              <h3 className="rg-h" style={{ marginTop: 20 }}>Range against the route’s need, by duty class</h3>
              <ul className="rm" aria-label="Range curves by duty class">
                {per.map(({ c, cr, rs }) => cr && <li key={c.id} className="rm-c"><b>{c.name}</b><ClassRangeChart cr={cr} rows={rs} /></li>)}
              </ul>
              <p className="note">Yellow: the median pack’s full-charge range as it ages. Dashed grey: one pack in ten ages faster. Red line: what the route needs. Each dot is a bus at its own age, an orange or red dot being short soon or now.</p>
            </div>
          )}
        </>
      )}
      <p className="note">The model’s median health decides “short”. Air conditioning and seasonal use are not modelled. Not yet validated on buses.</p>
    </section>
  )
}
