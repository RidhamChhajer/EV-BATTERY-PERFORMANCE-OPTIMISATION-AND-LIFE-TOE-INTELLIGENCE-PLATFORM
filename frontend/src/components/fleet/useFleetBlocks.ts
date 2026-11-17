import { useMemo } from 'react'
import { localToday, useFleetBatch, useFleetForecast } from '../../api/hooks'
import { seriesOf, type Series } from '../../lib/fleet/forecast'
import { requestFor } from '../../lib/fleet/segments'
import type { Fleet, FleetForecast } from '../../lib/fleet/types'

export const MAX_DEPOTS_SHOWN = 5

export type Part = { id: string; name: string; buses: number; series: Series | null; failed: boolean }

/** Everything the Fleet page's forecast blocks read: the whole-fleet answer first (headline, band, roster figures), then one answer per duty class (the class by year
 *  timeline) and one per depot (the stack in the budget chart), each as it arrives. One day is fixed for all of them, so their financial-year columns line up. */
export function useFleetBlocks(fleet: Fleet | null) {
  const asOf = useMemo(localToday, [])
  const main = useFleetForecast(fleet, asOf)
  const forecast: FleetForecast | null = main.data ?? null

  const plan = useMemo(() => {
    type P = { id: string; name: string; buses: number; ids: string[] }
    if (!fleet) return { classes: [] as P[], depots: [] as P[], unknown: null as P | null }
    const by = (key: (b: Fleet['buses'][number]) => string) => {
      const m = new Map<string, string[]>()
      for (const b of fleet.buses) (m.get(key(b)) ?? m.set(key(b), []).get(key(b))!).push(b.id)
      return m
    }
    const classes = fleet.classes.map((c) => { const ids = by((b) => b.classId).get(c.id) ?? []; return { id: c.id, name: c.name, buses: ids.length, ids } }).filter((c) => c.buses > 0)
    // Buses with no in-service month are counted as new, which pushes their replacement later than it may be, so they are asked for apart and drawn apart:
    // the depot split covers the buses whose age is known.
    const unknownIds = fleet.buses.filter((b) => !b.inServiceMonth).map((b) => b.id)
    const dm = new Map<string, string[]>()
    for (const b of fleet.buses) if (b.inServiceMonth) (dm.get(b.depot) ?? dm.set(b.depot, []).get(b.depot)!).push(b.id)
    const depots = [...dm.entries()].map(([name, ids]) => ({ id: name, name, buses: ids.length, ids })).sort((a, b) => b.buses - a.buses || (a.name < b.name ? -1 : 1))
    const unknown = unknownIds.length ? { id: 'unknown', name: 'Age unknown', buses: unknownIds.length, ids: unknownIds } : null
    const split = dm.size > 1 || (dm.size > 0 && unknown != null)
    return { classes, depots: split ? depots.slice(0, MAX_DEPOTS_SHOWN) : [], unknown: split ? unknown : null, moreDepots: dm.size > MAX_DEPOTS_SHOWN }
  }, [fleet])

  const requests = useMemo(() => (fleet ? [...plan.classes, ...plan.depots, ...(plan.unknown ? [plan.unknown] : [])].map((p) => requestFor(fleet, p.ids, asOf)) : []), [fleet, plan, asOf])
  const settled = main.isSuccess || main.isError
  const batch = useFleetBatch(requests, !!fleet && settled && !main.isPlaceholderData)

  const parts = (list: typeof plan.classes, offset: number): Part[] => list.map((p, i) => {
    const q = batch[offset + i]
    return { id: p.id, name: p.name, buses: p.buses, series: q?.data ? seriesOf(q.data) : null, failed: !!q?.isError }
  })
  const classes = parts(plan.classes, 0), depots = parts(plan.depots, plan.classes.length)
  const unknown = plan.unknown ? parts([plan.unknown], plan.classes.length + plan.depots.length)[0] : null
  const mainSeries = useMemo(() => (forecast ? seriesOf(forecast) : null), [forecast])
  return {
    asOf, main, forecast, series: mainSeries, classes, depots, unknown, moreDepots: 'moreDepots' in plan && plan.moreDepots === true,
    classesDone: classes.filter((c) => c.series).length, depotsDone: depots.filter((c) => c.series).length,
    stale: main.isPlaceholderData, failed: main.isError,
  }
}
export type FleetBlocks = ReturnType<typeof useFleetBlocks>
