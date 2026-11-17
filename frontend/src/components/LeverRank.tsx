import { useState } from 'react'
import type { PredictionResult, Scenario } from '../api/types'
import { useLeverSweep } from '../api/hooks'
import type { DayParams } from '../lib/dayCycle'
import { fmt, num } from '../lib/format'
import { leverSteps, rankLevers } from '../lib/levers'
import { rupees } from '../lib/money'
import { EvidenceBadge } from './EvidenceBadge'
import { useWhatIf } from '../state/WhatIfContext'

const NAME: Record<string, string> = { soc_max_pct: 'Charge cap', charge_start_hour: 'Start time', heat_rise_c: 'Pack heating' }
const sign = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`

/** "What to do first": each operating lever moved one sensible step on its own, ranked by the months of battery life it adds in the model.
 *  The moves are measured one at a time against the unchanged bus, so they do not add up. Each row is a button that applies the move to the page's "Try a change" bar. */
export function LeverRank({ base, scenario, day, ready }: { base: PredictionResult; scenario: Scenario; day: DayParams; ready: boolean }) {
  const { set } = useWhatIf()
  const [table, setTable] = useState(false)
  const steps = leverSteps(scenario, day)
  const sweep = useLeverSweep(steps.map((s) => ({ ...scenario, [s.key]: s.value }) as Scenario), ready)
  if (!steps.length) return null
  const rows = rankLevers(base, scenario, steps.map((step, i) => ({ step, pred: sweep[i]?.isPlaceholderData ? undefined : sweep[i]?.data })))
  const baseRange = (num(base.range.new_pack_range_km) ?? 0) * scenario.threshold
  const top = Math.max(...rows.map((r) => Math.abs(r.months ?? 0)), 0.5)
  const dRange = (km: number | null) => (km == null ? null : km - baseRange)
  return (
    <section className="card c12" aria-labelledby="lr-h">
      <div className="hd"><div><h2 id="lr-h">What to do first</h2><div className="sub">One change at a time, from the model; they do not add up.</div></div><EvidenceBadge level="derived" /></div>
      {table ? (
        <table className="tbl mt"><thead><tr><th scope="col">Lever</th><th scope="col">Change</th><th scope="col">Months gained (median)</th><th scope="col">Months gained (10th pct)</th><th scope="col">Range at replacement (km)</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.step.key}><td>{NAME[r.step.key] ?? r.step.key}</td><td>{r.step.text}</td><td>{r.months == null ? '–' : sign(r.months)}</td><td>{r.low == null ? '–' : sign(r.low)}</td><td>{r.rangeKm == null ? '–' : fmt(r.rangeKm)}</td></tr>)}</tbody></table>
      ) : (
        <ol className="lvr">
          {rows.map((r) => {
            const dr = dRange(r.rangeKm)
            return (
              <li key={r.step.key}>
                <button onClick={() => set(r.step.key, r.step.value)} aria-label={`${r.step.text}: ${r.months == null ? 'working it out' : `${sign(r.months)} months of battery life`}. Apply to the Try a change bar.`}>
                  <span className="lv-t">{r.step.text}{r.step.confirm && <em className="tag">needs your cooling system</em>}{r.short && <em className="tag warn">below your route</em>}</span>
                  <span className="lv-b" aria-hidden="true"><i style={{ width: `${r.months == null ? 0 : (Math.max(0, r.months) / top) * 100}%` }} /></span>
                  <span className="lv-n">{r.months == null ? <span className="skel" style={{ width: 70, height: 14 }} /> : <><b>{Math.abs(r.months) < 0.05 ? 'no measurable change' : `${sign(r.months)} months`}</b>{dr != null && Math.abs(dr) >= 0.5 ? <small>{sign(dr, 0)} km range</small> : null}{r.rupees != null && Math.abs(r.rupees) >= 1 ? <small>{r.rupees >= 0 ? 'about' : 'costs about'} {rupees(Math.abs(r.rupees))} per bus a year</small> : null}</>}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <div style={{ marginTop: 10 }}><button className="btn sm" aria-pressed={table} onClick={() => setTable((t) => !t)}>{table ? 'Show as list' : 'List as table'}</button></div>
      <p className="note">Each row is the same bus with that one change, median battery life against today. Pack price spread over its life is the rupee figure: undiscounted, first pack only. Not yet validated on buses.</p>
    </section>
  )
}
