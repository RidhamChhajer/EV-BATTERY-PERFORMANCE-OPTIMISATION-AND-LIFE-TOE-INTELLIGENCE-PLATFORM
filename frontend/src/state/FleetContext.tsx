import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadFleet, saveFleet, type SaveStatus } from '../lib/fleet/storage'
import type { Fleet } from '../lib/fleet/types'
import type { GroupBy } from '../lib/fleet/segments'

const GROUP_KEY = 'ph.fleet.groupby'
const GROUPS: GroupBy[] = ['depot', 'route', 'type', 'cohort', 'class', 'risk', 'batch', 'flags']
const loadGroup = (): GroupBy => { try { const v = localStorage.getItem(GROUP_KEY) as GroupBy | null; return v && GROUPS.includes(v) ? v : 'depot' } catch { return 'depot' } }

type Ctx = {
  /** null until the user loads or builds a fleet. Without one the app behaves exactly as it did before fleets existed. */
  fleet: Fleet | null
  /** Replace the fleet (an import, an edit). The previous one is kept for one undo. */
  setFleet: (f: Fleet | null) => void
  undo: () => void
  canUndo: boolean
  selectedId: string | null
  select: (id: string | null) => void
  groupBy: GroupBy
  setGroupBy: (g: GroupBy) => void
  /** `too_big` or `blocked` means the fleet works in memory but was not saved in this browser: offer an export. */
  saveStatus: SaveStatus
}
const C = createContext<Ctx | null>(null)
export const useFleet = () => {
  const c = useContext(C)
  if (!c) throw new Error('useFleet must be used inside FleetProvider')
  return c
}

/** Like `useFleet`, but null outside a provider: for pieces that are shared with screens that never have a fleet. */
export const useFleetOptional = () => useContext(C)

export function FleetProvider({ children }: { children: ReactNode }) {
  const [fleet, setFleetState] = useState<Fleet | null>(loadFleet)
  const [prev, setPrev] = useState<{ fleet: Fleet | null } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [groupBy, setGroup] = useState<GroupBy>(loadGroup)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    setSaveStatus(saveFleet(fleet))
  }, [fleet])

  const setFleet = useCallback((f: Fleet | null) => { setFleetState((cur) => { setPrev({ fleet: cur }); return f }) }, [])
  const undo = useCallback(() => { if (prev) { setFleetState(prev.fleet); setPrev(null) } }, [prev])
  const setGroupBy = useCallback((g: GroupBy) => { setGroup(g); try { localStorage.setItem(GROUP_KEY, g) } catch { /* storage blocked: the choice lasts until reload */ } }, [])
  // a selected bus that is no longer in the fleet (after an import or edit) is simply not selected
  const selectedId = useMemo(() => (selected && fleet?.buses.some((b) => b.id === selected) ? selected : null), [selected, fleet])

  const value: Ctx = { fleet, setFleet, undo, canUndo: prev != null, selectedId, select: setSelected, groupBy, setGroupBy, saveStatus }
  return <C.Provider value={value}>{children}</C.Provider>
}
