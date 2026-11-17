import { useEffect, useMemo, useRef, useState } from 'react'
import { download } from '../../lib/download'
import type { Intake } from '../../lib/fleet/intake'
import { mergeFleet, rejectedCsv, type MergePlan } from '../../lib/fleet/roster'
import { useFleet } from '../../state/FleetContext'
import { toast } from '../Toast'

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`

/** The one gate every input method goes through: nothing joins the fleet until this preview is confirmed, and the last commit can be undone. */
export function FleetGate({ intake, onClose }: { intake: Intake; onClose: () => void }) {
  const { fleet, setFleet } = useFleet()
  const head = useRef<HTMLHeadingElement>(null)
  const [mode, setMode] = useState<'add' | 'replace'>('add')
  const [showRej, setShowRej] = useState(false)
  const now = useRef(Date.now()).current
  const merging = fleet && fleet.kind === 'user' && !intake.fleet
  useEffect(() => { head.current?.focus(); head.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }) }, [intake])

  const plan: MergePlan = useMemo(() => {
    if (intake.fleet) return { ok: true, fleet: intake.fleet, added: intake.fleet.buses.length, updated: 0, kept: 0, replaced: fleet?.buses.length ?? 0, classesBefore: fleet?.classes.length ?? 0, classesAfter: intake.fleet.classes.length, multiplier: 1 }
    return mergeFleet(fleet, intake.drafts, { mode, nowMs: now, source: intake.source, name: intake.name })
  }, [intake, fleet, mode, now])

  const m = intake.missing
  const lines: string[] = []
  if (m) {
    if (m.age) lines.push(`${plural(m.age, 'bus')} ${m.age === 1 ? 'has' : 'have'} no in-service month. ${m.age === 1 ? 'It is' : 'They are'} counted as new today, which can make the replacement look later than it is, and ${m.age === 1 ? 'is' : 'are'} flagged and drawn apart.`)
    if (m.dutyInherited) lines.push(`${plural(m.dutyInherited, 'bus', 'buses')} take${m.dutyInherited === 1 ? 's' : ''} their duty from the other buses on the same route (the median).`)
    if (m.dutyAssumed) lines.push(`${plural(m.dutyAssumed, 'bus', 'buses')} take${m.dutyAssumed === 1 ? 's' : ''} the duty of the bus on screen, because nothing in the file says otherwise.`)
    if (m.type && intake.assumedFrom) lines.push(`${plural(m.type, 'bus', 'buses')} ${m.type === 1 ? 'has' : 'have'} no bus type, so ${m.type === 1 ? 'it is' : 'they are'} taken as ${intake.assumedFrom.type}, like the bus on screen. If that is not right, add a bus_type column.`)
    if (m.price && intake.assumedFrom) lines.push(intake.assumedFrom.priceInr ? `${plural(m.price, 'bus', 'buses')} ${m.price === 1 ? 'has' : 'have'} no battery price of ${m.price === 1 ? 'its' : 'their'} own, so the bus on screen's price (₹${intake.assumedFrom.priceInr.toLocaleString('en-IN')} per kWh) is used to cost a replacement.` : `No battery price is set on the bus on screen, so replacement spend cannot be costed until one is.`)
    if (m.depot) lines.push(`${plural(m.depot, 'bus', 'buses')} will be grouped as “Unassigned” for depot.`)
    if (m.route) lines.push(`${plural(m.route, 'bus', 'buses')} will be grouped as “Unassigned” for route.`)
  }
  const commit = () => {
    if (!plan.ok || !plan.fleet) return
    setFleet(plan.fleet)
    toast(plan.updated || plan.kept ? `${plural(plan.added, 'bus', 'buses')} added, ${plan.updated} updated` : `${plural(plan.fleet.buses.length, 'bus', 'buses')} in your fleet`)
    onClose()
  }
  const sampleNow = fleet?.kind === 'sample' && !intake.fleet
  const title = plan.ok ? 'Check this before it joins your fleet' : 'This can’t be added yet'

  return (
    <section className="card gate" aria-labelledby="gate-h">
      <h2 id="gate-h" tabIndex={-1} ref={head}>{title}</h2>
      <div className="sub">{intake.label} · {intake.detail}</div>

      {plan.ok ? (
        <>
          <dl className="gate-sum">
            {intake.fleet ? (
              <div><dt>Fleet</dt><dd>{plural(intake.fleet.buses.length, 'bus', 'buses')} in {plural(intake.fleet.classes.length, 'duty class', 'duty classes')}{plan.replaced ? <> · replaces your {plural(plan.replaced, 'bus', 'buses')}</> : null}</dd></div>
            ) : mode === 'replace' || !merging ? (
              <div><dt>Fleet</dt><dd>{plural(plan.added, 'bus', 'buses')} in {plural(plan.classesAfter, 'duty class', 'duty classes')}{plan.replaced ? <> · replaces {sampleNow ? 'the sample fleet' : `your ${plural(plan.replaced, 'bus', 'buses')}`}</> : null}</dd></div>
            ) : (
              <>
                <div><dt>New</dt><dd>{plural(plan.added, 'bus', 'buses')}</dd></div>
                <div><dt>Updated</dt><dd>{plural(plan.updated, 'bus', 'buses')} (matched by bus id)</dd></div>
                <div><dt>Not in this file</dt><dd>{plural(plan.kept, 'bus', 'buses')} kept as they are</dd></div>
                <div><dt>Duty classes</dt><dd>{plan.classesBefore} → {plan.classesAfter}</dd></div>
              </>
            )}
          </dl>
          {plan.multiplier > 1 && <p className="gate-warn" role="status">These duties are all slightly different, so grouping them needed a coarser grid (×{plan.multiplier}) to stay within 50 duty classes. Each class shows how far apart its buses can be in battery life.</p>}
          {intake.fleet ? null : <p className="gate-note">Buses with the same duty share one model run. {plural(plan.classesAfter, 'duty class', 'duty classes')} means {plan.classesAfter} runs, not one per bus.</p>}
          {lines.length > 0 && <div className="gate-assume"><b>What was assumed</b><ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul></div>}
          {intake.ignoredColumns.length > 0 && <p className="gate-note">Columns not used: {intake.ignoredColumns.join(', ')}.</p>}
          {intake.notes.map((n) => <p className="gate-note" key={n}>{n}</p>)}
        </>
      ) : <p className="err" role="alert">{plan.message}</p>}

      {intake.rejected.length > 0 && (
        <div className="gate-rej">
          <b>{plural(intake.rejected.length, 'row')} not imported</b>
          <span> · the rest went through. </span>
          <button className="lnk" aria-expanded={showRej} onClick={() => setShowRej((s) => !s)}>{showRej ? 'Hide' : 'Show'} reasons</button>
          <button className="lnk" onClick={() => download('rejected-rows.csv', rejectedCsv(intake.header, intake.rejected))}>Download rejected rows</button>
          {showRej && <ul>{intake.rejected.slice(0, 12).map((r) => <li key={`${r.row}-${r.id ?? ''}`}><b>Row {r.row}{r.id ? ` · ${r.id}` : ''}</b> {r.reason}</li>)}{intake.rejected.length > 12 && <li>…and {intake.rejected.length - 12} more in the download.</li>}</ul>}
        </div>
      )}

      {merging && plan.ok && (
        <fieldset className="gate-mode">
          <legend>How should these join your {plural(fleet!.buses.length, 'bus', 'buses')}?</legend>
          <label><input type="radio" name="mode" checked={mode === 'add'} onChange={() => setMode('add')} /> Add or update (buses are matched by id; nothing is deleted)</label>
          <label><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace my fleet with these</label>
        </fieldset>
      )}
      <div className="row2">
        <button className="btn primary" disabled={!plan.ok} onClick={commit}>{intake.fleet ? 'Use this fleet' : plan.ok && merging && mode === 'add' ? `Add ${plural(plan.added + plan.updated, 'bus', 'buses')}` : 'Create fleet'}</button>
        <button className="btn" onClick={onClose}>Discard</button>
      </div>
      <p className="note">Everything stays in this browser. Only duty classes and bus ages are sent to the server for the forecast. Not yet validated on buses.</p>
    </section>
  )
}
