import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFleet } from '../../state/FleetContext'
import { useScenario } from '../../state/ScenarioContext'
import { useWhatIf } from '../../state/WhatIfContext'

/** Opens a bus from the fleet in the analysis pages: its duty class becomes the scenario on screen (any "try a change" is cleared, since it belonged to the previous bus),
 *  and the bus becomes the scope the breadcrumb shows. `go` is the page to land on; leave it out to stay where you are (the breadcrumb's bus switcher). */
export function useOpenBus() {
  const { fleet, select } = useFleet()
  const { replace } = useScenario()
  const { reset } = useWhatIf()
  const navigate = useNavigate()
  return useCallback((id: string, go?: string) => {
    const bus = fleet?.buses.find((b) => b.id === id), cls = fleet?.classes.find((c) => c.id === bus?.classId)
    if (!bus || !cls) return false
    replace(cls.scenario); reset(); select(id)
    if (go) navigate(go)
    return true
  }, [fleet, select, replace, reset, navigate])
}
