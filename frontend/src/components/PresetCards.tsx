import type { PresetResult, RecommendResponse, Stage } from '../api/types'
import { duplicateOf, leverValue, lifeChange, signed, stageFor } from '../lib/busB'
import { num } from '../lib/format'

function Outcome({ st }: { st: Stage }) {
  const d = st.delta, life = lifeChange(num(d.months_p50) ?? 0, num(d.months_p10) ?? 0, num(d.months_p90) ?? 0, d.p90_beyond_horizon)
  const cost = num(d.cost_per_km_change), rng = num(d.range_change_km) ?? 0
  const up = (num(d.months_p50) ?? 0) > 0.05
  return (
    <div className="pout">
      <div className="pout-m"><b className={up ? 'up' : undefined}>{life.headline}</b><span>battery life · {life.range}</span></div>
      <div className="pout-c">
        <span title="Battery cost per km, median">{cost == null ? 'Cost: set a battery price' : cost === 0 ? 'Cost per km: no change' : <>Cost per km <b>{cost < 0 ? '−' : '+'}₹{Math.abs(cost).toFixed(2)}</b></>}</span>
        <span title="Range when the pack is due for replacement">Range <b>{Math.abs(rng) < 0.5 ? 'unchanged' : signed(rng, 0, ' km')}</b></span>
      </div>
    </div>
  )
}

function Card({ p, stage, dup, applied, onTry }: { p: PresetResult; stage: Stage; dup: PresetResult | null; applied: boolean; onTry: () => void }) {
  return (
    <article className={`pcard${applied ? ' on' : ''}${dup ? ' dup' : ''}`}>
      <div className="hd"><div><h3>{p.title}</h3><div className="sub">{p.goal}</div></div>{applied && <span className="tag lab">Shown on Bus B</span>}</div>
      {dup ? <p className="psum">The search found the same best option as <b>{dup.title}</b>, so the advice is identical.</p> : (
        <>
          <Outcome st={stage} />
          {stage.changes.length > 0 && (
            <ul className="pchg" aria-label="Changes">{stage.changes.map((c) => (
              <li key={c.lever}>
                <span className="pchg-l">{c.label}</span>
                <span className="pchg-v"><s>{leverValue(c.lever, c.from_value.value as number, c.unit)}</s> → <b>{leverValue(c.lever, c.to_value.value as number, c.unit)}</b></span>
                {c.needs_confirmation && <span className="tag assumption">needs your confirmation</span>}
              </li>))}
            </ul>
          )}
          {!stage.feasible && <p className="pwarn">Does not meet the route rule. Treat with care.</p>}
          <details className="pwhy">
            <summary>Why these changes</summary>
            <p>{stage.summary}</p>
            {stage.changes.length > 0 && <ul>{stage.changes.map((c) => <li key={c.lever}><b>{c.label}.</b> {c.why}</li>)}</ul>}
            {p.rejected.length > 0 && <><h4>Ruled out by the search</h4><ul>{p.rejected.map((r) => <li key={r}>{r}</li>)}</ul></>}
          </details>
        </>
      )}
      <button className={`btn${applied ? '' : ' primary'}`} onClick={onTry} aria-pressed={applied}>{applied ? 'Shown on Bus B' : 'Try on Bus B'}</button>
    </article>
  )
}

export function PresetCards({ rec, includeConfirm, appliedId, onTry }: { rec: RecommendResponse; includeConfirm: boolean; appliedId: string | null; onTry: (p: PresetResult) => void }) {
  return (
    <div className="pstack">
      {rec.presets.map((p) => <Card key={p.id} p={p} stage={stageFor(p, includeConfirm)} dup={duplicateOf(p, rec.presets, includeConfirm)} applied={appliedId === p.id} onTry={() => onTry(p)} />)}
    </div>
  )
}
