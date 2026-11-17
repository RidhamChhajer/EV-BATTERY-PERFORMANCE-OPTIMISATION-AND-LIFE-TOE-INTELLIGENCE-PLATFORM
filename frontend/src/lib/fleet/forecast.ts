import type { PredictionResult, Scenario } from '../../api/types'
import type { DayParams } from '../dayCycle'
import { num } from '../format'
import { lifeValue, rupees } from '../money'
import type { Group, Row } from './segments'
import type { ClassSummary, FleetForecast } from './types'

/** Pure figures for the Fleet page's forecast blocks. Nothing here calls the server: each function reads responses that have already arrived. */

export type Series = {
  labels: string[]
  /** Months from the as-of date at each financial-year boundary (one more than the labels). */
  edges: number[]
  buses: number[]
  /** Rupees; null when no battery price was sent. */
  spend: number[] | null
  spendP10: number[] | null
  spendP90: number[] | null
  busesP10: number[]
  busesP90: number[]
  /** Expected buses that do not reach the line inside the forecast. */
  beyond: number
}

const arr = (l: { value: number | number[] } | null | undefined): number[] | null => (l && Array.isArray(l.value) ? l.value : null)

export function seriesOf(f: FleetForecast): Series {
  const buses = arr(f.buses_expected) ?? []
  return {
    labels: f.period_labels, edges: arr(f.period_edges_months) ?? [], buses,
    spend: arr(f.spend_expected), spendP10: arr(f.spend_p10), spendP90: arr(f.spend_p90),
    busesP10: arr(f.buses_p10) ?? buses.map(() => 0), busesP90: arr(f.buses_p90) ?? buses.map(() => 0),
    beyond: num(f.beyond_forecast_buses) ?? 0,
  }
}

/** The financial year a number of months from now falls in, as an index into the labels; null when it is after the last one. */
export function periodAt(edges: number[], months: number | null): number | null {
  if (months == null || edges.length < 2) return null
  for (let i = 0; i < edges.length - 1; i++) if (months >= edges[i] && months < edges[i + 1]) return i
  return null
}

/** "FY2031-32", or "after FY2036-37" when the bus's median is past the forecast, or "" when there is no median to place. */
export function yearLabel(s: Pick<Series, 'labels' | 'edges'> | null, months: number | null): string {
  if (!s || months == null) return ''
  const i = periodAt(s.edges, months)
  return i != null ? s.labels[i] : `after ${s.labels[s.labels.length - 1]}`
}

// ---------------------------------------------------------------- the budget headline
export type Headline = { text: string; index: number | null; partial: boolean }

const crore = (v: number) => rupees(v)
const busesText = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)))

/** One sentence for the first full financial year (index 1): the next budget a manager has to write. The first period is only the rest of the current year,
 *  so it is not the headline; it is named in the note when it carries spend. Without a battery price the sentence counts buses instead of rupees. */
export function budgetHeadline(s: Series): Headline {
  if (s.buses.length < 2) return { text: 'Not enough of a forecast to write a budget line yet.', index: null, partial: false }
  const i = 1, label = s.labels[i]
  if (s.spend) {
    const e = s.spend[i], lo = s.spendP10?.[i] ?? 0, hi = s.spendP90?.[i] ?? e
    if (e < 1) return { text: `No bus is expected to reach the line in ${label}, so no pack spend is expected that year.`, index: i, partial: false }
    const band = hi <= e + 1 && lo >= e - 1 ? '' : lo <= 0 ? ` (up to ${crore(hi)} at the 90th percentile)` : ` (${crore(lo)} to ${crore(hi)}, 10th to 90th percentile)`
    return { text: `Budget about ${crore(e)} in ${label}${band}.`, index: i, partial: false }
  }
  const e = s.buses[i]
  return { text: e < 0.05 ? `No bus is expected to reach the line in ${label}.` : `Expect about ${busesText(e)} bus${Math.round(e) === 1 ? '' : 'es'} to reach the line in ${label}. Set a battery price to see rupees.`, index: i, partial: false }
}

/** The financial year with the most spend (or the most buses without a price), when it is not the headline year. */
export function peakPeriod(s: Series): { index: number; label: string; spend: number | null; buses: number } | null {
  const v = s.spend ?? s.buses
  if (!v.length) return null
  let best = 0
  v.forEach((x, i) => { if (x > v[best]) best = i })
  return v[best] > 0 ? { index: best, label: s.labels[best], spend: s.spend ? s.spend[best] : null, buses: s.buses[best] } : null
}

/** Cumulative expected spend. It has no band: the sum of the yearly bands is not the band of the sum, so none is drawn or quoted. */
export const cumulative = (v: number[]): number[] => { let t = 0; return v.map((x) => (t += x)) }

// ---------------------------------------------------------------- stack by depot
export type Stack = { names: string[]; values: number[][]; unit: 'inr' | 'buses'; total: number[]; other: boolean; /** Index of the segment for buses of unknown age, which is drawn hatched; null when there are none. */ unknownIndex: number | null }

/** Expected spend (or buses) adds exactly across subsets of the fleet, so the per-depot series stack to the whole-fleet total. The band does not add up
 *  (a sum of 10th percentiles is not the 10th percentile of a sum), so it is drawn only on the whole-fleet total. Depots beyond the largest `max` fold into "Other",
 *  computed as the total minus the depots shown, so the stack always adds up. */
