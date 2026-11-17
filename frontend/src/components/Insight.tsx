import type { Insight as I } from '../lib/insights'
import { useWhatIf } from '../state/WhatIfContext'

/** One generated sentence under the page title, with an optional one-click lever to try. */
export function Insight({ insight }: { insight: I }) {
  const { set } = useWhatIf()
  const a = insight.action
  return (
    <p className="insight" role="note">
      <i aria-hidden="true" />
      <span>{insight.text}</span>
      {a && <button className="btn sm" onClick={() => set(a.key, a.value)}>{a.label}</button>}
    </p>
  )
}
