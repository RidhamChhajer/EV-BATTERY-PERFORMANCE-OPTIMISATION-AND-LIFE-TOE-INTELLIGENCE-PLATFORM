import { useMemo } from 'react'
import type { Bus, DutyClass, Fleet } from '../lib/fleet/types'
import { useFleetOptional } from './FleetContext'
import { useFleetSize } from '../lib/useFleetSize'

export type Scope = { fleet: Fleet; bus: Bus; cls: DutyClass; classBuses: number; index: number }

/** The bus the analysis pages are looking at, when one was opened from the fleet: its duty class and how many buses share it. Null with no fleet or no selection. */
export function useScope(): Scope | null {
  const c = useFleetOptional()
  const fleet = c?.fleet ?? null, id = c?.selectedId ?? null
  return useMemo(() => {
    if (!fleet || !id) return null
    const index = fleet.buses.findIndex((b) => b.id === id)
    if (index < 0) return null
    const bus = fleet.buses[index], cls = fleet.classes.find((k) => k.id === bus.classId)
    return cls ? { fleet, bus, cls, classBuses: fleet.buses.filter((b) => b.classId === cls.id).length, index } : null
  }, [fleet, id])
}

/** How many buses the money lines and the fleet plan speak for: the duty class of the opened bus when there is one (read-only, it comes from the fleet), else the number the
 *  visitor typed, remembered in this browser as before. */
export function useScopeSize(): [number, (n: number) => void, boolean] {
  const scope = useScope()
  const [typed, setTyped] = useFleetSize()
  return scope ? [scope.classBuses, () => undefined, true] : [typed, setTyped, false]
}
