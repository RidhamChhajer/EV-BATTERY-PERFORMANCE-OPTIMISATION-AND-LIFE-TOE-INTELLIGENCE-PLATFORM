import { crossingYear } from './format'

/** Cost-per-km helpers. In the engine each run's cost is pack price / km driven until the replacement line, so for a fixed battery life every
 *  percentile of cost scales exactly with the price per kWh (locked by tests/test_cost_scaling.py). Nothing else scales this way: threshold and
 *  km per day change the life, so they always need a fresh /predict. */
export type CostBand = { p10: number; p50: number; p90: number }

export const scaleCost = (c: CostBand, price: number, basePrice: number): CostBand => {
  const k = basePrice > 0 ? price / basePrice : 1
  return { p10: c.p10 * k, p50: c.p50 * k, p90: c.p90 * k }
}

/** Price per kWh at which the median cost per km hits `target`. */
export const breakEvenPrice = (basePrice: number, baseP50: number, target: number): number | null =>
  baseP50 > 0 && target > 0 ? (basePrice * target) / baseP50 : null

export function priceCurve(c: CostBand, basePrice: number, lo: number, hi: number, n = 24) {
  return Array.from({ length: n + 1 }, (_, i) => { const price = lo + ((hi - lo) * i) / n; return { price, ...scaleCost(c, price, basePrice) } })
}

/** Cost per km moved by each extra Rs 1,000 per kWh. */
export const perThousand = (basePrice: number, baseP50: number) => (basePrice > 0 ? (baseP50 / basePrice) * 1000 : 0)

/** Pack cost spread over its life, per year. */
export const packCostPerYear = (packCostInr: number, lifeMonths: number | null) => (lifeMonths == null || lifeMonths <= 0 ? null : packCostInr / (lifeMonths / 12))

/** Cost per km if the replacement line were `thresholdPct` instead: each percentile of cost is the pack price over the km driven until the
 *  matching health curve reaches that line (the 10th-percentile cost comes from the 90th-percentile curve, the longest life). A curve that never
 *  reaches the line is counted to the end of the forecast, so that cost is an upper bound (`censored`). Mirrors engine/decide/cost.py. */
export function costAtThreshold(c: { p10: number[]; p50: number[]; p90: number[] }, thresholdPct: number, packCostInr: number, kmPerDay: number, opDays: number) {
  const horizon = (c.p50.length - 1) / 12
  const km = (series: number[]) => { const y = crossingYear(series, thresholdPct); return { km: (y ?? horizon) * opDays * kmPerDay, censored: y == null } }
  const lo = km(c.p90), mid = km(c.p50), hi = km(c.p10)
  return { p10: packCostInr / lo.km, p50: packCostInr / mid.km, p90: packCostInr / hi.km, censored: mid.censored, lifeYearsP50: mid.km / (opDays * kmPerDay) }
}

/** Scale a curve-derived band so it equals the engine's own figures at the scenario's current line. The median is estimated from the health curves
 *  and can differ from the engine's by a few percent at other lines (tests/test_cost_threshold.py), so the curve is pinned where the engine has answered. */
export function anchorCost(est: CostBand, atCurrent: CostBand, engine: CostBand): CostBand {
  const k = (e: number, c: number) => (c > 0 && Number.isFinite(c) && Number.isFinite(e) ? e / c : 1)
  return { p10: est.p10 * k(engine.p10, atCurrent.p10), p50: est.p50 * k(engine.p50, atCurrent.p50), p90: est.p90 * k(engine.p90, atCurrent.p90) }
}
