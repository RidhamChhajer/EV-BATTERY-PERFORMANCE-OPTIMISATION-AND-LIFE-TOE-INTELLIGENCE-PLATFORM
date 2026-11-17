import type { PredictionResult, Scenario } from '../../api/types'
import { num } from '../format'
import { curves } from '../results'
import { coverage, rangeAt, routeNeedKm } from '../routefit'

/** Range cover for the Fleet page. The single-bus Range page already asks whether a pack's range still covers the route; this runs the same rule once per duty
 *  class and then reads it at each bus's own age. The route is the class's km per day plus the app's 20 % reserve. Health is the model's median curve, and the
 *  10th percentile curve (the cautious one) gives the earliest year, so "as early as" is a run in ten, not a promise. */

export type RangeBand = 'never' | 'now' | 'within_12' | 'y1_3' | 'y3_5' | 'later' | 'covered' | 'unknown'
export const RANGE_ORDER: RangeBand[] = ['never', 'now', 'within_12', 'y1_3', 'y3_5', 'later', 'covered', 'unknown']
export const RANGE_LABEL: Record<RangeBand, string> = {
  never: 'Short even when new', now: 'Short now', within_12: 'Short within 12 months', y1_3: 'Short in 1 to 3 years', y3_5: 'Short in 3 to 5 years',
  later: 'Short after 5 years', covered: 'Covers the route for the whole model horizon', unknown: 'Age unknown',
}
/** Buses to act on soon: the tile and its filter. */
export const SOON: RangeBand[] = ['never', 'now', 'within_12', 'y1_3']

/** The five groups the Fleet page draws: when a bus falls short, in words a manager uses. */
export type RangeGroup = 'now' | '3y' | 'later' | 'ok' | 'unknown'
export const GROUP_BANDS: Record<RangeGroup, RangeBand[]> = { now: ['never', 'now'], '3y': ['within_12', 'y1_3'], later: ['y3_5', 'later'], ok: ['covered'], unknown: ['unknown'] }
export const GROUP_ORDER: RangeGroup[] = ['now', '3y', 'later', 'ok', 'unknown']
export const GROUP_LABEL: Record<RangeGroup, string> = { now: 'Short now', '3y': 'Short within 3 years', later: 'Short after 3 years', ok: 'Covered', unknown: 'Age unknown' }
export const groupOf = (b: RangeBand): RangeGroup => GROUP_ORDER.find((g) => GROUP_BANDS[g].includes(b)) as RangeGroup

/** A filter on the roster: 'soon', a group, or a band, optionally for one duty class as `group@classId`. */
export type RangeFilter = string
export function inFilter(band: RangeBand | undefined, f: RangeFilter, classId?: string): boolean {
  if (!band) return false
  const [k, cls] = f.split('@')
  if (cls && classId !== cls) return false
  if (k === 'soon') return SOON.includes(band)
  if (k in GROUP_BANDS) return GROUP_BANDS[k as RangeGroup].includes(band)
  return band === k
}
export function filterText(f: RangeFilter, className?: string): string {
  const [k] = f.split('@')
  const what = k === 'soon' ? 'short within 3 years' : k in GROUP_BANDS ? GROUP_LABEL[k as RangeGroup].toLowerCase() : RANGE_LABEL[k as RangeBand].toLowerCase()
  return `${what}${className ? ` in ${className}` : ''}`
}

export type ClassRange = {
  needKm: number; newKm: number
  /** Years from a new pack until the median / cautious curve no longer covers the route; null = still covers at the end of the horizon. */
  t50: number | null; t10: number | null
  never: boolean
  p50: number[]; p10: number[]
}

export function classRange(p: PredictionResult, s: Scenario): ClassRange | null {
  const newKm = num(p.range.new_pack_range_km)
  if (newKm == null || newKm <= 0) return null
  const c = curves(p.replacement), need = routeNeedKm(s.km_per_day)
  const a = coverage(newKm, c.p50, need), b = coverage(newKm, c.p10, need)
  const y = (v: ReturnType<typeof coverage>) => (v.kind === 'beyond' ? null : v.year)
  return { needKm: need, newKm, t50: y(a), t10: y(b), never: newKm < need, p50: c.p50, p10: c.p10 }
}

export type BusRange = {
  band: RangeBand
  /** Months from today until the median pack is short; negative or zero = already short; null = never within the horizon. */
  months: number | null
  /** Months from today until the cautious (10th percentile) pack is short. */
  early: number | null
  /** Range of a full charge today (km, median) and what the route needs. */
  nowKm: number | null; needKm: number
}

const bandOf = (months: number): RangeBand => (months <= 0 ? 'now' : months <= 12 ? 'within_12' : months <= 36 ? 'y1_3' : months <= 60 ? 'y3_5' : 'later')

export function busRange(c: ClassRange | undefined, ageMonths: number | null): BusRange | undefined {
  if (!c) return undefined
  const nowKm = ageMonths == null ? null : rangeAt(c.newKm, c.p50, ageMonths / 12)
  const shift = (t: number | null) => (t == null ? null : t * 12 - (ageMonths ?? 0))
  const months = shift(c.t50), early = shift(c.t10)
  if (c.never) return { band: 'never', months: 0, early: 0, nowKm, needKm: c.needKm }
  if (ageMonths == null) return { band: 'unknown', months, early, nowKm, needKm: c.needKm }
  return { band: months == null ? 'covered' : bandOf(months), months, early, nowKm, needKm: c.needKm }
}