export function stackBy(parts: { name: string; series: Series; buses: number }[], total: Series, max = 5, hasMore = false, unknown: Series | null = null): Stack {
  const inr = total.spend != null
  const pick = (s: Series) => (inr ? s.spend ?? s.buses.map(() => 0) : s.buses)
  const sorted = [...parts].sort((a, b) => b.buses - a.buses || (a.name < b.name ? -1 : 1))
  const shown = sorted.slice(0, max)
  const tot = pick(total)
  const values = shown.map((p) => pick(p.series))
  const names = shown.map((p) => p.name)
  let unknownIndex: number | null = null
  if (unknown) { unknownIndex = names.length; names.push('Age unknown'); values.push(pick(unknown)) }
  let other = false
  if (hasMore || sorted.length > max) {
    other = true
    const used = values.map((v) => v)
    names.push('Other depots'); values.push(tot.map((t, i) => Math.max(0, t - used.reduce((s, v) => s + (v[i] ?? 0), 0))))
  }
  return { names, values, unit: inr ? 'inr' : 'buses', total: tot, other, unknownIndex }
}

// ---------------------------------------------------------------- class × financial year
export type Timeline = { labels: string[]; rows: { id: string; name: string; n: number; cells: number[]; beyond: number }[]; max: number }

export function timelineOf(classes: { id: string; name: string; n: number; series: Series }[], labels: string[]): Timeline {
  const rows = classes.map((c) => ({ id: c.id, name: c.name, n: c.n, cells: labels.map((_, i) => c.series.buses[i] ?? 0), beyond: c.series.beyond }))
  return { labels, rows, max: Math.max(0, ...rows.flatMap((r) => r.cells)) }
}

// ---------------------------------------------------------------- where the battery money goes
export type MoneyRow = { key: string; label: string; buses: number; perYear: number | null; perKm: number | null }

/** Battery rupees per year for each bus: its class's battery cost per km at the median, times the km that class drives a year. A class figure, so every bus
 *  of the class carries the same amount. The server calls the fleet-level figure a mean of medians, not a percentile, and so is this. */
export function busPerYear(c: ClassSummary | undefined): { perYear: number; km: number } | null {
  const perKm = num(c?.battery_cost_per_km_p50), km = num(c?.km_per_year)
  return perKm != null && km != null && km > 0 ? { perYear: perKm * km, km } : null
}

/** Rank groups of buses by battery rupees a year (the whole group), with the weighted rupees per km beside it. Buses whose class has no figure are counted
 *  in `buses` but add nothing, and a group with none at all shows no money. */
export function moneyBy(rows: Row[], groups: Group[], forecast: FleetForecast): MoneyRow[] {
  const byClass = new Map(forecast.classes.map((c) => [c.id, busPerYear(c)]))
  const byId = new Map(rows.map((r) => [r.bus.id, r]))
  return groups.map((g) => {
    let sum = 0, km = 0, any = false
    for (const id of g.busIds) {
      const f = byClass.get(byId.get(id)?.bus.classId ?? '')
      if (f) { sum += f.perYear; km += f.km; any = true }
    }
    return { key: g.key, label: g.label, buses: g.n, perYear: any ? sum : null, perKm: any && km > 0 ? sum / km : null }
  }).sort((a, b) => ((b.perYear ?? -1) - (a.perYear ?? -1)) || (a.label < b.label ? -1 : 1))
}

// ---------------------------------------------------------------- levers in fleet rupees
export type FleetLeverRow = { classId: string; className: string; buses: number; text: string; months: number | null; perBus: number | null; fleet: number | null; lever: string; needsCooling?: boolean }

/** Rupees a year for a whole class when one lever is moved: the pack price spread over its life, per bus, times the buses in the class. Undiscounted and first
 *  pack only, and each lever is measured alone, so rows from the same class do not add up. */
export function leverFleetValue(base: PredictionResult, alt: PredictionResult | undefined, buses: number): { perBus: number | null; fleet: number | null; months: number | null } {
  if (!alt) return { perBus: null, fleet: null, months: null }
  const b = num(base.replacement.months_p50), a = num(alt.replacement.months_p50)
  const perBus = lifeValue(num(base.cost.battery_cost), b, a)
  return { perBus, fleet: perBus == null ? null : perBus * buses, months: b != null && a != null ? a - b : null }
}

/** The day shape a class's lever steps are worked out from, taken from that class's own base prediction. */
export function dayOf(s: Scenario, p: PredictionResult): DayParams {
  const c = p.conditions
  return { departure: s.departure_hour, chargeStart: s.charge_start_hour, chargeHours: num(c.charge_hours) ?? 2, socMin: s.soc_min_pct, socMax: s.soc_max_pct, energyKwh: num(c.energy_per_day_kwh) ?? s.km_per_day * s.kwh_per_km, packKwh: s.pack_kwh }
}

/** Best first by fleet rupees; moves worth nothing or costing money come last, and rows still waiting for their result are dropped. */
export function rankFleetLevers(rows: FleetLeverRow[]): FleetLeverRow[] {
  return rows.filter((r) => r.fleet != null).sort((a, b) => (b.fleet as number) - (a.fleet as number))
}
