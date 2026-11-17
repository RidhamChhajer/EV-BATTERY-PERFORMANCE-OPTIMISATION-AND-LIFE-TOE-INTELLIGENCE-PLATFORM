import { useId, type CSSProperties } from 'react'
import type { Scenario } from '../api/types'
import { hasChanges, sliderSpecs, type LeverKey, type Overrides } from '../lib/busB'

type Props = {
  a: Scenario; over: Overrides
  setLever: (k: LeverKey, v: number) => void; reset: () => void
  goalLabel: string | null; onOpenGoals: () => void
}

/** Contents of the Bus B drawer: a few sliders, nothing else. Goals live in their own drawer. */
export function BusBControls({ a, over, setLever, reset, goalLabel, onOpenGoals }: Props) {
  const uid = useId()
  const specs = sliderSpecs(a)
  return (
    <div className="bb">
      <div className="bb-top">
        <p>Bus B is a copy of Bus A with only the changes you make here. Drag a slider and the model re-runs.</p>
        <div className="row">
          <button className="btn sm" onClick={onOpenGoals}>{goalLabel ? `Goal: ${goalLabel}` : 'Pick a goal'}</button>
          <button className="btn sm" onClick={reset} disabled={!hasChanges(over)}>Same as Bus A</button>
        </div>
      </div>
      {specs.map((sp) => {
        const aVal = a[sp.key] as number, val = (over[sp.key] ?? aVal) as number, changed = over[sp.key] != null
        return (
          <div className={`bs${changed ? ' ch' : ''}`} key={sp.key}>
            <div className="bsh"><label htmlFor={`${uid}${sp.key}`}>{sp.label}</label><b>{sp.fmt(val)}</b></div>
            <input id={`${uid}${sp.key}`} className="rng" style={{ '--p': `${((val - sp.min) / (sp.max - sp.min)) * 100}%` } as CSSProperties} type="range" min={sp.min} max={sp.max} step={sp.step} value={val} aria-valuetext={sp.fmt(val)} aria-describedby={`${uid}${sp.key}d`} onChange={(e) => setLever(sp.key, +e.target.value)} />
            <div className="bsf" id={`${uid}${sp.key}d`}><span>Bus A: {sp.fmt(aVal)}</span>{sp.confirm && <span className="tag assumption" title={sp.confirm}>needs confirmation</span>}</div>
            <div className="bsn">{sp.confirm ?? sp.help}</div>
          </div>
        )
      })}
    </div>
  )
}
