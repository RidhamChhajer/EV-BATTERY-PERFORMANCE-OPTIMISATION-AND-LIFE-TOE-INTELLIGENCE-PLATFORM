import { useState } from 'react'
import { Async } from '../components/Async'
import { EvidenceBadge } from '../components/EvidenceBadge'
import { Insight } from '../components/Insight'
import { LeverRank } from '../components/LeverRank'
import { NotesList } from '../components/NotesDrawer'
import { OpenIn3D } from '../components/OpenIn3D'
import { WhatIfBar } from '../components/WhatIfBar'
import { CAL, CYC, CellField } from '../components/charts/CellField'
import { DayStrip } from '../components/charts/DayStrip'
import { HealthChart } from '../components/charts/HealthChart'
import { TempRing } from '../components/charts/TempRing'
import { WithTable } from '../components/DataTable'
import { Page } from '../components/Workspace'
import { arr, atYear, fmt, num } from '../lib/format'
import { staggerWindow } from '../lib/dayCycle'
import { hhmm } from '../lib/scenario'
import { healthInsight } from '../lib/insights'
import { buildNotes } from '../lib/notes'
import { curves, repYears, xMaxFor } from '../lib/results'
import { buildSceneParams } from '../lib/sceneParams'
import { usePlayYear } from '../lib/usePlayYear'
import { useCurrent } from '../state/useCurrent'
import { useWhatIf } from '../state/WhatIfContext'
import { useYear } from '../state/YearContext'

