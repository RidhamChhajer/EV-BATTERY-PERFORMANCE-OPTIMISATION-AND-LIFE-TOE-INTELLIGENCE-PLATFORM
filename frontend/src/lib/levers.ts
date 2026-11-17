import type { PredictionResult, Scenario } from '../api/types'
import { dayShape, type DayParams } from './dayCycle'
import { num } from './format'
import { lifeValue } from './money'
import { routeNeedKm } from './routefit'
import { hhmm } from './scenario'
import { lifeDelta, type WKey } from './whatif'

/** One small move on one lever, tried on its own. They are not additive: each is measured against the unchanged bus. */
export type Step = { key: WKey; value: number; text: string; confirm?: boolean }

const CAP_STEPS = [95, 90, 85, 80, 75, 70]            // the recommender's cap steps (engine/decide/recommend.py)
const BUFFER_H = 0.5                                  // charging must end this long before departure (same file)

/** Steps for the operating levers a fleet manager controls, plus route length when asked (it is a service level, so it is never ranked with them). */
export function leverSteps(s: Scenario, day: DayParams, withRoute = false): Step[] {
  const out: Step[] = []
  const caps = CAP_STEPS.filter((c) => c < s.soc_max_pct && c - s.soc_min_pct >= 10)
  if (caps.length) {
    const target = s.soc_max_pct - 10, cap = caps.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
    out.push({ key: 'soc_max_pct', value: cap, text: `Stop charging at ${cap} %` })
  }
  const idle = dayShape(day).idleH, room = Math.floor((idle - BUFFER_H) * 2) / 2
  if (idle >= 1 && room >= 0.5) {
    const v = (((s.charge_start_hour + room) % 24) + 24) % 24
    out.push({ key: 'charge_start_hour', value: v, text: `Start charging at ${hhmm(v)}` })
  }
  if (s.heat_rise_c >= 0.5) {
    const v = Math.max(0, Math.round((s.heat_rise_c - 2) * 2) / 2)
    out.push({ key: 'heat_rise_c', value: v, text: `Keep the pack ${Number((s.heat_rise_c - v).toFixed(1))} °C cooler`, confirm: true })
  }
  const route = withRoute ? routeStep(s) : null
  if (route) out.push(route)
  return out
}

/** A route 20 % shorter, rounded to 5 km. */
export function routeStep(s: Scenario): Step | null {
  const v = Math.max(20, Math.round((s.km_per_day * 0.8) / 5) * 5)
  return v < s.km_per_day ? { key: 'km_per_day', value: v, text: `Shorten the route to ${v} km a day` } : null
}

export type Ranked = { step: Step; months: number | null; low: number | null; rupees: number | null; rangeKm: number | null; short: boolean }

/** Life gained by each step against the unchanged bus, best first. Steps whose result has not arrived yet go last, in their original order.
 *  `short` marks a step that pulls range at replacement below the route need (route plus 20 % reserve) and below where it is today. */
export function rankLevers(base: PredictionResult, s: Scenario, alts: { step: Step; pred: PredictionResult | undefined }[]): Ranked[] {
  const price = num(base.cost.battery_cost), baseMonths = num(base.replacement.months_p50)
  const need = routeNeedKm(s.km_per_day), baseRange = (num(base.range.new_pack_range_km) ?? 0) * s.threshold
  const rows: Ranked[] = alts.filter((a) => a.step.key !== 'km_per_day').map(({ step, pred }) => {
    if (!pred) return { step, months: null, low: null, rupees: null, rangeKm: null, short: false }
    const d = lifeDelta(base.replacement, pred.replacement), rangeKm = (num(pred.range.new_pack_range_km) ?? 0) * s.threshold
    return { step, months: d?.months ?? null, low: d?.low ?? null, rupees: lifeValue(price, baseMonths, num(pred.replacement.months_p50)), rangeKm, short: rangeKm < need && rangeKm < baseRange - 0.5 }
  })
  const done = rows.filter((r) => r.months != null).sort((a, b) => (b.months as number) - (a.months as number))
  return [...done, ...rows.filter((r) => r.months == null)]
}
