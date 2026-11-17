import type { ReplacementResult, Scenario } from '../api/types'
import { hhmm } from './scenario'
import { LEVERS, lifeChange, sliderSpecs, type LeverKey } from './busB'
import { num } from './format'

/** Things a visitor can try on the analysis pages: the five operating levers from Optimise, plus the three inputs the Cost page's tornado moves. */
export const EXTRA = ['threshold', 'km_per_day', 'battery_cost_per_kwh_inr'] as const
export type ExtraKey = (typeof EXTRA)[number]
export type WKey = LeverKey | ExtraKey
export type WOver = Partial<Record<WKey, number>>
export const ALL_KEYS: readonly WKey[] = [...LEVERS, ...EXTRA]

export type WSpec = { key: WKey; label: string; min: number; max: number; step: number; fmt: (v: number) => string; help: string }
const r0 = (x: number) => Math.round(x)

export function whatIfSpecs(a: Scenario): WSpec[] {
  const base = sliderSpecs(a).map((s) => ({ key: s.key as WKey, label: s.label, min: s.min, max: s.max, step: s.step, fmt: s.fmt, help: s.help }))
  const price = a.battery_cost_per_kwh_inr ?? 12000, km = a.km_per_day
  const extra: WSpec[] = [
    { key: 'threshold', label: 'Replace at', min: 0.6, max: 0.9, step: 0.01, fmt: (v) => `${r0(v * 100)} % health`, help: 'A later replacement line gets more life out of a pack but leaves less range.' },
    { key: 'km_per_day', label: 'Route length', min: Math.max(20, r0(km * 0.5)), max: r0(km * 1.5), step: 5, fmt: (v) => `${r0(v)} km/day`, help: 'Longer days use more cycles and need more range.' },
    { key: 'battery_cost_per_kwh_inr', label: 'Battery price', min: r0(price * 0.5), max: r0(price * 1.6), step: 500, fmt: (v) => `₹${r0(v).toLocaleString('en-IN')} / kWh`, help: 'Your assumption; it scales cost per km directly.' },
  ]
  // keep the shapes honest: a slider must always contain the current value
  return [...base, ...extra].map((s) => { const cur = a[s.key as keyof Scenario]; return typeof cur === 'number' ? { ...s, min: Math.min(s.min, cur), max: Math.max(s.max, cur) } : s })
}

const EPS = 1e-6
export function applyW(a: Scenario, o: WOver): Scenario { return { ...a, ...o } as Scenario }
export function diffW(base: Scenario, o: WOver): WOver {
  const out: WOver = {}
  for (const k of ALL_KEYS) { const t = o[k], b = base[k as keyof Scenario]; if (typeof t === 'number' && typeof b === 'number' && Math.abs(t - b) > EPS) out[k] = t }
  return out
}

/** Change in battery life between the page's scenario and the what-if one, from the two replacement results. Null when a median cannot be read. */
export function lifeDelta(base: ReplacementResult, alt: ReplacementResult) {
  const m = (r: ReplacementResult) => [num(r.months_p10), num(r.months_p50), num(r.months_p90)] as const
  const [a10, a50, a90] = m(base), [b10, b50, b90] = m(alt)
  if (a50 == null || b50 == null) return null
  const d50 = b50 - a50, d10 = a10 != null && b10 != null ? b10 - a10 : d50
  const beyond = a90 == null || b90 == null
  return { months: d50, low: d10, ...lifeChange(d50, d10, beyond ? 0 : b90 - a90, beyond) }
}
export { hhmm }
