import type { Scenario } from '../api/types'
import { validateScenario } from './scenario'

/**
 * Duty-summary CSV -> scenario fields. Runs in the browser only; nothing is uploaded.
 *
 * Columns (header names are case-insensitive; only `km` is required):
 *   date, km, arrival_soc_pct, end_soc_pct, charge_start (HH:MM), charge_end (HH:MM), charge_kwh, departure (HH:MM)
 */
export const MAX_BYTES = 1_000_000
export const MAX_ROWS = 5000

export type Derived = { key: keyof Scenario; value: number; label: string; how: string }
export type CsvResult = { derived: Derived[]; skipped: string[]; rows: number; errors: string[] }

export function parseCsv(text: string, delim = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false; else cell += c }
    else if (c === '"') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = [] }
    else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

const hours = (t: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim())
  if (!m) return null
  const h = +m[1], mi = +m[2]
  return h < 24 && mi < 60 ? h + mi / 60 : null
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))] }
/** Circular average of clock times, so 23:30 and 00:30 average to midnight, not noon. */
const clockMean = (a: number[]) => {
  const x = a.reduce((s, h) => s + Math.cos((h / 24) * 2 * Math.PI), 0), y = a.reduce((s, h) => s + Math.sin((h / 24) * 2 * Math.PI), 0)
  return ((Math.atan2(y, x) / (2 * Math.PI)) * 24 + 24) % 24
}
const round = (v: number, step: number) => Math.round(v / step) * step

export function deriveFromCsv(text: string, base: Scenario): CsvResult {
  const out: CsvResult = { derived: [], skipped: [], rows: 0, errors: [] }
  if (text.length > MAX_BYTES) { out.errors.push('File is larger than 1 MB.'); return out }
  const rows = parseCsv(text)
  if (rows.length < 2) { out.errors.push('The file needs a header row and at least one data row.'); return out }
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (n: string) => head.indexOf(n)
  if (col('km') < 0) { out.errors.push('A "km" column is required (distance driven each day).'); return out }
  const data = rows.slice(1)
  if (data.length > MAX_ROWS) { out.errors.push(`Too many rows (${data.length}). The limit is ${MAX_ROWS}.`); return out }
  out.rows = data.length
  const nums = (name: string, ok: (v: number) => boolean = () => true) => {
    const i = col(name)
    return i < 0 ? [] : data.map((r) => Number(r[i])).filter((v) => Number.isFinite(v) && ok(v))
  }
  const times = (name: string) => { const i = col(name); return i < 0 ? [] : data.map((r) => hours(r[i] ?? '')).filter((v): v is number => v != null) }
  const add = (key: keyof Scenario, value: number, label: string, how: string) => {
    const probe = { ...base, [key]: value } as Scenario
    const e = validateScenario(probe)[key as string]
    if (e) out.skipped.push(`${label}: ${value} is not allowed (${e.toLowerCase()})`)
    else out.derived.push({ key, value, label, how })
  }
  const km = nums('km', (v) => v > 0)
  if (!km.length) { out.errors.push('No rows with a distance above zero were found.'); return out }
  add('km_per_day', round(km.reduce((s, v) => s + v, 0) / km.length, 1), 'Distance per day', `average over ${km.length} service days`)

  const di = col('date')
  if (di >= 0) {
    const days = data.map((r) => Date.parse(r[di])).filter((v) => Number.isFinite(v))
    const span = days.length > 1 ? (Math.max(...days) - Math.min(...days)) / 86400000 + 1 : 0
    if (span >= 28) add('operating_days_per_year', Math.min(366, Math.round((365 * km.length) / span)), 'Days in service', `${km.length} service days in ${Math.round(span)} calendar days, scaled to a year`)
    else out.skipped.push('Days in service: needs at least 4 weeks of dates')
  }
  const cs = times('charge_start')
  if (cs.length) add('charge_start_hour', round(clockMean(cs), 0.5), 'Charging starts', 'typical start time (circular average)')
  const dep = times('departure')
  if (dep.length) add('departure_hour', round(clockMean(dep), 0.5), 'Bus departs', 'typical departure time (circular average)')
  const endSoc = nums('end_soc_pct', (v) => v > 0 && v <= 100)
  if (endSoc.length) add('soc_max_pct', Math.round(median(endSoc)), 'Charge cap', 'median level the bus is charged to')
  const arr = nums('arrival_soc_pct', (v) => v >= 0 && v <= 100)
  if (arr.length) add('soc_min_pct', Math.floor(pct(arr, 5)), 'Minimum charge', 'lowest typical arrival level (5th percentile)')

  const ki = col('charge_kwh'), si = col('charge_start'), ei = col('charge_end')
  if (ki >= 0 && si >= 0 && ei >= 0) {
    const kw = data.map((r) => {
      const a = hours(r[si] ?? ''), b = hours(r[ei] ?? ''), e = Number(r[ki])
      if (a == null || b == null || !Number.isFinite(e) || e <= 0) return null
      const d = (b - a + 24) % 24
      return d > 0.25 ? e / d : null
    }).filter((v): v is number => v != null)
    if (kw.length) add('charge_power_kw', round(median(kw), 5), 'Charger power', 'energy charged divided by charging time (average, so it includes the slow end of the charge)')
  }
  const kpk = data.map((r) => { const e = Number(r[ki]), k = Number(r[col('km')]); return ki >= 0 && e > 0 && k > 0 ? e / k : null }).filter((v): v is number => v != null)
  if (kpk.length) add('kwh_per_km', round(median(kpk), 0.01), 'Energy use', 'energy charged ÷ km driven; includes charging losses so it slightly overstates')
  return out
}
