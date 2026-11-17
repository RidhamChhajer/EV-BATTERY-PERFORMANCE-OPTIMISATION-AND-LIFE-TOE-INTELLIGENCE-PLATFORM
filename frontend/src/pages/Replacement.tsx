import { Fine } from '../components/Fine'
import { Async } from '../components/Async'
import { EvidenceBadge } from '../components/EvidenceBadge'
import { Insight } from '../components/Insight'
import { OpenIn3D } from '../components/OpenIn3D'
import { WhatIfBar } from '../components/WhatIfBar'
import { DotPlot } from '../components/charts/DotPlot'
import { FleetPlan } from '../components/charts/FleetPlan'
import { ProbChart } from '../components/charts/ProbChart'
import { WithTable } from '../components/DataTable'
import { Page } from '../components/Workspace'
import { arr, atYear, fmt, num } from '../lib/format'
import { replacementInsight } from '../lib/insights'
import { probSeries, repYears, xMaxFor, NO_DATE } from '../lib/results'
import { useCurrent } from '../state/useCurrent'
import { useWhatIf } from '../state/WhatIfContext'
import { useYear } from '../state/YearContext'

const yrs = (v: number | null) => (v == null ? <span style={{ fontSize: 14 }}>{NO_DATE}</span> : <>{v.toFixed(1)}<span> yrs</span></>)

export default function Replacement() {
  const { q, scenario } = useCurrent()
  const { year } = useYear()
  const { changed, predB } = useWhatIf()
  return (
    <Page title="When to plan the swap" intro="Each reference run crosses the replacement line at a different time. Plan around a window, never a single date.">
      <Async q={q} h={420}>{(p) => {
        const r = p.replacement, y = repYears(r), prob = probSeries(r), xMax = xMaxFor(p)
        const within = num(r.probability_within_horizon) ?? 0, cdf = arr(r.probability_by_month)
        const alt = changed && predB.data ? predB.data : null
        const horizon = (r.months[r.months.length - 1] ?? 120) / 12
        const price = num(p.cost.battery_cost)
        return (
          <>
            <Insight insight={replacementInsight({ p10: y[0], p50: y[1], p90: y[2], within })} />
            <section className="hero" aria-labelledby="rp-h">
              <div className="hh">
                <div><h2 id="rp-h">Fifty runs, fifty replacement dates</h2><div className="sub">Each dot is 2 % of the model's runs · click or hover to move the year · line at {Math.round(scenario.threshold * 100)} % health</div></div>
                <div className="hh-r"><EvidenceBadge level="derived" /><OpenIn3D lens="health" label="See ageing on the bus" /></div>
              </div>
              <div className="hero-row">
                <div><div className="big">{fmt(atYear(prob, year))}<small>%</small></div><div className="sub">of runs have reached the line by year {year.toFixed(1)}</div></div>
                <div className="sub win">Middle 80 % of runs: {y[0] != null ? `year ${y[0].toFixed(1)}` : 'soon'} to {y[2] != null ? `year ${y[2].toFixed(1)}` : NO_DATE}</div>
              </div>
              <DotPlot cdf={cdf} ghost={alt ? arr(alt.replacement.probability_by_month) : null} xMax={xMax} horizonYears={horizon} marks={y} />
              <p className="note">The model's runs are 50 combinations of two published ageing models and their uncertainty, so the spread is a model spread, not a confidence interval. Not yet validated on buses.</p>
            </section>
            <WhatIfBar base={p} keys={['soc_max_pct', 'threshold', 'km_per_day']} note="Hollow dots show the same fifty runs with your change." />
            <div className="bento">
              <div className="card c7">
                <div className="hd"><div><h2>Plan a fleet</h2><div className="sub">The same spread, applied to your buses</div></div><EvidenceBadge level="derived" /></div>
                <FleetPlan cdf={cdf} packCostInr={price} xMax={xMax} />
                {price == null && <p className="note">Add a battery price per kWh in the scenario to see what the first packs would cost.</p>}
              </div>
              <div className="card c5">
                <div className="hd"><h2>Planning dates</h2><EvidenceBadge level="derived" /></div>
                <div className="sub">Years in service until the line</div>
                <div className="mt3" style={{ marginTop: 0 }}>
                  <div><small>Early (p10)</small><b>{yrs(y[0])}</b></div>
                  <div><small>Median (p50)</small><b style={{ color: 'var(--volt)' }}>{yrs(y[1])}</b></div>
                  <div><small>Late (p90)</small><b>{yrs(y[2])}</b></div>
                </div>
                <div className="row mt"><span>Reached within {scenario.horizon_years} years</span><b>{fmt(within * 100)} % of runs</b></div>
                <div className="row"><span>Replaced by year {year.toFixed(1)}</span><b>{fmt(atYear(prob, year))} %</b></div>
                <Fine count={r.warnings.length + 1}>
                  <p className="note">Window = where 10 % to 90 % of the reference runs have reached the line. Choose the percentile that matches how much risk of early failure you can accept.</p>
                  {r.warnings.map((w) => <p className="note" key={w}>{w}</p>)}
                </Fine>
              </div>
              <div className="card c12">
                <div className="hd"><div><h2>Detail: share of runs that have reached the line</h2><div className="sub">Cumulative share of reference runs · line at {Math.round(scenario.threshold * 100)}% health</div></div><EvidenceBadge level="derived" /></div>
                <WithTable chart={<ProbChart prob={prob} repYears={y} xMax={xMax} />} head={['Year', 'Share reached %']} rows={Array.from({ length: Math.round(xMax * 2) + 1 }, (_, i) => [i / 2, fmt(prob[i * 6])])} />
              </div>
            </div>
          </>
        )
      }}</Async>
    </Page>
  )
}
