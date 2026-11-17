import type { ReferenceEngine, ReferenceModel } from '../api/types'
import { fmt } from '../lib/format'

const rng = (r: [number, number], unit: string, scale = 1) => `${fmt(r[0] * scale, 0)} to ${fmt(r[1] * scale, 0)} ${unit}`
const host = (u: string) => u.replace(/^https?:\/\/(doi\.org\/)?/, '')

function Model({ m }: { m: ReferenceModel }) {
  const t = m.tested_range
  return (
    <div className="card" style={{ background: 'var(--bg)' }}>
      <div className="lbl">{m.nominal_ah} Ah cell · {m.n_parameters} fitted parameters</div>
      <h3 style={{ fontSize: 17 }}>{m.label}</h3>
      <p className="note" style={{ marginTop: 8 }}>{m.structure}</p>
      <p className="note">{m.data}</p>
      <div className="row"><span>Cycled at temperatures</span><b>{rng(t.cycling_temperature_c, '°C')}</b></div>
      <div className="row"><span>Depth of discharge</span><b>{rng(t.depth_of_discharge, '%', 100)}</b></div>
      <div className="row"><span>Highest charge rate</span><b>{fmt(t.max_charge_c_rate, 2)} C</b></div>
      <p className="note">{m.data_sources.map((u, i) => (
        <span key={u}>{i > 0 && ' · '}<a href={u} target="_blank" rel="noreferrer noopener">{host(u)} ↗</a></span>))}</p>
    </div>
  )
}

export function ReferenceEngineCard({ r }: { r: ReferenceEngine }) {
  const e = r.ensemble
  return (
    <div className="card c12 refcard">
      <h2>The ageing models behind every number</h2>
      <div className="sub">Two published lithium-iron-phosphate cell models from the US National Renewable Energy Laboratory (BLAST-Lite {r.version}), fitted to laboratory tests. Not validated on buses.</div>
      <div className="xverdict">
        <b>Each result is a range from {e.runs_per_scenario} runs, not a single prediction.</b>{' '}
        The runs combine the {e.models} models, {e.degradation_scalars} levels of cell-to-cell scatter and {e.pack_penalty_values} values of an assumed pack penalty (the weakest cell ends the pack's life earlier).
        The range is how far these disagree. It is not a statistical confidence interval.
      </div>
      <div className="bento" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))' }}>{r.models.map((m) => <Model key={m.id} m={m} />)}</div>
      <h3 className="xh">How the range is built</h3>
      <ul className="xlist">
        <li><b>Cell-to-cell scatter.</b> Each model's degradation rate is scaled by a factor with a standard deviation of {fmt(e.degradation_scalar_std, 2)}. {e.scalar_note}</li>
        <li><b>Pack penalty.</b> {e.pack_penalty_note} The default range is 20 to 30 %, NREL's rule of thumb for how much sooner a pack ends than its average cell. It is an assumption.</li>
        <li><b>Operating day.</b> One representative day (drive, charge, rest) per month, using real monthly temperatures for the zone plus an assumed heat rise. Depth of discharge grows slightly as the pack loses capacity.</li>
      </ul>
      {r.port_check && (
        <>
          <h3 className="xh">How closely this tool reproduces the original package</h3>
          <div className="sub">The tool uses its own copy of the equations so it can run on a small server. It is checked against BLAST-Lite {r.port_check.package_version} itself.</div>
          <div className="row"><span>Bus scenarios compared ({r.port_check.scenarios_compared})</span><b>largest gap {fmt(r.port_check.bus_duty_max_diff_points, 2)} points of capacity</b></div>
          <div className="row"><span>Fixed conditions compared ({r.port_check.fixed_conditions_compared})</span><b>largest gap {fmt(r.port_check.fixed_condition_max_diff_points, 3)} points</b></div>
        </>
      )}
      <p className="note">BLAST-Lite is open source ({r.licence.split(',')[0]}); the licence notice is kept in the repository. <a href={r.source_url} target="_blank" rel="noreferrer noopener">BLAST-Lite ↗</a></p>
    </div>
  )
}
