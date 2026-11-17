import type { PresetResult, Scenario, Stage } from '../api/types'
import { hhmm } from './scenario'

/** The model inputs a bus operator can actually change. Bus B = Bus A with some of these replaced. */
export const LEVERS = ['soc_max_pct', 'charge_start_hour', 'heat_rise_c', 'kwh_per_km', 'charge_power_kw'] as const
export type LeverKey = (typeof LEVERS)[number]
export type Overrides = Partial<Record<LeverKey, number>>

const EPS = 1e-6
export const applyOverrides = (a: Scenario, o: Overrides): Scenario => ({ ...a, ...o })
/** Levers of `target` that differ from `base` (so a slider parked on Bus A's own value counts as no change). */
export function diffLevers(base: Scenario, target: Scenario): Overrides {
  const o: Overrides = {}
  for (const k of LEVERS) {
    const b = base[k], t = target[k]
    if (typeof t === 'number' && typeof b === 'number' && Math.abs(t - b) > EPS) o[k] = t
  }
  return o
}
export const hasChanges = (o: Overrides) => Object.keys(o).length > 0
export function sameLevers(a: Overrides, b: Overrides): boolean {
  const ka = Object.keys(a) as LeverKey[], kb = Object.keys(b) as LeverKey[]
  return ka.length === kb.length && ka.every((k) => b[k] != null && Math.abs((a[k] as number) - (b[k] as number)) <= EPS)
}

export type SliderSpec = { key: LeverKey; label: string; min: number; max: number; step: number; fmt: (v: number) => string; confirm?: string; help: string }
const r2 = (x: number) => Math.round(x * 100) / 100
const widen = (min: number, max: number, a: number | null | undefined) => (typeof a === 'number' ? [Math.min(min, a), Math.max(max, a)] : [min, max])

/** Slider ranges depend on Bus A, so they always contain Bus A's own value. */
export function sliderSpecs(a: Scenario): SliderSpec[] {
  const num = (v: number | null | undefined, d: number) => (typeof v === 'number' ? v : d)
  const socFloor = Math.max(Math.min(60, a.soc_max_pct), num(a.soc_min_pct, 10) + 10)
  const [socLo, socHi] = widen(Math.min(socFloor, a.soc_max_pct), 100, a.soc_max_pct)
  const kwh = num(a.kwh_per_km, 1.2), pw = num(a.charge_power_kw, 100)
  const [kLo, kHi] = widen(r2(kwh * 0.8), r2(kwh * 1.1), kwh)
  const [pLo, pHi] = widen(Math.max(10, Math.round(pw * 0.25)), Math.min(500, Math.round(pw * 2)), pw)
  const [hLo, hHi] = widen(0, 10, a.heat_rise_c)
  return [
    { key: 'soc_max_pct', label: 'Stop charging at', min: socLo, max: socHi, step: 1, fmt: (v) => `${Math.round(v)} %`, help: 'A lower cap spends less time very full, which slows ageing, but gives less range.' },
    { key: 'charge_start_hour', label: 'Start charging at', min: 0, max: 23.5, step: 0.5, fmt: hhmm, help: 'Starting later leaves the pack sitting full for fewer hours before the bus leaves.' },
    { key: 'heat_rise_c', label: 'Pack warmer than air by', min: hLo, max: hHi, step: 0.5, fmt: (v) => `${v.toFixed(1)} °C`, confirm: 'Needs your confirmation: depends on your cooling system', help: 'Cooler cells age more slowly. Whether you can achieve this depends on the bus.' },
    { key: 'kwh_per_km', label: 'Energy use', min: kLo, max: kHi, step: 0.01, fmt: (v) => `${v.toFixed(2)} kWh/km`, confirm: 'Needs your confirmation: depends on driving, route and load', help: 'Using less energy per km means fewer cycles for the same distance.' },
    { key: 'charge_power_kw', label: 'Charger power', min: pLo, max: pHi, step: 5, fmt: (v) => `${Math.round(v)} kW`, help: 'In the model, charger power barely moves battery life. It is here so you can see that for yourself.' },
  ]
}

export const stageFor = (p: PresetResult, includeConfirm: boolean): Stage => (includeConfirm && p.with_confirmation ? p.with_confirmation : p.charging)
/** A preset that landed on exactly the same advice as another one is shown as a short pointer, not a repeated card. */
export function duplicateOf(p: PresetResult, all: PresetResult[], includeConfirm: boolean): PresetResult | null {
  if (!p.same_as) return null
  const other = all.find((x) => x.id === p.same_as)
  if (!other) return null
  return stageFor(p, includeConfirm).summary === stageFor(other, includeConfirm).summary ? other : null
}

export const signed = (v: number, d = 1, unit = '') => { const s = v.toFixed(d); const z = Number(s) === 0; return `${z ? '' : v > 0 ? '+' : '−'}${z ? (0).toFixed(d) : Math.abs(v).toFixed(d)}${unit}` }
/** "+0.9 months" and "range +0.5 to +1.5": a change in battery life with its range. */
export function lifeChange(p50: number, p10: number, p90: number, p90Beyond = false) {
  // When the 90th-percentile life is past the horizon its change cannot be measured, so only the 10th percentile is quoted.
  return { headline: Math.abs(p50) < 0.05 ? 'No change' : `${signed(p50)} months`, range: p90Beyond ? `10th percentile ${signed(p10)} months` : `range ${signed(p10)} to ${signed(p90)} months` }
}
export function leverValue(lever: string, v: number, unit: string): string {
  if (lever === 'charge_start_hour') return hhmm(v)
  const n = Number(v.toFixed(2))
  const u = ({ degC: '°C', pct: '%' } as Record<string, string>)[unit] ?? unit
  return u ? `${n} ${u}` : String(n)
}

/** Engine warnings reworded for a fleet manager. Unknown warnings pass through unchanged. */
export function plainWarning(w: string): string {
  if (w.startsWith('Charging is not finished before departure')) return 'Bus B would not finish charging before it leaves, so it would set off with less than a full charge. Treat the gains shown here as unreliable and start charging earlier.'
  if (w.startsWith('Duty exceeds the usable pack energy')) return 'The daily distance needs more energy than one charge holds. Add a mid-day charge, shorten the route or raise the charge cap.'
  return w
}
/** Warnings that Bus B has and Bus A does not, so the notice is about the changes, not the baseline. */
export const newWarnings = (a: string[], b: string[]) => b.filter((w) => !a.includes(w)).map(plainWarning)
