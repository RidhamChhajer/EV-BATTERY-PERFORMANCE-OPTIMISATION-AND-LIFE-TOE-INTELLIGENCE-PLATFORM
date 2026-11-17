import { useEvidence } from '../api/hooks'
import { Async } from '../components/Async'
import { ReferenceEngineCard } from '../components/ReferenceEngineCard'
import { Page } from '../components/Workspace'
import { fmt } from '../lib/format'

const NAME: Record<string, string> = { weather: 'NASA POWER weather', evbattery: 'EVBattery field data' }
const SHOWN = Object.keys(NAME)           // our own lab-data fits are kept in the code but are not what the app shows
const TAG = ['Scope', 'Scope', 'Extrapolated', 'Range', 'Assumption', 'Not modelled', 'Not modelled', 'Policy']

export default function Evidence() {
  const q = useEvidence()
  return (
    <Page wide title="What this rests on" intro="Published laboratory-fitted cell models and public weather data. Every bus-level number is an assumption or derived from one, and none of it has been validated on buses.">
      <Async q={q} h={420}>{(e) => {
        const m = e.metrics, r = e.reference_engine, pc = r.port_check
        const nodes = [
          { t: 'Cell ageing', s: 'Published NREL LFP cell models', n: String(r.models.length), d: 'laboratory-fitted models, run side by side', f: pc ? `matches the original package within ${fmt(pc.bus_duty_max_diff_points, 1)} points` : 'ported from BLAST-Lite', h: true },
          { t: 'Bus translation', s: 'Scenario into cell conditions', n: '0', d: 'buses measured', f: 'labelled assumptions · real weather' },
          { t: 'Decisions', s: 'Replacement, range, cost', n: String(r.ensemble.runs_per_scenario), d: 'runs per scenario give the range', f: 'a spread of models, not a confidence interval' },
        ]
        return (
          <div className="bento">
            <div className="card c12"><h2>Model pipeline</h2><div className="sub">Model version {e.model_version} · prior mode</div>
              <div className="bento" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(230px,100%),1fr))' }}>{nodes.map((n, i) => (
                <div key={n.t} className="card" style={{ background: 'var(--bg)', borderColor: n.h ? 'var(--volt)' : undefined }}>
                  <div className="lbl">Step {i + 1}</div><h3>{n.t}</h3><div className="sub" style={{ marginBottom: 10 }}>{n.s}</div>
                  <div className="kpi" style={{ fontSize: 46, color: 'var(--volt)' }}>{n.n}</div><div style={{ marginTop: 6 }}>{n.d}</div><div className="note">{n.f}</div>
                </div>))}</div>
            </div>
            <ReferenceEngineCard r={r} />
            <div className="card c12"><h2>Where the models were tested</h2><div className="sub">The default bus sits partly outside this, and every result says so when it does.</div>
              <div className="scrollx"><table className="tbl">
                <thead><tr><th scope="col">Condition</th>{r.models.map((x) => <th key={x.id} scope="col">{x.nominal_ah} Ah model</th>)}<th scope="col">Default 12 m bus</th></tr></thead>
                <tbody>
                  <tr><td>Cycling temperature</td>{r.models.map((x) => <td key={x.id}>{x.tested_range.cycling_temperature_c.join(' to ')} °C</td>)}<td>19 to 38 °C (hot, dry zone)</td></tr>
                  <tr><td>Depth of discharge per day</td>{r.models.map((x) => <td key={x.id}>{x.tested_range.depth_of_discharge.map((v) => Math.round(v * 100)).join(' to ')} %</td>)}<td>about 69 %</td></tr>
                  <tr><td>Highest charge rate</td>{r.models.map((x) => <td key={x.id}>{x.tested_range.max_charge_c_rate} C</td>)}<td>about 0.34 C</td></tr>
                </tbody>
              </table></div>
              <p className="note">Neither cell was cycled below 80 % depth of discharge, so the cycling term is extrapolated for buses. Neither model has a late-life knee, so the point where capacity starts to fall quickly is not represented.</p></div>
            <div className="card c12"><h2>Datasets</h2><div className="sub">Real, free, public. Nothing synthetic is used. The cell models' own laboratory data are described under the models above.</div>
              <div className="bento" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(250px,100%),1fr))' }}>{e.datasets.filter((d) => SHOWN.includes(d.id)).map((d) => (
                <div key={d.id} className="card" style={{ background: 'var(--bg)' }}>
                  <h3 style={{ fontSize: 16 }}>{NAME[d.id] ?? d.id}</h3><div className="sub" style={{ marginBottom: 8 }}>{d.used_for.split(' (')[0]}</div>
                  <span className={`tag ${d.id === 'evbattery' ? 'assumption' : 'lab'}`}>{d.id === 'evbattery' ? 'real data · not LFP, demo only' : 'real data'}</span>
                  <div className="row mt"><span>Licence</span><b>{d.licence}</b></div><p className="note">{d.limitations}</p>
                  <a className="note" href={d.source_url} target="_blank" rel="noreferrer noopener">Source ↗</a>
                </div>))}</div>
            </div>
            <div className="card c12"><h2>What vendor data would change</h2>
              <div className="sub">A method demonstration on public field data, not a result for LFP buses. Prior mode, which you are using, needs none of this.</div>
              {(() => {
                const cd = m.calibration_demo, rs = cd.with_snippet_features.results, r0 = rs[0], r5 = rs.find((r) => r.n_labels === 5), top = Math.max(...rs.map((r) => Math.max(r.prior_mape, r.no_pooling_mape)))
                return (
                  <div className="cal">
                    <div className="scrollx"><table className="tbl">
                      <thead><tr><th>Labelled records from the vehicle</th><th>Capacity error</th><th>Plain average</th><th>Shrunk toward prior</th></tr></thead>
                      <tbody>{rs.map((r) => (
                        <tr key={r.n_labels}><td>{r.n_labels === 0 ? 'None (prior only)' : r.n_labels}</td>
                          <td><span className="bar"><i style={{ width: `${(r.partial_pooling_mape / top) * 100}%` }} /></span><b>{fmt(r.partial_pooling_mape, 2)}%</b></td>
                          <td>{r.n_labels === 0 ? '–' : `${fmt(r.no_pooling_mape, 2)}%`}</td><td>{r.n_labels === 0 ? '–' : `${fmt(r.partial_pooling_mape, 2)}%`}</td></tr>))}
                      </tbody>
                    </table></div>
                    {r5 && <p>With only 5 labelled records for a vehicle the model has never seen, the typical capacity error fell from {fmt(r0.prior_mape, 2)}% to {fmt(r5.partial_pooling_mape, 2)}%, and it was no worse in {fmt(r5.vehicles_not_worse_pct)}% of vehicles. Shrinking the correction toward the prior changes little on average ({fmt(r5.partial_pooling_mape, 2)}% against {fmt(r5.no_pooling_mape, 2)}%). Its job is to stop a few noisy records from over-correcting.</p>}
                    <p className="note">{cd.with_snippet_features.vehicles_evaluated} vehicles evaluated. {cd.split}. {cd.evaluation}. {cd.caveat}</p>
                  </div>
                )
              })()}
            </div>
            <div className="card c12"><h2>Known limits</h2><div className="sub">Read before quoting any number</div>
              <div className="bento" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px,100%),1fr))' }}>{e.limitations.map((t, i) => (
                <div key={t} className="card" style={{ background: 'var(--bg)' }}><div className="lbl">{String(i + 1).padStart(2, '0')} · {e.limitations.length === TAG.length ? TAG[i] : 'Limit'}</div><p style={{ margin: 0 }}>{t}</p></div>))}</div>
            </div>
          </div>
        )
      }}</Async>
    </Page>
  )
}
