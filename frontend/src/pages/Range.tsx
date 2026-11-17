import { Fine } from '../components/Fine'
import { Async } from '../components/Async'
import { EvidenceBadge } from '../components/EvidenceBadge'
import { Insight } from '../components/Insight'
import { OpenIn3D } from '../components/OpenIn3D'
import { WhatIfBar } from '../components/WhatIfBar'
import { ReachChart } from '../components/charts/ReachChart'
import { RoadMeter } from '../components/charts/RoadMeter'
import { SeasonChart } from '../components/charts/SeasonChart'
import { WithTable } from '../components/DataTable'
import { Page } from '../components/Workspace'
import { useLeverSweep, useZones } from '../api/hooks'
import { arr, atYear, fmt, num } from '../lib/format'
import { rangeInsight } from '../lib/insights'
import { coverage, rangeAt, routeNeedKm, shortfallRisk } from '../lib/routefit'
import { routeStep } from '../lib/levers'
import { lifeDelta } from '../lib/whatif'
import { curves, xMaxFor } from '../lib/results'
import { ZONE_LABELS } from '../lib/scenario'
import { useScenario } from '../state/ScenarioContext'
import { useCurrent } from '../state/useCurrent'
import { useWhatIf } from '../state/WhatIfContext'
import { useYear } from '../state/YearContext'

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length

