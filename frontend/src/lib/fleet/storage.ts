import { parseFleet, serializeFleet } from './io'
import type { Fleet } from './types'

const KEY = 'ph.fleet.v1'
/** Browsers give a site about 5 MB of local storage. Stay well under it, so other settings still fit. */
const MAX_CHARS = 3_500_000

export type SaveStatus = 'saved' | 'too_big' | 'blocked'

/** The stored fleet, or null. Storage can be blocked or hold something old or edited by hand, so the content is validated like an imported file. */
export function loadFleet(): Fleet | null {
  try {
    const t = localStorage.getItem(KEY)
    if (!t) return null
    return parseFleet(t).fleet ?? null
  } catch { return null }
}

/** Saves the fleet in this browser only. `too_big` and `blocked` leave the fleet working in memory; the caller should offer an export. */
export function saveFleet(f: Fleet | null): SaveStatus {
  try {
    if (!f) { localStorage.removeItem(KEY); return 'saved' }
    const t = serializeFleet(f)
    if (t.length > MAX_CHARS) return 'too_big'
    localStorage.setItem(KEY, t)
    return 'saved'
  } catch { return 'blocked' }
}
