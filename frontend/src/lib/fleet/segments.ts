import { toFleetRequest } from './io'
import type { BusRange } from './range'
import type { Bus, Cohort, DutyClass, Fleet, FleetForecast, FleetRequest } from './types'

/** Segments are computed here from the roster and the forecast and are never stored. Every rule is a plain comparison, so every group can say why a bus is in it. */

export type Flag = 'age_unknown' | 'past_median_life' | 'past_all_runs' | 'one_model_only' | 'outside_lab_range'
export const FLAG_LABEL: Record<Flag, string> = {
  age_unknown: 'Age unknown', past_median_life: 'Past the model’s median life', past_all_runs: 'Past every model run',
  one_model_only: 'Only one model has runs this old', outside_lab_range: 'Outside the lab data range',
}
const FLAGS = Object.keys(FLAG_LABEL) as Flag[]

export type Band = 'past_median' | 'within_12' | 'y1_3' | 'y3_5' | 'later' | 'beyond' | 'unknown'
export const BAND_ORDER: Band[] = ['past_median', 'within_12', 'y1_3', 'y3_5', 'later', 'beyond', 'unknown']
export const BAND_LABEL: Record<Band, string> = {
  past_median: 'Past the model’s median life', within_12: 'Within 12 months', y1_3: '1 to 3 years', y3_5: '3 to 5 years',
  later: 'More than 5 years', beyond: 'Beyond the 20-year horizon', unknown: 'Age unknown',
}
/** Median months to the line. Readable cut-offs for a 3 to 5 year budget view of a pack that lasts about 12 years in the model; not taken from any source. */
export const RISK_CUTS = [12, 36, 60] as const

export type Row = {
  bus: Bus
  cls: DutyClass
  age: number | null
  cohort?: Cohort
  p10: number | null
  p50: number | null
  p90: number | null
  due12: number | null
  flags: Flag[]
  band?: Band
  /** Whether the bus's range still covers its route, added on the Fleet page once the class's health curves have arrived. */
  range?: BusRange
}

const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1

/** Whole months from the in-service month to the month of `asOf`: the same count the server uses. */
export function ageOf(bus: Bus, asOf: string): number | null {
  return bus.inServiceMonth ? monthIndex(asOf.slice(0, 7)) - monthIndex(bus.inServiceMonth) : null
}

const cohortKey = (classId: string, age: number | null) => `${classId}|${age ?? 'u'}`

export function riskBand(r: Pick<Row, 'cohort' | 'flags' | 'p50'>): Band | undefined {
  if (!r.cohort) return undefined
  if (r.flags.includes('age_unknown')) return 'unknown'
  if (r.flags.includes('past_median_life') || r.flags.includes('past_all_runs')) return 'past_median'
  if (r.p50 == null) return 'beyond'
  return r.p50 <= RISK_CUTS[0] ? 'within_12' : r.p50 <= RISK_CUTS[1] ? 'y1_3' : r.p50 <= RISK_CUTS[2] ? 'y3_5' : 'later'
}

const val = (l: { value: number | number[] } | null | undefined) => (l && typeof l.value === 'number' ? l.value : null)

/** One row per bus, with its class and (once a forecast exists) its cohort's numbers and flags. */
export function buildRows(fleet: Fleet, forecast: FleetForecast | null): Row[] {
  const cls = new Map(fleet.classes.map((c) => [c.id, c]))
  const sum = new Map((forecast?.classes ?? []).map((c) => [c.id, c]))
  const coh = new Map((forecast?.cohorts ?? []).map((c) => [cohortKey(c.class_id, val(c.age_months)), c]))
  return fleet.buses.map((bus) => {
    const age = forecast ? ageOf(bus, forecast.as_of) : null
    const cohort = forecast ? coh.get(cohortKey(bus.classId, bus.inServiceMonth ? age : null)) : undefined
    const flags: Flag[] = []
    if (cohort) {
      for (const f of cohort.flags) if ((FLAGS as string[]).includes(f)) flags.push(f as Flag)
      if ((sum.get(bus.classId)?.extrapolation_reasons.length ?? 0) > 0) flags.push('outside_lab_range')
    }
    const p50 = val(cohort?.months_to_line_p50)
    const row: Row = { bus, cls: cls.get(bus.classId)!, age, cohort, p10: val(cohort?.months_to_line_p10), p50, p90: val(cohort?.months_to_line_p90),
      due12: cohort ? val(cohort.chance_due_next_12_months) : null, flags }
    row.band = riskBand(row)
    return row
  })
}

// ---------------------------------------------------------------- replacement batches
export type BatchInfo = { key: string; depot: string; type: string; band: Band; sortKey: number }

/** A batch is the buses of one depot and one bus type that sit in the same risk band: a purchase unit of buses at a similar distance from the line.
 *  Buses of unknown age, or beyond the 20-year horizon, are not in a batch.
 *  Why a band and not a half-year window around each bus's median crossing: the model's own spread for one bus is years wide (about 8 to 17 years for the default
 *  12 m bus), so half-year windows split a 60-bus fleet into 39 batches of one or two buses, and every bus's 10th percentile fell before its own window. */
