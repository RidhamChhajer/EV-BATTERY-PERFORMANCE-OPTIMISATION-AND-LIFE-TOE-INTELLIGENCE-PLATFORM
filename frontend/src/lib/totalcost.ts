import type { CostBand } from './costcalc'

/** Battery plus electricity per km. Electricity is one published tariff, not a spread, so it shifts the whole battery band by the same amount. */
export type Total = { battery: CostBand; electricity: number; total: CostBand; electricityShare: number }

export function totalCost(battery: CostBand, electricity: number | null): Total | null {
  if (electricity == null || !Number.isFinite(electricity) || electricity < 0) return null
  const total = { p10: battery.p10 + electricity, p50: battery.p50 + electricity, p90: battery.p90 + electricity }
  return { battery, electricity, total, electricityShare: total.p50 > 0 ? electricity / total.p50 : 0 }
}

/** One plain sentence on which side of the bill is bigger. Wording avoids claiming more than the two assumptions support. */
export function shareSentence(t: Total): string {
  const pct = Math.round(t.electricityShare * 100)
  if (pct >= 55) return `Electricity is about ${pct} % of the cost of running this bus, so the tariff and the time you charge matter more than the battery price.`
  if (pct <= 45) return `The battery is about ${100 - pct} % of the cost of running this bus, so battery life and price matter more than the tariff.`
  return 'Battery and electricity are close to an even split of the cost of running this bus.'
}

/** What the cost per km chips should show: the total when electricity is on, else the battery figure alone. */
export function costLabel(hasElectricity: boolean) { return hasElectricity ? 'Cost per km, battery and electricity' : 'Cost per km' }
