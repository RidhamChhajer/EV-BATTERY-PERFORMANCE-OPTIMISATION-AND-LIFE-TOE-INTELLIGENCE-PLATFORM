import type { PredictionResult, ReplacementResult } from '../api/types'
import { arr, num } from './format'

export const toPct = (l: { value: number | number[] }) => (Array.isArray(l.value) ? l.value : [l.value]).map((x) => x * 100)
export const curves = (r: ReplacementResult) => ({ p10: toPct(r.retention_p10), p50: toPct(r.retention_p50), p90: toPct(r.retention_p90) })
export const repYears = (r: ReplacementResult): [number | null, number | null, number | null] =>
  [r.months_p10, r.months_p50, r.months_p90].map((m) => { const v = num(m); return v == null ? null : v / 12 }) as [number | null, number | null, number | null]
export const probSeries = (r: ReplacementResult) => arr(r.probability_by_month).map((x) => x * 100)
/** Chart length: 10 years normally, 15 when the median replacement is late, never past the forecast length. */
export function xMaxFor(p: PredictionResult | ReplacementResult): number {
  const r = 'replacement' in p ? p.replacement : p
  const med = num(r.months_p50)
  const horizon = (r.months[r.months.length - 1] ?? 120) / 12
  return Math.min(horizon, med == null || med / 12 > 9 ? 15 : 10)
}
export const NO_DATE = 'beyond the forecast'
