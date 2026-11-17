import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Scenario } from '../api/types'
import { DEFAULT_PRICE, fromQuery, toQuery, validateScenario, type FieldKey } from '../lib/scenario'

type Ctx = {
  scenario: Scenario
  defaults: Scenario
  errors: Partial<Record<string, string>>
  valid: boolean
  notice: string | null
  dismissNotice: () => void
  setField: (k: FieldKey, v: number | null) => void
  setZone: (z: Scenario['zone']) => void
  setTariff: (t: Scenario['electricity_tariff']) => void
  setArchetype: (a: Scenario['archetype']) => void
  replace: (s: Scenario) => void
  reset: () => void
}
const C = createContext<Ctx | null>(null)
export const useScenario = () => {
  const c = useContext(C)
  if (!c) throw new Error('useScenario must be used inside ScenarioProvider')
  return c
}

/** Bus-type defaults from /presets, plus the battery price the form needs for cost per km (a user assumption). */
function defaultsFrom(presets: { id: string; scenario: Scenario }[], arch: string): Scenario {
  const p = presets.find((x) => x.id === arch) ?? presets[0]
  return { ...p.scenario, battery_cost_per_kwh_inr: DEFAULT_PRICE }
}

export function ScenarioProvider({ children, presets }: { children: ReactNode; presets: { id: string; scenario: Scenario }[] }) {
  const init = useRef(fromQuery(window.location.search, (a) => defaultsFrom(presets, a)))
  const [scenario, setScenario] = useState<Scenario>(init.current.scenario!)
  const [notice, setNotice] = useState<string | null>(init.current.ignored.length ? `Some values in the link were not valid and were replaced with defaults (${init.current.ignored.join(', ')}).` : null)
  const defaults = useMemo(() => defaultsFrom(presets, scenario.archetype), [presets, scenario.archetype])
  const errors = useMemo(() => validateScenario(scenario), [scenario])

  useEffect(() => {
    const q = toQuery(scenario, defaults)
    const url = `${window.location.pathname}?${q}${window.location.hash}`
    window.history.replaceState(null, '', url)
  }, [scenario, defaults])

  const setField = useCallback((k: FieldKey, v: number | null) => setScenario((s) => ({ ...s, [k]: v })), [])
  const setZone = useCallback((zone: Scenario['zone']) => setScenario((s) => ({ ...s, zone })), [])
  const setTariff = useCallback((electricity_tariff: Scenario['electricity_tariff']) => setScenario((s) => ({ ...s, electricity_tariff })), [])
  const setArchetype = useCallback((a: Scenario['archetype']) => setScenario((s) => {
    const d = defaultsFrom(presets, a)
    // switching bus type refreshes the five bus-type defaults and keeps the operator's own choices (zone, charging, price)
    return { ...s, archetype: a, pack_kwh: d.pack_kwh, kwh_per_km: d.kwh_per_km, km_per_day: d.km_per_day, charge_power_kw: d.charge_power_kw, operating_days_per_year: d.operating_days_per_year }
  }), [presets])
  const reset = useCallback(() => setScenario((s) => defaultsFrom(presets, s.archetype)), [presets])

  const value: Ctx = { scenario, defaults, errors, valid: Object.keys(errors).length === 0, notice, dismissNotice: () => setNotice(null), setField, setZone, setTariff, setArchetype, replace: setScenario, reset }
  return <C.Provider value={value}>{children}</C.Provider>
}