export function batchOf(r: Row): BatchInfo | null {
  if (!r.band || r.band === 'unknown' || r.band === 'beyond') return null
  const type = r.cls.scenario.archetype
  return { key: `${r.bus.depot}|${type}|${r.band}`, depot: r.bus.depot, type, band: r.band, sortKey: BAND_ORDER.indexOf(r.band) }
}

// ---------------------------------------------------------------- grouping
export type GroupBy = 'depot' | 'route' | 'type' | 'cohort' | 'class' | 'risk' | 'batch' | 'flags'
export const GROUP_LABEL: Record<GroupBy, string> = { depot: 'Depot', route: 'Route', type: 'Bus type', cohort: 'In-service year', class: 'Duty class', risk: 'Risk band', batch: 'Replacement batch', flags: 'Flags' }
/** Groupings that need the forecast. */
export const NEEDS_FORECAST: GroupBy[] = ['risk', 'batch', 'flags']

export type Group = {
  key: string
  label: string
  busIds: string[]
  n: number
  /** Expected number of these buses reaching the line in the next 12 months. */
  due12: number | null
  /** Earliest median months to the line among them. */
  earliest: number | null
}
export type Grouped = { groups: Group[]; overlapping: boolean; pending: boolean }

const typeLabel = (t: string) => (t === '12m' ? '12 m' : t === '9m' ? '9 m' : t)

function bucketOf(r: Row, by: GroupBy): { key: string; label: string; order: number }[] {
  switch (by) {
    case 'depot': return [{ key: r.bus.depot, label: r.bus.depot, order: 0 }]
    case 'route': return [{ key: r.bus.route, label: r.bus.route, order: 0 }]
    case 'type': return [{ key: r.cls.scenario.archetype, label: typeLabel(r.cls.scenario.archetype), order: 0 }]
    case 'class': return [{ key: r.cls.id, label: r.cls.name, order: 0 }]
    case 'cohort': { const y = r.bus.inServiceMonth?.slice(0, 4); return [y ? { key: y, label: `In service ${y}`, order: Number(y) } : { key: 'unknown', label: 'Age unknown', order: 1e9 }] }
    case 'risk': { const b = r.band; return b ? [{ key: b, label: BAND_LABEL[b], order: BAND_ORDER.indexOf(b) }] : [] }
    case 'batch': { const b = batchOf(r); return [b ? { key: b.key, label: `${b.depot} · ${typeLabel(b.type)} · ${BAND_LABEL[b.band]}`, order: b.sortKey } : { key: 'none', label: 'Not in a batch', order: 1e9 }] }
    case 'flags': return r.flags.length ? r.flags.map((f) => ({ key: f, label: FLAG_LABEL[f], order: FLAGS.indexOf(f) })) : [{ key: 'none', label: 'No flags', order: 1e9 }]
  }
}

/** Group buses. Every grouping except `flags` is a partition: each bus is in exactly one group, so group sizes add up to the fleet. Flags overlap (a bus can carry
 *  several), which is why `overlapping` is reported. Groupings that need the forecast report `pending` until it exists. */
export function groupRows(rows: Row[], by: GroupBy, asOf: string | null): Grouped {
  if (NEEDS_FORECAST.includes(by) && (!asOf || rows.some((r) => !r.cohort))) return { groups: [], overlapping: by === 'flags', pending: true }
  const map = new Map<string, { label: string; order: number; rows: Row[] }>()
  for (const r of rows) for (const b of bucketOf(r, by)) (map.get(b.key) ?? map.set(b.key, { label: b.label, order: b.order, rows: [] }).get(b.key)!).rows.push(r)
  const ordered = [...map.entries()].map(([key, g]) => {
    const withC = g.rows.filter((r) => r.due12 != null), p50s = g.rows.map((r) => r.p50).filter((v): v is number => v != null)
    return { key, label: g.label, busIds: g.rows.map((r) => r.bus.id), n: g.rows.length, due12: withC.length ? withC.reduce((s, r) => s + (r.due12 ?? 0), 0) : null,
      earliest: p50s.length ? Math.min(...p50s) : null, order: g.order }
  }).sort((a, b) => (a.order - b.order) || (b.n - a.n) || (a.label < b.label ? -1 : 1))
  const groups: Group[] = ordered.map((g) => ({ key: g.key, label: g.label, busIds: g.busIds, n: g.n, due12: g.due12, earliest: g.earliest }))
  return { groups, overlapping: by === 'flags', pending: false }
}

/** The request for one group's buses alone, for its own spend and band (the same endpoint, a subset of the roster). */
export function requestFor(fleet: Fleet, busIds: string[], asOf?: string, forecastYears = 10): FleetRequest {
  const ids = new Set(busIds)
  const buses = fleet.buses.filter((b) => ids.has(b.id))
  const used = new Set(buses.map((b) => b.classId))
  return toFleetRequest({ ...fleet, buses, classes: fleet.classes.filter((c) => used.has(c.id)) }, asOf, forecastYears)
}