export default function Range() {
  const { q, scenario, valid } = useCurrent()
  const { setField } = useScenario()
  const { changed, predB, set } = useWhatIf()
  const { year } = useYear()
  const zones = useZones()
  const z = zones.data?.zones.find((x) => x.id === scenario.zone)
  // one extra cached /predict: the same bus on a route 20 % shorter
  const rs = routeStep(scenario)
  const route = useLeverSweep(rs ? [{ ...scenario, km_per_day: rs.value }] : [], valid && !!q.data && !q.isFetching)[0]?.data
  return (
    <Page title="Season, climate and range" intro="How far a full charge goes now, how that shrinks with age, and whether it still covers your route. The model gives one range for every month, because no public data links cold or heat to LFP bus range.">
      <Async q={q} h={300}>{(p) => {
        const c = curves(p.replacement), xMax = xMaxFor(p), newKm = num(p.range.new_pack_range_km) ?? 0
        const need = routeNeedKm(scenario.km_per_day)
        const m = coverage(newKm, c.p50, need), ca = coverage(newKm, c.p10, need)
        const risk = shortfallRisk(newKm, c.p10, c.p50, c.p90, need, year)
        const shorter = rs && route ? (() => {
          const rc = curves(route.replacement), rn = routeNeedKm(rs.value), rk = num(route.range.new_pack_range_km) ?? newKm
          return { km: rs.value, delta: lifeDelta(p.replacement, route.replacement), cover: coverage(rk, rc.p50, rn) }
        })() : null
        const now = rangeAt(newKm, c.p50, year), nowC = rangeAt(newKm, c.p10, year)
        const alt = changed && predB.data ? predB.data : null
        const ghost = alt ? { newKm: num(alt.range.new_pack_range_km) ?? 0, p50: curves(alt.replacement).p50 } : null
        return (
          <>
            <Insight insight={rangeInsight({ need, newKm, median: m, cautious: ca, risk: risk.years })} />
            <section className="hero" aria-labelledby="rf-h">
              <div className="hh">
                <div><h2 id="rf-h">Does it cover your route?</h2><div className="sub">Drag the flag to change the route length · year {year.toFixed(1)}</div></div>
                <div className="hh-r"><EvidenceBadge level="derived" /><OpenIn3D lens="range" label="See range on the bus" /></div>
              </div>
              <div className="hero-row">
                <div><div className="big">{fmt(now)}<small>km</small></div><div className="sub">on a full charge at year {year.toFixed(1)} · {fmt(nowC)} km on the cautious curve</div></div>
                <div className="verdict" data-ok={m.kind === 'beyond' || (m.kind === 'until' && (m.year ?? 0) > year)}>
                  {m.kind === 'never' ? 'Short from day one' : m.kind === 'beyond' ? 'Covers the whole forecast' : `Covers it until year ${(m.year ?? 0).toFixed(1)}`}
                  <small>At year {year.toFixed(1)}: {risk.text}</small>
                </div>
              </div>
              <RoadMeter p50Km={now} p10Km={nowC} needKm={need} maxKm={Math.max(newKm, need) * 1.1} onNeed={(k) => setField('km_per_day', Math.max(20, Math.min(600, k)))} />
              {shorter && (
                <p className="tnote">
                  {shorter.delta ? `On a route 20 % shorter (${shorter.km} km a day) the pack lasts about ${Math.abs(shorter.delta.months).toFixed(1)} months ${shorter.delta.months >= 0 ? 'longer' : 'less'} in this model` : `On a route 20 % shorter (${shorter.km} km a day) the change in life cannot be measured`}
                  {shorter.cover.kind === 'until' ? ` and still covers it until year ${(shorter.cover.year ?? 0).toFixed(1)}.` : shorter.cover.kind === 'beyond' ? ' and covers it for the whole forecast.' : ', but a new pack is still short of it.'}
                  {' '}<button className="btn sm" onClick={() => set('km_per_day', shorter.km)}>Try {shorter.km} km a day</button>
                </p>
              )}
              <ReachChart newKm={newKm} p50={c.p50} p10={c.p10} needKm={need} xMax={xMax} ghost={ghost} />
              <p className="note">Range = usable energy × health ÷ energy use, from the model's median and cautious (10th percentile) health curves. Click the chart to pick a year. Not yet validated on buses.</p>
            </section>
            <WhatIfBar base={p} keys={['soc_max_pct', 'kwh_per_km', 'km_per_day']} note="Both of the first two change how much energy a full charge holds or uses, so they move the range."
              result={(a) => { const k = num(a.range.new_pack_range_km); return k != null ? <>New-pack range <strong>{fmt(k)} km</strong> (was {fmt(newKm)} km)</> : null }} />
          </>
        )
      }}</Async>
      <div className="bento">
        <div className="card c7">
          <div className="hd"><div><h2>Air temperature by month</h2><div className="sub">{ZONE_LABELS[scenario.zone]} · {z ? `${z.elevation_m} m · NASA POWER ${zones.data?.period.slice(0, 4)}–${zones.data?.period.slice(9, 13)}` : 'loading…'} · bar = monthly mean, line = average day and night</div></div><span className="tag lab">real weather</span></div>
          {z ? <WithTable chart={<SeasonChart months={z.monthly} />} head={['Month', 'Mean °C', 'Day °C', 'Night °C']} rows={z.monthly.map((m) => [m.month, m.tmean_c.toFixed(1), m.tmax_mean_c.toFixed(1), m.tmin_mean_c.toFixed(1)])} />
            : <div className="skel" style={{ height: 260 }} />}
        </div>
        <div className="card c5">
          <Async q={q} h={260}>{(p) => {
            const ret = arr(p.replacement.retention_p50), now = atYear(ret, year), nw = num(p.range.new_pack_range_km) ?? 0
            return (<>
              <div className="hd"><h2>Range on a full charge</h2><EvidenceBadge level="derived" /></div>
              <div className="sub">Median pack at year {year.toFixed(1)}</div>
              <div className="kpi">{fmt(nw * now)}<small>km</small></div>
              <div className="bar mt"><i style={{ width: `${now * 100}%` }} /></div>
              <div className="legd" style={{ marginTop: 8 }}><span>0</span><span>{fmt(nw)} km new</span></div>
              <table className="tbl mt"><thead><tr><th>Pack age</th><th>Median km</th><th>Cautious km</th></tr></thead><tbody>
                {p.range.ages_years.map((a) => <tr key={a}><td>{a} years</td><td>{fmt(mean(arr(p.range.range_km_p50[String(a)])))}</td><td>{fmt(mean(arr(p.range.range_km_p10[String(a)])))}</td></tr>)}
              </tbody></table>
              <Fine count={p.range.warnings.length + 1}><p className="note">Usable energy × health ÷ energy use. Air conditioning and seasonal consumption are not modelled, so every month shows the same range. The weather chart is context only: the model does not change range with temperature.</p>
              {p.range.warnings.map((w) => <p className="note" key={w}>{w}</p>)}</Fine>
            </>)
          }}</Async>
        </div>
      </div>
    </Page>
  )
}
