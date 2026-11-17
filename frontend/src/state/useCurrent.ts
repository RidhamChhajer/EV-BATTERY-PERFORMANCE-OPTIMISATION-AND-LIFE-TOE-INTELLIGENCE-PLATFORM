import { usePredict } from '../api/hooks'
import { useScenario } from './ScenarioContext'

/** The prediction for the scenario in the shared panel. Every page reads this one cached query. */
export function useCurrent() {
  const { scenario, valid } = useScenario()
  const q = usePredict(valid ? scenario : null)
  return { scenario, valid, q }
}
