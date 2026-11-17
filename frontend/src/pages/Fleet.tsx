import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AddBuses, sampleIntake, type Method } from '../components/fleet/AddBuses'
import { FleetActions } from '../components/fleet/FleetActions'
import { FleetGate } from '../components/fleet/FleetGate'
import { RangeCard } from '../components/fleet/RangeCard'
import { useFleetRange } from '../components/fleet/useFleetRange'
import { busRange, type RangeFilter } from '../lib/fleet/range'
import { AboutForecast } from '../components/fleet/AboutForecast'
import { AnswerStrip } from '../components/fleet/AnswerStrip'
import { HealthCard } from '../components/fleet/HealthCard'
import { WhenCard } from '../components/fleet/WhenCard'
import { BudgetBlock } from '../components/fleet/BudgetBlock'
import { FleetLevers } from '../components/fleet/FleetLevers'
import { MoneyBlock } from '../components/fleet/MoneyBlock'
import { RosterTable } from '../components/fleet/RosterTable'
import { TimelineBlock } from '../components/fleet/TimelineBlock'
import { useFleetBlocks } from '../components/fleet/useFleetBlocks'
import { useReadContext } from '../components/fleet/useReadContext'
import { toast } from '../components/Toast'
import { Page } from '../components/Workspace'
import { postFile } from '../api/client'
import { download } from '../lib/download'
import { budgetCsv, forecastCsv } from '../lib/fleet/exports'
import { toFleetRequest } from '../lib/fleet/io'
import type { Intake } from '../lib/fleet/intake'
import { serializeFleet } from '../lib/fleet/io'
import { rosterCsv } from '../lib/fleet/roster'
import { buildRows, type Band } from '../lib/fleet/segments'
import { useFleet } from '../state/FleetContext'

