import type { CSSProperties, ReactNode } from 'react'
import type { PredictionResult } from '../api/types'
import { useScopeSize } from '../state/scope'
import { lifeValue, valueLine } from '../lib/money'
import { num } from '../lib/format'
import { lifeDelta, whatIfSpecs, type WKey } from '../lib/whatif'
import { useScenario } from '../state/ScenarioContext'
import { useWhatIf } from '../state/WhatIfContext'

const fill = (v: number) => ({ '--p': `${v * 100}%` }) as CSSProperties

/** "Try a change": a few levers that move a ghost version of this page's scenario. The real scenario is never touched. */
export function WhatIfBar({ keys, base, note, result }: { keys: WKey[]; base: PredictionResult; note?: string; result?: (alt: PredictionResult) => ReactNode }) {
  const { scenario } = useScenario()
  const { over, set, reset, changed, predB } = useWhatIf()
  const specs = whatIfSpecs(scenario).filter((s) => keys.includes(s.key))
  const delta = changed && predB.data ? lifeDelta(base.replacement, predB.data.replacement) : null
  const [fleet, , fromFleet] = useScopeSize()
  // money only when the price is the same on both sides, so the change is life alone; first pack only, undiscounted
  const packA = num(base.cost.battery_cost), packB = predB.data ? num(predB.data.cost.battery_cost) : null
  const money = delta && packA != null && packB != null && Math.abs(packA - packB) < 1 ? valueLine(lifeValue(packA, num(base.replacement.months_p50), num(predB.data!.replacement.months_p50)), fleet) : null
  const busy = changed && (predB.isFetching || !predB.data)
  return (
    <section className={`whatif glass${changed ? ' on' : ''}`} aria-label="Try a change">
      <header>
        <b>Try a change</b>
        <span className="wi-state" aria-live="polite">
          {!changed ? 'Move a slider to see a ghost of your bus with that change' : busy ? 'Working it out…' : delta ? <>Battery life <strong>{delta.headline}</strong> <em>{delta.range}</em>{money && <span className="wi-sub" title={`The pack price spread over its life, undiscounted, first pack only. ${fromFleet ? 'Buses are the duty class of the bus opened from your fleet.' : 'Fleet size is set on the Replacement page.'}`}>{money}</span>}</> : 'Median life is beyond the forecast with this change, so the difference cannot be measured'}
        </span>
        {changed && !busy && predB.data && result && <span className="wi-res">{result(predB.data)}</span>}
        {changed && <button className="btn sm" onClick={reset}>Reset</button>}
      </header>
      <div className="wi-grid">
        {specs.map((s) => {
          const cur = (over[s.key] ?? scenario[s.key as keyof typeof scenario]) as number
          return (
            <label key={s.key} className={over[s.key] != null ? 'moved' : ''}>
              <span>{s.label}<b>{s.fmt(cur)}</b></span>
              <input className="rng" style={fill((cur - s.min) / (s.max - s.min || 1))} type="range" min={s.min} max={s.max} step={s.step} value={cur} aria-valuetext={s.fmt(cur)} onChange={(e) => set(s.key, +e.target.value)} />
            </label>
          )
        })}
      </div>
      {note && <p className="note">{note}</p>}
    </section>
  )
}
