import { useEffect, useState } from 'react'

const KEY = 'ph.fleet'
const clampFleet = (n: number) => Math.min(5000, Math.max(1, Math.round(n)))
const load = () => { try { const n = Number(localStorage.getItem(KEY)); return Number.isFinite(n) && n >= 1 ? clampFleet(n) : 50 } catch { return 50 } }

/** The number of buses in the user's fleet, remembered in this browser only (storage can be blocked, so every access is guarded). */
export function useFleetSize(): [number, (n: number) => void] {
  const [fleet, set] = useState(load)
  useEffect(() => { try { localStorage.setItem(KEY, String(fleet)) } catch { /* private window: carry on without it */ } }, [fleet])
  return [fleet, (n) => set(clampFleet(n || 1))]
}