export default function FleetPage() {
  const { fleet, setFleet, undo, canUndo, saveStatus } = useFleet()
  const ctx = useReadContext()
  const blocks = useFleetBlocks(fleet)
  const range = useFleetRange(fleet, !blocks.stale && blocks.classesDone === blocks.classes.length && blocks.classes.length > 0)
  const rows = useMemo(() => (fleet ? buildRows(fleet, blocks.forecast).map((r) => ({ ...r, range: busRange(range.ranges.get(r.bus.classId), r.age) })) : []), [fleet, blocks.forecast, range.ranges])
  const [rangeFilter, setRangeFilter] = useState<RangeFilter | null>(null)
  const [band, setBand] = useState<Band | null>(null)
  const [method, setMethod] = useState<Method | null>(null)
  const [adding, setAdding] = useState(false)
  const [intake, setIntake] = useState<Intake | null>(null)
  const close = () => { setIntake(null); setMethod(null); setAdding(false) }
  const [pdfBusy, setPdfBusy] = useState(false)
  const fleetPdf = async () => {
    if (!fleet || pdfBusy) return
    setPdfBusy(true)
    try {
      const { blob, filename } = await postFile('/report/fleet-pdf', { ...toFleetRequest(fleet, blocks.asOf), name: fleet.name })
      const url = URL.createObjectURL(blob), a = document.createElement('a')
      a.href = url; a.download = filename === 'pack-horizon-comparison.pdf' ? 'pack-horizon-fleet-forecast.pdf' : filename
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { toast(e instanceof Error ? e.message : 'The fleet report could not be made.') } finally { setPdfBusy(false) }
  }
  const slug = (fleet?.name ?? 'fleet').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'fleet'

  return (
    <Page wide title="Fleet" intro="Your buses in one place. Add them any way you like; you see a preview of what will change, and nothing is added until you confirm it.">
      <div className="bento">
        {canUndo && (
          <div className="c12 undo" role="status">
            <span>{fleet ? 'Your fleet was changed.' : 'The fleet was removed.'}</span>
            <button className="btn sm" onClick={() => { undo(); toast('Undone') }}>Undo</button>
          </div>
        )}
        {fleet && (
          <div className="c12 fleet-head">
            <div className="fh-l">
              <h2>{fleet.kind === 'sample' ? 'Sample fleet' : fleet.name}</h2>
              {fleet.kind === 'sample' && <span className="tag assumption">Synthetic, for demonstration</span>}
              <span className="fh-n">{fleet.buses.length.toLocaleString('en-IN')} {fleet.buses.length === 1 ? 'bus' : 'buses'} · {fleet.classes.length} duty {fleet.classes.length === 1 ? 'class' : 'classes'}</span>
            </div>
            <FleetActions adding={adding} onAdd={() => { setAdding((a) => !a); setMethod(null) }} buses={fleet.buses.length} onRemove={() => { setFleet(null); close(); toast('Fleet removed') }}
              saveFile={{ label: 'Save fleet file', hint: 'Everything, to open again here', onClick: () => download(`${slug}.json`, serializeFleet(fleet), 'application/json') }}
              exports={[
                { label: 'Fleet report (PDF)', hint: 'Budget by year, classes, assumptions and limits', busy: pdfBusy ? 'Making the report…' : undefined, disabled: pdfBusy || !blocks.series, onClick: fleetPdf },
                { label: 'Forecast CSV', hint: 'One row per bus: months to the line, year, risk', disabled: !blocks.series, onClick: () => download(`${slug}-forecast.csv`, forecastCsv(rows, blocks.series, blocks.asOf)) },
                { label: 'Budget CSV', hint: 'Spend and buses per financial year', disabled: !blocks.series, onClick: () => blocks.series && download(`${slug}-budget.csv`, budgetCsv(blocks.series)) },
                { label: 'Roster CSV', hint: 'Your buses, to edit and load back', onClick: () => download(`${slug}-roster.csv`, rosterCsv(fleet)) },
              ]} />
          </div>
        )}
        {fleet && saveStatus !== 'saved' && (
          <div className="c12 errbox" role="alert">
            <b>{saveStatus === 'too_big' ? 'This fleet is too large to keep in the browser.' : 'This browser is not letting the page save.'}</b>
            <p>It still works for now, but it will be gone when you leave the page. Save the fleet file to keep it.</p>
          </div>
        )}
        {intake && <div className="c12"><FleetGate intake={intake} onClose={close} /></div>}
        {!intake && !fleet && (
          <section className="card c12 first" aria-labelledby="first-h">
            <h2 id="first-h">Where do you want to start?</h2>
            <div className="sub">Plan battery replacements for a whole fleet, or look at one bus. You see a preview before anything is added.</div>
            <div className="first-g">
              <div className="first-m"><h3>Bring your buses</h3><AddBuses ctx={ctx} fleet={fleet} method={method} onMethod={setMethod} onIntake={setIntake} /></div>
              <div className="first-s">
                <button className="meth-b" disabled={!ctx} onClick={() => ctx && setIntake(sampleIntake(ctx))}><b>Try the sample fleet</b><span>60 synthetic buses, to see every block working. Labelled as synthetic.</span></button>
                <Link className="meth-b" to={`/health${window.location.search}`}><b>Just one bus</b><span>Skip the fleet: its health, range and cost.</span></Link>
              </div>
            </div>
          </section>
        )}
        {!intake && fleet && adding && (
          <div className="card c12">
            <h2>Add buses</h2>
            <div className="sub">Pick a way in. You will see what changes before anything is added.</div>
            <AddBuses ctx={ctx} fleet={fleet} method={method} onMethod={setMethod} onIntake={setIntake} />
          </div>
        )}
        {fleet && blocks.failed && !blocks.forecast && (
          <div className="c12 errbox" role="alert"><b>The forecast could not be worked out.</b><p>The roster still works. Check that the server is running, then change or re-add a bus to try again.</p></div>
        )}
        {fleet && <AnswerStrip series={blocks.series} rows={rows} loading={blocks.main.isPending} onBand={setBand} onRange={setRangeFilter} />}
        {fleet && blocks.series && (
          <>
            <WhenCard stale={blocks.stale}
              year={<BudgetBlock bare series={blocks.series} depots={blocks.depots} unknown={blocks.unknown} moreDepots={blocks.moreDepots} stale={blocks.stale} />}
              byClass={<TimelineBlock bare classes={blocks.classes} labels={blocks.series.labels} done={blocks.classesDone} total={blocks.classes.length} stale={blocks.stale} />} />
            <HealthCard fleet={fleet} rows={rows} band={band} onBand={setBand} loading={blocks.main.isPending} />
            <RangeCard fleet={fleet} rows={rows} ranges={range.ranges} done={range.done} total={range.total} filter={rangeFilter} onFilter={setRangeFilter} />
            {blocks.forecast && <MoneyBlock rows={rows} forecast={blocks.forecast} stale={blocks.stale} />}
            <FleetLevers fleet={fleet} ready={!blocks.stale && blocks.classesDone === blocks.classes.length} />
          </>
        )}
        {fleet && blocks.main.isPending && !blocks.series && <div className="c12 card" role="status" aria-busy="true"><div className="skel" style={{ height: 120 }} /><p className="note">Working out the forecast…</p></div>}
        {fleet && <div className="c12"><RosterTable fleet={fleet} rows={rows} forecast={blocks.forecast} series={blocks.series} stale={blocks.stale} loading={blocks.main.isPending || blocks.stale} band={band} onBand={setBand} rangeFilter={rangeFilter} onRangeFilter={setRangeFilter} /></div>}
        {fleet && <AboutForecast />}
      </div>
    </Page>
  )
}
