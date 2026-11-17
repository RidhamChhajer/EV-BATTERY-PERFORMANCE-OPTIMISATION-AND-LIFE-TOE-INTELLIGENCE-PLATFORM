import { useId, useMemo } from 'react'
import { useLeverSweep } from '../../api/hooks'
import type { Scenario } from '../../api/types'
import { dayOf, leverFleetValue, rankFleetLevers, type FleetLeverRow } from '../../lib/fleet/forecast'
import type { Fleet } from '../../lib/fleet/types'
import { leverSteps } from '../../lib/levers'
import { rupees } from '../../lib/money'
import { WithTable } from '../DataTable'
import { EvidenceBadge } from '../EvidenceBadge'

const CLASSES = 5
const NAME: Record<string, string> = { soc_max_pct: 'Charge cap', charge_start_hour: 'Start time', heat_rise_c: 'Pack heating' }
const sign = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`

/** What to do first, in fleet rupees: each operating lever moved one step for each of the largest duty classes, ranked by what it is worth to the whole class
 *  (the per-bus saving times the buses in it), not by months. Only the largest few classes are measured, each lever alone, so rows do not add up. */
export function FleetLevers({ fleet, ready }: { fleet: Fleet; ready: boolean }) {
  const id = useId()
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const b of fleet.buses) m.set(b.classId, (m.get(b.classId) ?? 0) + 1); return m }, [fleet])
  const top = useMemo(() => fleet.classes.filter((c) => (counts.get(c.id) ?? 0) > 0).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)).slice(0, CLASSES), [fleet, counts])
  const bases = useLeverSweep(top.map((c) => c.scenario), ready)
  const baseData = bases.map((q) => (q.data && !q.isPlaceholderData ? q.data : undefined))
  const basesDone = baseData.length > 0 && baseData.every((b) => b !== undefined)
  const plan = top.flatMap((c, i) => { const b = baseData[i]; return b ? leverSteps(c.scenario, dayOf(c.scenario, b)).map((step) => ({ c, i, step })) : [] })
  const alts = useLeverSweep(plan.map((p) => ({ ...p.c.scenario, [p.step.key]: p.step.value }) as Scenario), ready && basesDone)
  const rows: FleetLeverRow[] = plan.map((p, k) => {
    const base = baseData[p.i], alt = alts[k]?.data && !alts[k].isPlaceholderData ? alts[k].data : undefined
    const v = base ? leverFleetValue(base, alt, counts.get(p.c.id) ?? 0) : { perBus: null, fleet: null, months: null }
    return { classId: p.c.id, className: p.c.name, buses: counts.get(p.c.id) ?? 0, text: p.step.text, months: v.months, perBus: v.perBus, fleet: v.fleet, lever: NAME[p.step.key] ?? p.step.key, needsCooling: p.step.confirm }
  })
  const ranked = rankFleetLevers(rows)
  const measured = ranked.length, expected = plan.length
  const covered = top.reduce((s, c) => s + (counts.get(c.id) ?? 0), 0)
  const allCovered = covered >= fleet.buses.length
  // One card per kind of change. The same change in different duty classes touches different buses, so those add up; two changes in one class do not, which is why they stay on separate cards.
  const cards = useMemo(() => {
    const m = new Map<string, { lever: string; title: string; items: FleetLeverRow[]; total: number; buses: number; cooling: boolean }>()
    for (const r of ranked) {
      const g = m.get(r.lever) ?? m.set(r.lever, { lever: r.lever, title: '', items: [], total: 0, buses: 0, cooling: false }).get(r.lever)!
      g.items.push(r); g.total += r.fleet as number; g.buses += r.buses; g.cooling = g.cooling || !!r.needsCooling
    }
    return [...m.values()].map((g) => ({ ...g, title: g.items.every((r) => r.text === g.items[0].text) ? g.items[0].text : g.lever })).sort((a, b) => b.total - a.total)
  }, [ranked])
  const topTotal = Math.max(1, ...cards.map((g) => g.total))
  const monthsText = (items: FleetLeverRow[]) => { const m = items.map((r) => r.months).filter((v): v is number => v != null); return m.length ? (Math.min(...m) === Math.max(...m) ? sign(m[0]) : `${sign(Math.min(...m))} to ${sign(Math.max(...m))}`) + ' months' : 'months not measured' }
  const noPrice = basesDone && rows.length > 0 && measured === 0 && alts.every((q) => q.isSuccess)
  if (!top.length) return null
  return (
    <section className="card c7" aria-labelledby={`${id}-h`} aria-busy={!basesDone || measured < expected}>
      <div className="hd"><div><h2 id={`${id}-h`}>What to do first, in rupees</h2><div className="sub">Each change on its own, summed over the duty classes it applies to.</div></div><EvidenceBadge level="derived" /></div>
      {!ready || !basesDone ? <p className="tnote" role="status">{ready ? `Measuring ${bases.filter((q) => q.data && !q.isPlaceholderData).length} of ${top.length} duty classes…` : 'Waiting for the fleet figures…'}</p>
        : measured < expected ? <p className="tnote" role="status">{measured} of {expected} changes measured…</p> : null}
      {noPrice && <p className="tnote">These classes have no battery price, so a change cannot be put in rupees.</p>}
      {ranked.length > 0 && (
        <WithTable
          chart={
            <ol className="lv3">
              {cards.map((g, gi) => (
                <li key={g.lever} className="lv3-i">
                  <span className="lv3-n" aria-hidden="true">{gi + 1}</span>
                  <div className="lv3-b">
                    <div className="lv3-t"><b>{g.title}</b><b className="lv3-v">{Math.abs(g.total) < 1 ? 'no measurable change' : `${g.total >= 0 ? '' : 'costs '}${rupees(Math.abs(g.total))} a year`}</b></div>
                    <div className="lv3-bar" aria-hidden="true"><i style={{ width: `${(Math.max(0, g.total) / topTotal) * 100}%` }} /></div>
                    <div className="lv3-s">{g.items.length} {g.items.length === 1 ? 'duty class' : 'duty classes'} · {g.buses} {g.buses === 1 ? 'bus' : 'buses'} · {monthsText(g.items)} of life per bus{g.cooling ? ' · needs your cooling system' : ''}</div>
                    <details className="lv3-d">
                      <summary>By duty class</summary>
                      <ul>{g.items.map((r) => <li key={r.classId}><span>{r.className}<small>{g.title === r.text ? '' : `${r.text} · `}{r.buses} {r.buses === 1 ? 'bus' : 'buses'}</small></span><b>{Math.abs(r.fleet as number) < 1 ? '–' : rupees(r.fleet as number)}</b></li>)}</ul>
                    </details>
                  </div>
                </li>
              ))}
            </ol>
          }
          head={['Duty class', 'Buses', 'Change', 'Months gained per bus (median)', 'Rupees a year per bus', 'Rupees a year for the class']}
          rows={ranked.map((r) => [r.className, r.buses, r.text, r.months == null ? '–' : sign(r.months), r.perBus == null ? '–' : rupees(r.perBus), rupees(r.fleet as number)])} />
      )}
      <p className="note">{allCovered ? `All ${covered.toLocaleString('en-IN')} buses are covered.` : `The ${top.length} largest classes cover ${covered.toLocaleString('en-IN')} of ${fleet.buses.length.toLocaleString('en-IN')} buses; the rest are not measured.`} Each change is measured alone, so rows of the same class do not add up.</p>
    </section>
  )
}
