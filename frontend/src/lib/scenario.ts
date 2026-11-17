import { SCENARIO_BOUNDS } from '../api/bounds'
import type { Scenario } from '../api/types'

export type FieldKey = Exclude<keyof Scenario, 'archetype' | 'zone' | 'electricity_tariff'>
export type Group = 'Bus' | 'Duty' | 'Charging' | 'Climate and heat' | 'Battery and replacement' | 'Electricity' | 'Advanced assumptions'

export type FieldMeta = {
  key: FieldKey
  label: string
  unit: string
  group: Group
  /** Value shown to the user = stored value x scale (fractions are shown as percent). */
  scale?: number
  step: number
  decimals: number
  help: string
  /** Where the default comes from, shown with the assumption badge. */
  source: string
  hour?: boolean
}

export const ZONE_LABELS: Record<string, string> = {
  hot_dry: 'Hot-dry', hot_humid: 'Hot-humid', composite: 'Composite', cool: 'Cool',
}
export const ZONE_SUB: Record<string, string> = {
  hot_dry: 'semi-arid interior', hot_humid: 'coastal', composite: 'northern plains', cool: 'hill region',
}

export const FIELDS: FieldMeta[] = [
  { key: 'pack_kwh', label: 'Battery size', unit: 'kWh', group: 'Bus', step: 5, decimals: 0, source: 'Bus type default', help: 'Nominal energy of the whole battery pack when new.' },
  { key: 'kwh_per_km', label: 'Energy use', unit: 'kWh/km', group: 'Bus', step: 0.05, decimals: 2, source: 'Bus type default', help: 'Average energy the bus uses per kilometre, including air conditioning and passengers.' },
  { key: 'operating_days_per_year', label: 'Days in service', unit: 'days / year', group: 'Bus', step: 5, decimals: 0, source: 'Assumption', help: 'How many days a year the bus runs its daily route.' },
  { key: 'km_per_day', label: 'Distance per day', unit: 'km', group: 'Duty', step: 5, decimals: 0, source: 'Bus type default', help: 'Kilometres the bus drives each service day.' },
  { key: 'soc_max_pct', label: 'Charge cap', unit: '%', group: 'Charging', step: 1, decimals: 0, source: 'Operator choice', help: 'Highest charge level the depot charges to. A lower cap is gentler on the battery but gives less range.' },
  { key: 'soc_min_pct', label: 'Minimum charge', unit: '%', group: 'Charging', step: 1, decimals: 0, source: 'Operator choice', help: 'Lowest charge level the bus is allowed to reach. The model has no depth-of-discharge effect, so this only changes usable energy.' },
  { key: 'charge_power_kw', label: 'Charger power', unit: 'kW', group: 'Charging', step: 5, decimals: 0, source: 'Bus type default', help: 'Power of the depot charger. The cycling data show no charge-speed effect, so this mainly changes how long the pack sits full.' },
  { key: 'charge_start_hour', label: 'Charging starts', unit: 'hh:mm', group: 'Charging', step: 0.5, decimals: 1, source: 'Operator choice', hour: true, help: 'Time the bus is plugged in. Starting later leaves less time sitting full before departure.' },
  { key: 'departure_hour', label: 'Bus departs', unit: 'hh:mm', group: 'Charging', step: 0.5, decimals: 1, source: 'Operator choice', hour: true, help: 'Time the bus leaves the depot.' },
  { key: 'heat_rise_c', label: 'Pack warmer than air by', unit: '°C', group: 'Climate and heat', step: 0.5, decimals: 1, source: 'Assumption, no bus data', help: 'How much hotter the battery cells run than the outside air on average. No public data exists for buses, so this is an assumption.' },
  { key: 'battery_cost_per_kwh_inr', label: 'Battery price', unit: '₹ / kWh', group: 'Battery and replacement', step: 500, decimals: 0, source: 'Your input', help: 'What you pay per kWh to replace the pack. Needed for cost per km.' },
  { key: 'threshold', label: 'Replace when health falls to', unit: '%', group: 'Battery and replacement', scale: 100, step: 1, decimals: 0, source: 'Operator choice', help: 'Battery health at which you plan to replace the pack. 80 % is the common rule.' },
  { key: 'horizon_years', label: 'Forecast length', unit: 'years', group: 'Battery and replacement', step: 1, decimals: 0, source: 'Setting', help: 'How many years ahead the model looks.' },
  { key: 'electricity_custom_inr_per_kwh', label: 'Your price', unit: '₹ / kWh', group: 'Electricity', step: 0.25, decimals: 2, source: 'Your input', help: 'The all-in price you pay per kWh at the depot, including wheeling. It is applied flat all day, with no time-of-day change.' },
  { key: 'charger_efficiency', label: 'Charger efficiency', unit: '%', group: 'Electricity', scale: 100, step: 1, decimals: 0, source: 'Assumption, no public bus data', help: 'Share of the energy drawn from the grid that reaches the battery. Charger and cable losses make up the rest. 92 % is an assumption; check your charger datasheet.' },
  { key: 'pack_penalty_min', label: 'Weakest-cell effect, low', unit: '%', group: 'Advanced assumptions', scale: 100, step: 1, decimals: 0, source: 'Assumption, no public data', help: 'Smallest share by which the weakest cell in a pack ends its life earlier than the average cell.' },
  { key: 'pack_penalty_max', label: 'Weakest-cell effect, high', unit: '%', group: 'Advanced assumptions', scale: 100, step: 1, decimals: 0, source: 'Assumption, no public data', help: 'Largest share by which the weakest cell ends its life earlier. The runs span values from low to high.' },
]
export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, FieldMeta>
export const GROUPS: Group[] = ['Bus', 'Duty', 'Charging', 'Climate and heat', 'Battery and replacement', 'Electricity', 'Advanced assumptions']

