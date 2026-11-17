import { useMemo } from 'react'
import { useLeverSweep } from '../../api/hooks'
import { classRange, type ClassRange } from '../../lib/fleet/range'
import type { Fleet } from '../../lib/fleet/types'

/** One prediction per duty class (the same requests the lever block makes for its largest classes, so those are shared), read as range against the route. */
export function useFleetRange(fleet: Fleet | null, ready: boolean) {
  const classes = useMemo(() => (fleet ? fleet.classes.filter((c) => fleet.buses.some((b) => b.classId === c.id)) : []), [fleet])
  const res = useLeverSweep(classes.map((c) => c.scenario), ready)
  const sig = res.map((q) => (q?.data && !q.isPlaceholderData ? q.dataUpdatedAt : 0)).join(',')
  const ranges = useMemo(() => {
    const m = new Map<string, ClassRange>()
    classes.forEach((c, i) => { const q = res[i]; if (q?.data && !q.isPlaceholderData) { const r = classRange(q.data, c.scenario); if (r) m.set(c.id, r) } })
    return m
  }, [classes, sig]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ranges, done: ranges.size, total: classes.length, failed: res.some((q) => q?.isError) }
}