export default function Health() {
  const { q, scenario, valid } = useCurrent()
  const { year } = useYear()
  const { changed, predB, set } = useWhatIf()
  const [band, setBand] = useState(true), [thr, setThr] = useState(true)
  const xMax = q.data ? xMaxFor(q.data) : 10
  const play = usePlayYear(xMax)
  return (
    <Page title="How much capacity is left" intro="The line is the median across the reference runs. The shaded band runs from the 10th to the 90th percentile: a spread between two published models, not a confidence interval. Hover to read a year, click to pick it.">
      <Async q={q} h={420}>{(p) => {
        const c = curves(p.replacement), r = repYears(p.replacement)
        const cal = num(p.driver_split.calendar_share) ?? 0.5
        const scene = buildSceneParams(scenario, p, year)
        const lo = atYear(c.p10, year), mid = atYear(c.p50, year), hi = atYear(c.p90, year)
        const alt = changed && predB.data ? predB.data : null
        const idleH = num(p.conditions.idle_hours_at_soc_max) ?? 0
        return (
          <>
            <Insight insight={healthInsight({ calendarShare: cal, idleH, capPct: scenario.soc_max_pct })} />
            <section className="hero" aria-labelledby="ag-h">
              <div className="hh">
                <div><h2 id="ag-h">Ageing lab</h2><div className="sub">Ninety-six cells at year {year.toFixed(1)} · press play or click the chart below</div></div>
                <div className="hh-r"><EvidenceBadge level="derived" /><OpenIn3D lens="health" label="See ageing on the bus" /></div>
              </div>
              <div className="lab">
                <div className="lab-l">
                  <div className="lab-top">
                    <button className="play" aria-label={play.playing ? 'Pause the years' : 'Play the years'} aria-pressed={play.playing} onClick={play.toggle}>
                      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d={play.playing ? 'M3 2h3.4v12H3zM9.6 2H13v12H9.6z' : 'M4 2v12l10-6z'} fill="#09090B" /></svg>
                    </button>
                    <div><div className="big">{fmt(mid, 1)}<small>%</small></div><div className="sub">of new capacity left · {fmt(lo, 1)} % to {fmt(hi, 1)} % across the runs</div></div>
                  </div>
                  <div className="legd lab-lg"><span><i style={{ background: 'var(--volt)' }} />capacity left</span><span><i style={{ background: CAL }} />lost to waiting</span><span><i style={{ background: CYC }} />lost to cycling</span><span><i className="tk" />replacement line</span></div>
                  <p className="note">Rings are a picture of the model: it gives one health curve with a spread, so cells are scattered inside that spread. The split between waiting and cycling is the share at replacement ({fmt(cal * 100)} % waiting), applied to the loss at every year.</p>
                </div>
                <div className="lab-r" role="img" aria-label={`Ninety-six cells. At year ${year.toFixed(1)} the median pack has ${fmt(mid, 1)} percent of its new capacity, between ${fmt(lo, 1)} and ${fmt(hi, 1)} percent across the runs.`}>
                  <CellField band={{ lo: lo / 100, mid: mid / 100, hi: hi / 100 }} calendarShare={cal} linePct={scenario.threshold * 100} />
                </div>
              </div>
            </section>
            <WhatIfBar base={p} keys={['soc_max_pct', 'charge_start_hour', 'heat_rise_c']} note="The ghost line on the chart below is the same bus with your change." />
            <div className="bento">
              <LeverRank base={p} scenario={scenario} day={scene.day} ready={valid && !q.isFetching} />
              <div className="card c8">
                <div className="hd"><div><h2>Health over time</h2><div className="sub">Median and range · {scenario.soc_max_pct}% charge cap</div></div><EvidenceBadge level="derived" /></div>
                <div className="lg">
                  <button aria-pressed={band} onClick={() => setBand(!band)}><i style={{ background: 'rgba(250,204,21,.45)' }} />Range</button>
                  <button aria-pressed={thr} onClick={() => setThr(!thr)}><i style={{ background: '#fff' }} />Replacement line</button>
                </div>
                <WithTable chart={<HealthChart {...c} thresholdPct={scenario.threshold * 100} medianYear={r[1]} xMax={xMax} showBand={band} showThreshold={thr} other={alt ? curves(alt.replacement).p50 : undefined} otherLabel="With your change" />}
                  head={['Year', 'Low (10th pct) %', 'Median %', 'High (90th pct) %']}
                  rows={Array.from({ length: Math.round(xMax * 2) + 1 }, (_, i) => { const m = i * 6; return [m / 12, fmt(c.p10[m]), fmt(c.p50[m]), fmt(c.p90[m])] })} />
              </div>
              <div className="card c4">
                <div className="hd"><h2>What wears it out</h2><EvidenceBadge level="derived" /></div>
                <div className="sub">Share of the loss when the pack reaches the line</div>
                <div className="kpi">{fmt(cal * 100)}<small>% waiting</small></div>
                <div className="split"><i style={{ width: `${cal * 100}%`, background: 'var(--volt)' }} /><i style={{ width: `${(1 - cal) * 100}%`, background: '#52525B' }} /></div>
                <div className="legd"><span><i style={{ background: 'var(--volt)' }} />Calendar ageing</span><span><i style={{ background: '#52525B' }} />Cycling <b style={{ color: '#fff' }}>{fmt((1 - cal) * 100)} %</b></span></div>
                <div className="mt3">
                  <div><small>Cycles a year</small><b>{fmt(num(p.conditions.efc_per_year), 0)}</b></div>
                  <div><small>Cell temp</small><b>{fmt(num(p.conditions.effective_temp_c), 0)}<span> °C</span></b></div>
                  <div><small>Charge level</small><b>{fmt(num(p.conditions.calendar_equivalent_soc_pct), 0)}<span> %</span></b></div>
                </div>
                <p className="note">Charge level is the average state of charge over the year that the ageing models see, worked out from the daily drive, the charging window and idle days. It is an assumption, not a measurement.</p>
              </div>
              <div className="card c6">
                <div className="hd"><div><h2>One day, hour by hour</h2><div className="sub">Resting full for {fmt(idleH, 1)} h a day</div></div><EvidenceBadge level="derived" /></div>
                <DayStrip day={scene.day} />
                {(() => {
                  const w = staggerWindow(scene.day)
                  return (<>
                    <p className="tnote">
                      {w.room >= 0.5
                        ? `This pack rests full for ${fmt(w.idleH, 1)} h. Charging can start anywhere in the ${fmt(w.room, 1)} h from ${hhmm(w.earliest)} to ${hhmm(w.latest)} and still finish 30 minutes before departure, so a depot short of chargers can stagger its buses across that window.`
                        : `This pack rests full for only ${fmt(w.idleH, 1)} h, so charging has no room to start later and still finish 30 minutes before departure.`}
                      {w.room >= 0.5 && <> <button className="btn sm" onClick={() => set('charge_start_hour', w.latest)}>Try {hhmm(w.latest)} start</button></>}
                    </p>
                    <p className="note">Time spent full and warm is what calendar ageing charges for. A later start or a lower cap shortens it. Charger counts are not modelled.</p>
                  </>)
                })()}
              </div>
              <div className="card c6">
                <div className="hd"><div><h2>Cell temperature through the year</h2><div className="sub">January at the top, clockwise · hottest month outlined</div></div><EvidenceBadge level="derived" /></div>
                <TempRing temps={arr(p.conditions.monthly_cell_temp_c)} effective={num(p.conditions.effective_temp_c)} />
                <p className="note">Air temperature from NASA POWER plus an assumed pack heat rise. No thermal-management data exists for buses.</p>
              </div>
              <div className="card c12">
                <h2>What the model wants you to know</h2><div className="sub">What changes what you should do is shown; the limits are one click away</div>
                <NotesList fold notes={buildNotes({ a: p })} />
              </div>
            </div>
          </>
        )
      }}</Async>
    </Page>
  )
}