export type Tariff = Scenario['electricity_tariff']
/** Where each electricity choice comes from. Rates live on the server (engine/bus/tariffs.json) with their sources; this is only the label. */
export const TARIFF_OPTIONS: { id: Tariff; label: string; short: string }[] = [
  { id: 'none', label: 'Not included', short: 'Off' },
  { id: 'msedcl_ht_ix', label: 'Pune · MSEDCL HT IX EV charging', short: 'MSEDCL HT IX' },
  { id: 'msedcl_lt_viii', label: 'Pune · MSEDCL LT VIII EV charging', short: 'MSEDCL LT VIII' },
  { id: 'custom', label: 'My own price', short: 'Own price' },
]
export const DEFAULT_PRICE = 12000

export function hhmm(h: number): string {
  const t = ((h % 24) + 24) % 24
  let hh = Math.floor(t), mm = Math.round((t - hh) * 60)
  if (mm === 60) { hh = (hh + 1) % 24; mm = 0 }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function boundsText(key: string): string {
  const b = SCENARIO_BOUNDS[key]
  if (!b || b.kind !== 'number') return ''
  const m = FIELD_BY_KEY[key as FieldKey]?.scale ?? 1
  const lo = b.min == null ? null : b.min * m, hi = b.max == null ? null : b.max * m
  if (lo != null && hi != null) return `${lo}${b.minExclusive ? ' (above)' : ''} to ${hi}`
  if (lo != null) return `above ${lo}`
  return hi != null ? `up to ${hi}` : ''
}

/** Same rules as the API (bounds come from docs/openapi.json) plus its two cross-field checks. */
export function validateScenario(s: Scenario): Partial<Record<string, string>> {
  const err: Partial<Record<string, string>> = {}
  for (const [k, b] of Object.entries(SCENARIO_BOUNDS)) {
    if (b.kind !== 'number') continue
    const v = (s as Record<string, unknown>)[k]
    if (v == null) { if (!b.nullable) err[k] = 'Required'; continue }
    if (typeof v !== 'number' || !Number.isFinite(v)) { err[k] = 'Enter a number'; continue }
    if (b.integer && !Number.isInteger(v)) { err[k] = 'Whole numbers only'; continue }
    if (b.min != null && (b.minExclusive ? v <= b.min : v < b.min)) err[k] = `Must be ${b.minExclusive ? 'above' : 'at least'} ${b.min * (FIELD_BY_KEY[k as FieldKey]?.scale ?? 1)}`
    else if (b.max != null && (b.maxExclusive ? v >= b.max : v > b.max)) err[k] = `Must be ${b.maxExclusive ? 'below' : 'at most'} ${b.max * (FIELD_BY_KEY[k as FieldKey]?.scale ?? 1)}`
  }
  if (!err.soc_max_pct && !err.soc_min_pct && s.soc_max_pct - s.soc_min_pct < 10) err.soc_max_pct = 'Must be at least 10 points above the minimum charge'
  if (!err.pack_penalty_max && !err.pack_penalty_min && s.pack_penalty_max < s.pack_penalty_min) err.pack_penalty_max = 'Must not be below the low value'
  return err
}

const NUMERIC = Object.keys(SCENARIO_BOUNDS).filter((k) => SCENARIO_BOUNDS[k].kind === 'number')
/** Choices stored as words. archetype is handled first; these ride along in the link with the same default-skipping rule. */
const CHOICES = ['zone', 'electricity_tariff'] as const

/** Only values that differ from the bus-type defaults go in the link, so shared links stay short. */
export function toQuery(s: Scenario, defaults: Scenario): string {
  const p = new URLSearchParams()
  p.set('archetype', s.archetype)
  p.set('zone', s.zone)
  if (s.electricity_tariff !== defaults.electricity_tariff) p.set('electricity_tariff', s.electricity_tariff)
  for (const k of NUMERIC) {
    const v = (s as Record<string, unknown>)[k], d = (defaults as Record<string, unknown>)[k]
    if (v != null && v !== d) p.set(k, String(v))
  }
  return p.toString()
}

export function fromQuery(search: string, defaultsFor: (a: 'a12' | string) => Scenario): { scenario: Scenario | null; ignored: string[] } {
  const p = new URLSearchParams(search)
  const ignored: string[] = []
  const arch = p.get('archetype')
  const options = SCENARIO_BOUNDS.archetype.options ?? []
  const archetype = arch && options.includes(arch) ? arch : '12m'
  if (arch && !options.includes(arch)) ignored.push('archetype')
  const s = { ...defaultsFor(archetype) } as Record<string, unknown>
  for (const k of CHOICES) {
    const v = p.get(k)
    if (v) { if ((SCENARIO_BOUNDS[k].options ?? []).includes(v)) s[k] = v; else ignored.push(k) }
  }
  for (const k of NUMERIC) {
    const raw = p.get(k)
    if (raw == null) continue
    const n = Number(raw)
    const probe = { ...s, [k]: n } as unknown as Scenario
    if (raw.trim() === '' || !Number.isFinite(n) || validateScenario(probe)[k]) ignored.push(k)
    else s[k] = n
  }
  return { scenario: s as unknown as Scenario, ignored }
}
