import { atYear, crossingYear } from './format'

/** The recommender's reserve rule: a route must still fit with 20 % to spare. */
export const RESERVE = 0.2
export const routeNeedKm = (kmPerDay: number, reserve = RESERVE) => kmPerDay * (1 + reserve)

/** Range (km) of a full charge at `year`, from new-pack range and a retention curve in percent (one value per month). */
export const rangeAt = (newKm: number, retentionPct: number[], year: number) => (newKm * atYear(retentionPct, year)) / 100

export type Coverage = { kind: 'never' | 'until' | 'beyond'; year: number | null }
/** How long a retention curve keeps range at or above the route need. 'never' = short already when new; 'beyond' = still covers at the end of the forecast. */
export function coverage(newKm: number, retentionPct: number[], needKm: number): Coverage {
  if (newKm < needKm) return { kind: 'never', year: 0 }
  const series = retentionPct.map((r) => (newKm * r) / 100)
  const y = crossingYear(series, needKm)
  return y == null ? { kind: 'beyond', year: null } : { kind: 'until', year: y }
}

export type RiskBucket = 'none' | 'tenth' | 'half' | 'most' | 'all'
const BUCKET_TEXT: Record<RiskBucket, string> = {
  none: 'fewer than 1 in 10 buses short', tenth: 'between 1 in 10 and half of buses short', half: 'between half and 9 in 10 buses short',
  most: 'more than 9 in 10 buses short', all: 'every run short from day one',
}
/** Share of buses short of the route at `year`. The model's 10th, 50th and 90th percentile health curves are runs, so the year each drops below
 *  the route need is the year 10 %, 50 % and 90 % of buses are short. The answer is a bucket between those marks, never an interpolated percentage. */
export function shortfallRisk(newKm: number, p10: number[], p50: number[], p90: number[], needKm: number, year: number) {
  const t = (c: number[]) => { const v = coverage(newKm, c, needKm); return v.kind === 'never' ? 0 : v.kind === 'beyond' ? null : v.year }
  const t10 = t(p10), t50 = t(p50), t90 = t(p90)
  const inf = (v: number | null) => (v == null ? Infinity : v)
  const bucket: RiskBucket = newKm < needKm ? 'all' : year < inf(t10) ? 'none' : year < inf(t50) ? 'tenth' : year < inf(t90) ? 'half' : 'most'
  return { bucket, text: BUCKET_TEXT[bucket], years: { tenth: t10, half: t50, most: t90 } }
}
