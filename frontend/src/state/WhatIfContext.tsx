import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { usePredict } from '../api/hooks'
import type { PredictionResult, Scenario } from '../api/types'
import { applyW, diffW, type WKey, type WOver } from '../lib/whatif'
import { useScenario } from './ScenarioContext'

type Ctx = { over: WOver; set: (k: WKey, v: number | null) => void; reset: () => void; busB: Scenario; changed: boolean; predB: UseQueryResult<PredictionResult> }
const C = createContext<Ctx | null>(null)
export const useWhatIf = () => {
  const c = useContext(C)
  if (!c) throw new Error('useWhatIf must be used inside WhatIfProvider')
  return c
}

/** "Try a change" on the analysis pages: overrides sit on top of the shared scenario, so they never alter it, and they follow the visitor from page to page.
 *  An override equal to the scenario's own value counts as no change, so editing the scenario never leaves a stale ghost behind. */
export function WhatIfProvider({ children }: { children: ReactNode }) {
  const { scenario, valid } = useScenario()
  const [raw, setRaw] = useState<WOver>({})
  const over = useMemo(() => diffW(scenario, raw), [scenario, raw])
  const changed = Object.keys(over).length > 0
  const busB = useMemo(() => applyW(scenario, over), [scenario, over])
  const predB = usePredict(valid && changed ? busB : null)
  const set = useCallback((k: WKey, v: number | null) => setRaw((o) => { const n = { ...o }; if (v == null) delete n[k]; else n[k] = v; return n }), [])
  const reset = useCallback(() => setRaw({}), [])
  const v = useMemo(() => ({ over, set, reset, busB, changed, predB }), [over, set, reset, busB, changed, predB])
  return <C.Provider value={v}>{children}</C.Provider>
}
