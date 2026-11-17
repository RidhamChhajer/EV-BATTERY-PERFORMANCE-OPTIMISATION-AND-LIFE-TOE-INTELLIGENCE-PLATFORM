import { useMemo } from 'react'
import { usePresets } from '../../api/hooks'
import type { Context } from '../../lib/fleet/roster'
import { useScenario } from '../../state/ScenarioContext'

/** What the readers need: the bus on screen (the base for anything a file leaves out) and the bus-type presets. Null until the presets have loaded. */
export function useReadContext(): Context | null {
  const { scenario } = useScenario()
  const presets = usePresets().data?.presets
  return useMemo(() => (presets ? { screen: scenario, presets, nowMs: Date.now() } : null), [scenario, presets])
}
