import type { ArchetypePreset, Scenario } from '../../api/types'
import { deriveFromCsv, parseCsv } from '../csv'
import { FIELD_BY_KEY, validateScenario, type FieldKey } from '../scenario'
import { classify, spreadBound } from './classes'
import { MAX_BUSES, MAX_CLASSES, UNASSIGNED, type Bus, type DraftBus, type DutyClass, type Fleet, type Source } from './types'

/** The input methods that read text (roster CSV, duty-log CSV, paste). Pure functions, so they can run in a web worker and be tested without a screen. Every one produces
 *  draft buses and a list of rejected rows; nothing reaches the fleet until the preview is confirmed (mergeFleet below builds that preview). */

export const MAX_CHARS = 20_000_000
export const MAX_ROWS = 200_000
/** The server runs every class at a 20-year horizon and rejects a fleet whose oldest bus plus the forecast window passes it (engine/decide/fleet.py, `fleet_forecast`).
 *  The window is whole financial years (April to March) and starts with the rest of the current one, so it runs a little past `forecastYears` by an amount that depends on
 *  the month: the same arithmetic as `period_edges`. tests/test_api_fleet.py pins the server to this table, and roster.test.ts pins this function to the same table. */
export function maxAgeMonths(forecastYears = 10, nowMs: number = Date.now()): number {
  const month = new Date(nowMs).getMonth() + 1
  const first = ((((4 - month) % 12) + 12) % 12) || 12
  let last = first
  while (last < 12 * forecastYears) last += 12
  return 240 - last
}
const years = (months: number) => `${Math.floor(months / 12)} years${months % 12 ? ` ${months % 12} months` : ''}`

export type Context = {
  /** The bus on screen: the base every missing field falls back to. */
  screen: Scenario
  presets: Pick<ArchetypePreset, 'id' | 'scenario'>[]
  /** Date used for ages; a number so the context can be sent to a worker. */
  nowMs: number
}

export type Rejected = { row: number; id?: string; reason: string; cells: string[] }
export type Missing = { age: number; dutyAssumed: number; dutyInherited: number; type: number; depot: number; route: number; price: number }
export type ReadResult = {
  ok: boolean
  /** Problems with the file as a whole (nothing could be read). */
  errors: string[]
  kind: 'roster' | 'log'
  drafts: DraftBus[]
  rejected: Rejected[]
  header: string[]
  rows: number
  columns: { used: string[]; ignored: string[] }
  missing: Missing
  /** Non-fatal remarks, for example duty values from a log that were outside the allowed range. */
  notes: string[]
}

const emptyMissing = (): Missing => ({ age: 0, dutyAssumed: 0, dutyInherited: 0, type: 0, depot: 0, route: 0, price: 0 })
const fail = (errors: string[]): ReadResult => ({ ok: false, errors, kind: 'roster', drafts: [], rejected: [], header: [], rows: 0, columns: { used: [], ignored: [] }, missing: emptyMissing(), notes: [] })

// ---- dates and types -------------------------------------------------------------------------------------------------------------------------------------------

const monthIndex = (y: number, m: number) => y * 12 + (m - 1)
const nowIndex = (nowMs: number) => { const d = new Date(nowMs); return monthIndex(d.getFullYear(), d.getMonth() + 1) }

/** Accepts 2023-07, 2023/07, 2023-07-15 and 07/2023, and gives back 2023-07 (or null). */
export function parseMonth(raw: string): string | null {
  const t = raw.trim()
  let y: number, m: number
  let r = /^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/.exec(t)
  if (r) { y = +r[1]; m = +r[2] } else if ((r = /^(\d{1,2})[-/](\d{4})$/.exec(t))) { m = +r[1]; y = +r[2] } else return null
  return m >= 1 && m <= 12 && y >= 1990 ? `${y}-${String(m).padStart(2, '0')}` : null
}

/** A valid in-service month, or the reason it cannot be used. */
export function checkMonth(raw: string, nowMs: number, forecastYears = 10): { month: string } | { error: string } {
  const month = parseMonth(raw)
  if (!month) return { error: `"${raw.trim()}" is not a month. Use a form like 2023-07.` }
  const age = nowIndex(nowMs) - monthIndex(+month.slice(0, 4), +month.slice(5))
  if (age < 0) return { error: `${month} is in the future.` }
  const max = maxAgeMonths(forecastYears, nowMs)
  if (age > max) return { error: `${month} is more than ${years(max)} ago, and the forecast cannot take a bus that old (its age plus the ${forecastYears}-year forecast has to fit in 20 years).` }
  return { month }
}

export function parseType(raw: string): '12m' | '9m' | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, '').replace(/m(etres?|eters?)?$/, '')
  return t === '12' ? '12m' : t === '9' ? '9m' : null
}

/** The bus on screen with its type changed: the five bus-type defaults come from the type, everything else the operator chose stays (the same rule as the Bus type switch). */
export function scenarioForType(screen: Scenario, presets: Context['presets'], type: string): Scenario {
  if (type === screen.archetype) return screen
  const d = presets.find((p) => p.id === type)?.scenario ?? screen
  return { ...screen, archetype: type as Scenario['archetype'], pack_kwh: d.pack_kwh, kwh_per_km: d.kwh_per_km, km_per_day: d.km_per_day, charge_power_kw: d.charge_power_kw, operating_days_per_year: d.operating_days_per_year }
}

// ---- columns ---------------------------------------------------------------------------------------------------------------------------------------------------

/** Roster duty columns (file name -> scenario field). */
export const ROSTER_DUTY: Record<string, FieldKey> = {
  km_per_day: 'km_per_day', charge_start: 'charge_start_hour', departure: 'departure_hour', soc_max_pct: 'soc_max_pct', soc_min_pct: 'soc_min_pct',
  kwh_per_km: 'kwh_per_km', charge_power_kw: 'charge_power_kw', operating_days_per_year: 'operating_days_per_year', heat_rise_c: 'heat_rise_c',
}
/** Roster columns that are not duty: buses must match exactly on them to share a class. */
export const ROSTER_OTHER: Record<string, FieldKey> = { pack_kwh: 'pack_kwh', battery_cost_per_kwh_inr: 'battery_cost_per_kwh_inr' }
const ZONES = ['hot_dry', 'hot_humid', 'composite', 'cool']
const HOUR_COLS = new Set(['charge_start', 'departure'])
const LOG_COLS = ['date', 'km', 'arrival_soc_pct', 'end_soc_pct', 'charge_start', 'charge_end', 'charge_kwh', 'departure']

const ALIAS: Record<string, string> = {
  bus_id: 'id', id: 'id', bus: 'id', fleet_no: 'id', fleet_number: 'id',
  in_service: 'in_service', in_service_month: 'in_service', commissioned: 'in_service', in_service_date: 'in_service',
  depot: 'depot', route: 'route', bus_type: 'type', type: 'type', archetype: 'type',
  km_per_day: 'km_per_day', daily_km: 'km_per_day', charge_start: 'charge_start', charge_start_hour: 'charge_start', departure: 'departure', departure_hour: 'departure',
  soc_max_pct: 'soc_max_pct', soc_min_pct: 'soc_min_pct', kwh_per_km: 'kwh_per_km', charge_power_kw: 'charge_power_kw', operating_days_per_year: 'operating_days_per_year',
  pack_price_inr: 'price', pack_price: 'price', reported_soh_pct: 'soh', soh_pct: 'soh',
  zone: 'zone', climate_zone: 'zone', heat_rise_c: 'heat_rise_c', pack_kwh: 'pack_kwh', battery_cost_per_kwh_inr: 'battery_cost_per_kwh_inr', battery_price_per_kwh: 'battery_cost_per_kwh_inr',
  date: 'date', km: 'km', arrival_soc_pct: 'arrival_soc_pct', end_soc_pct: 'end_soc_pct', charge_end: 'charge_end', charge_kwh: 'charge_kwh',
}
const norm = (h: string) => h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_')

function delimiterOf(text: string): string {
  const first = text.slice(0, text.search(/\r|\n|$/))
  const n = (c: string) => first.split(c).length - 1
  const best = [['\t', n('\t')], [';', n(';')], [',', n(',')]].sort((a, b) => (b[1] as number) - (a[1] as number))[0]
  return (best[1] as number) > 0 ? (best[0] as string) : ','
}

const hourOf = (t: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim())
  if (m) { const h = +m[1], mi = +m[2]; return h < 24 && mi < 60 ? h + mi / 60 : null }
  const v = Number(t)
  return t.trim() !== '' && Number.isFinite(v) && v >= 0 && v < 24 ? v : null
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }
const round3 = (v: number) => Math.round(v * 1000) / 1000
const defined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')

// ---- reading ---------------------------------------------------------------------------------------------------------------------------------------------------

type Parsed = { id: string; typeId: string; typeGiven: boolean; given: Partial<Record<FieldKey, number>>; zone?: Scenario['zone']; month?: string; depot: string; route: string; price?: number; soh?: number; cells: string[]; row: number }

/** Reads a roster CSV, a duty-log CSV or pasted spreadsheet cells (tab, comma or semicolon separated, header row first). A date column with repeating bus ids is a log; one row per bus is a roster. */
export function readTable(text: string, ctx: Context): ReadResult {
  if (text.length > MAX_CHARS) return fail(['The file is larger than 20 MB.'])
  const baseErr = Object.keys(validateScenario(ctx.screen))
  if (baseErr.length) return fail([`Fix the bus on screen first: ${baseErr.slice(0, 3).join(', ')}. Buses that do not say otherwise take its values.`])
  const grid = parseCsv(text, delimiterOf(text))
  if (grid.length < 2) return fail(['Needs a header row and at least one bus.'])
  if (grid.length - 1 > MAX_ROWS) return fail([`Too many rows (${grid.length - 1}). The limit is ${MAX_ROWS}.`])
  const rawHead = grid[0].map(norm)
  const head = rawHead.map((h) => ALIAS[h] ?? '')
  const idCol = head.indexOf('id')
  if (idCol < 0) return fail(['A bus_id column is required (the operator\'s own fleet number).'])
  const data = grid.slice(1)
  const dateCol = head.indexOf('date')
  const ids = data.map((r) => cell(r, idCol))
  const repeats = new Set(ids).size < ids.filter(Boolean).length
  const kind = dateCol >= 0 && repeats ? 'log' : 'roster'
  const used = rawHead.filter((_, i) => head[i]), ignored = rawHead.filter((h, i) => !head[i] && h)
  const res: ReadResult = { ok: true, errors: [], kind, drafts: [], rejected: [], header: grid[0].map((h) => h.trim()), rows: data.length, columns: { used, ignored }, missing: emptyMissing(), notes: [] }
  return kind === 'log' ? readLog(data, head, ctx, res) : readRoster(data, head, ctx, res)
}

function readRoster(data: string[][], head: string[], ctx: Context, res: ReadResult): ReadResult {
  // a roster's "km" column means km per day when there is no km_per_day column
  const at = (name: string) => head.indexOf(name === 'km_per_day' && !head.includes('km_per_day') ? 'km' : name)
  const reject = (row: number, cells: string[], reason: string, id?: string) => res.rejected.push({ row, id, reason, cells })
  const seen = new Set<string>()
  const parsed: Parsed[] = []
  data.forEach((cells, i) => {
    const row = i + 1
    const id = cell(cells, at('id'))
    if (!id) return reject(row, cells, 'No bus id.')
    if (id.length > 64) return reject(row, cells, 'Bus id is longer than 64 characters.', id.slice(0, 20))
    if (seen.has(id)) return reject(row, cells, `Bus id ${id} appears more than once in the file (the first row was kept).`, id)
    const p: Parsed = { id, typeId: ctx.screen.archetype, typeGiven: false, given: {}, depot: cell(cells, at('depot')), route: cell(cells, at('route')), cells, row }
    const t = cell(cells, at('type'))
    if (t) { const ty = parseType(t); if (!ty) return reject(row, cells, `Bus type "${t}" is not 12 m or 9 m.`, id); p.typeId = ty; p.typeGiven = true }
    const mo = cell(cells, at('in_service'))
    if (mo) { const c = checkMonth(mo, ctx.nowMs); if ('error' in c) return reject(row, cells, c.error, id); p.month = c.month }
    const pr = cell(cells, at('price'))
    if (pr) { const v = Number(pr.replace(/[,₹\s]/g, '')); if (!Number.isFinite(v) || v <= 0) return reject(row, cells, `Pack price "${pr}" must be a positive number of rupees.`, id); p.price = v }
    const so = cell(cells, at('soh'))
    if (so) { const v = Number(so.replace('%', '')); if (!Number.isFinite(v) || v <= 0 || v > 100) return reject(row, cells, `Reported health "${so}" must be above 0 and at most 100.`, id); p.soh = v }
    for (const [col, key] of Object.entries(ROSTER_DUTY)) {
      const raw = cell(cells, at(col))
      if (!raw) continue
      const v = HOUR_COLS.has(col) ? hourOf(raw) : Number(raw)
      if (v == null || !Number.isFinite(v)) return reject(row, cells, `${FIELD_BY_KEY[key].label}: "${raw}" is not a number${HOUR_COLS.has(col) ? ' or a time like 22:30' : ''}.`, id)
      p.given[key] = v
    }
    for (const [col, key] of Object.entries(ROSTER_OTHER)) {
      const raw = cell(cells, at(col))
      if (!raw) continue
      const v = Number(raw.replace(/[,₹\s]/g, ''))
      if (!Number.isFinite(v)) return reject(row, cells, `${FIELD_BY_KEY[key].label}: "${raw}" is not a number.`, id)
      p.given[key] = v
    }
    const z = cell(cells, at('zone')).toLowerCase().replace(/[\s-]+/g, '_')
    if (z) { if (!ZONES.includes(z)) return reject(row, cells, `Climate zone "${cell(cells, at('zone'))}" is not one of ${ZONES.join(', ')}.`, id); p.zone = z as Scenario['zone'] }
    seen.add(id)
    parsed.push(p)
  })

  // Duty a bus does not state is taken from the other buses on its route (same bus type); if none state it, from the bus on screen.
  const byRoute = new Map<string, Parsed[]>()
  for (const p of parsed) if (p.route) { const k = `${p.route}|${p.typeId}`; (byRoute.get(k) ?? byRoute.set(k, []).get(k)!).push(p) }
  const inherit = (p: Parsed, key: FieldKey): number | undefined => {
    const peers = (byRoute.get(`${p.route}|${p.typeId}`) ?? []).map((q) => q.given[key]).filter((v): v is number => v != null)
    return peers.length ? round3(median(peers)) : undefined
  }
  for (const p of parsed) {
    const inherited: Partial<Record<FieldKey, number>> = {}
    if (p.route) for (const key of Object.values(ROSTER_DUTY)) if (p.given[key] == null) { const v = inherit(p, key); if (v != null) inherited[key] = v }
    const scenario = { ...scenarioForType(ctx.screen, ctx.presets, p.typeId), ...inherited, ...p.given, ...(p.zone ? { zone: p.zone } : {}) } as Scenario
    const touched = new Set<string>([...Object.keys(p.given), ...Object.keys(inherited)])
    const errs = Object.entries(validateScenario(scenario)).filter(([k]) => touched.has(k) || ((k === 'soc_max_pct' || k === 'soc_min_pct') && (touched.has('soc_max_pct') || touched.has('soc_min_pct'))))
    if (errs.length) { const [k, m] = errs[0]; reject(p.row, p.cells, `${FIELD_BY_KEY[k as FieldKey]?.label ?? k}: ${m}.`, p.id); continue }
    const given = Object.keys(p.given).length > 0 || p.zone != null     // a bus type alone is not duty: the defaults for it are an assumption, and a re-import must not reset a bus's duty to them
    const duty: Source = given ? 'entered' : Object.keys(inherited).length ? 'inherited' : 'assumed'
    res.drafts.push({
      id: p.id, depot: p.depot || undefined, route: p.route || undefined, inServiceMonth: p.month, scenario, packPriceInr: p.price, reportedSohPct: p.soh,
      stated: { ...p.given, ...(p.zone ? { zone: p.zone } : {}), ...(p.typeGiven ? { archetype: p.typeId as Scenario['archetype'] } : {}) } as Partial<Scenario>,
      sources: { duty, price: p.price || p.given.battery_cost_per_kwh_inr != null ? 'entered' : 'assumed' },
    })
    const m = res.missing
    if (!p.month) m.age++
    if (duty === 'assumed') m.dutyAssumed++
    if (duty === 'inherited') m.dutyInherited++
    if (!p.typeGiven) m.type++
    if (!p.depot) m.depot++
    if (!p.route) m.route++
    if (!p.price && p.given.battery_cost_per_kwh_inr == null) m.price++
  }
  res.rejected.sort((a, b) => a.row - b.row)
  if (!res.drafts.length) { res.ok = false; res.errors.push('No usable rows were found.') }
  return res
}

const quote = (c: string) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)

function readLog(data: string[][], head: string[], ctx: Context, res: ReadResult): ReadResult {
  const at = (name: string) => head.indexOf(name)
  if (at('km') < 0) return fail(['A duty log needs a km column (distance driven each day).'])
  const dutyCols = LOG_COLS.filter((c) => at(c) >= 0)
  const byBus = new Map<string, string[][]>()
  const firstRow = new Map<string, number>()
  data.forEach((r, i) => {
    const id = cell(r, at('id'))
    if (!id) { res.rejected.push({ row: i + 1, reason: 'No bus id.', cells: r }); return }
    const rows = byBus.get(id) ?? byBus.set(id, []).get(id)!
    if (!rows.length) firstRow.set(id, i + 1)
    rows.push(r)
  })
  const first = (rows: string[][], col: string) => { const i = at(col); if (i < 0) return ''; const n = new Map<string, number>(); for (const r of rows) { const v = cell(r, i); if (v) n.set(v, (n.get(v) ?? 0) + 1) } return n.size ? [...n.entries()].sort((a, b) => b[1] - a[1])[0][0] : '' }
  let outOfRange = 0
  for (const [id, rows] of byBus) {
    const row = firstRow.get(id)!
    const bad = (reason: string) => res.rejected.push({ row, id, reason, cells: rows[0] })
    if (id.length > 64) { bad('Bus id is longer than 64 characters.'); continue }
    const t = first(rows, 'type')
    let typeId = ctx.screen.archetype
    if (t) { const ty = parseType(t); if (!ty) { bad(`Bus type "${t}" is not 12 m or 9 m.`); continue } typeId = ty }
    let month: string | undefined
    const mo = first(rows, 'in_service')
    if (mo) { const c = checkMonth(mo, ctx.nowMs); if ('error' in c) { bad(c.error); continue } month = c.month }
    const base = scenarioForType(ctx.screen, ctx.presets, typeId)
    const text = [dutyCols.map((c) => c).join(','), ...rows.map((r) => dutyCols.map((c) => quote(cell(r, at(c)))).join(','))].join('\n')
    const d = deriveFromCsv(text, base)
    if (d.errors.length) { bad(d.errors[0]); continue }
    const scenario = { ...base } as unknown as Record<string, unknown>
    const stated: Record<string, unknown> = t ? { archetype: typeId } : {}
    for (const x of d.derived) { scenario[x.key] = x.value; stated[x.key] = x.value }
    outOfRange += d.skipped.length
    res.drafts.push({
      id, depot: first(rows, 'depot') || undefined, route: first(rows, 'route') || undefined, inServiceMonth: month, scenario: scenario as unknown as Scenario,
      stated: stated as Partial<Scenario>, sources: { duty: 'log', price: 'assumed' },
    })
    const m = res.missing
    if (!month) m.age++
    if (!t) m.type++
    if (!first(rows, 'depot')) m.depot++
    if (!first(rows, 'route')) m.route++
    m.price++
  }
  if (outOfRange) res.notes.push(`${outOfRange} duty value${outOfRange > 1 ? 's' : ''} derived from the logs fell outside the allowed range and ${outOfRange > 1 ? 'were' : 'was'} left at the bus on screen's value.`)
  if (!res.drafts.length) { res.ok = false; res.errors.push('No usable buses were found in the log.') }
  return res
}

// ---- adding buses by hand ----------------------------------------------------------------------------------------------------------------------------------------

export type BatchSpec = { count: number; prefix: string; start: number; depot: string; route: string; inService: string; scenario: Scenario; source: Source }

/** The Add buses form: a batch of identical buses with consecutive ids. Duplicate ids are caught here, before anything is committed. */
export function makeBatch(spec: BatchSpec, existingIds: Iterable<string>, nowMs: number): { drafts: DraftBus[]; errors: string[] } {
  const errors: string[] = []
  const { count, start } = spec
  if (!Number.isInteger(count) || count < 1 || count > 500) errors.push('How many: a whole number from 1 to 500.')
  if (!Number.isInteger(start) || start < 0 || start > 999_999) errors.push('Start number: a whole number from 0 to 999999.')
  if (spec.prefix.length > 20) errors.push('The id prefix is longer than 20 characters.')
  if (spec.depot.length > 64 || spec.route.length > 64) errors.push('Depot and route names can be at most 64 characters.')
  let month: string | undefined
  if (spec.inService.trim()) { const c = checkMonth(spec.inService, nowMs); if ('error' in c) errors.push(`In service: ${c.error}`); else month = c.month }
  const bad = Object.entries(validateScenario(spec.scenario))
  if (bad.length) errors.push(`The duty is not valid: ${FIELD_BY_KEY[bad[0][0] as FieldKey]?.label ?? bad[0][0]} ${(bad[0][1] ?? '').toLowerCase()}.`)
  if (errors.length) return { drafts: [], errors }
  const taken = new Set(existingIds)
  const drafts: DraftBus[] = []
  const clashes: string[] = []
  for (let i = 0; i < count; i++) {
    const id = `${spec.prefix}${start + i}`
    if (taken.has(id)) clashes.push(id)
    drafts.push({ id, depot: spec.depot.trim() || undefined, route: spec.route.trim() || undefined, inServiceMonth: month, scenario: spec.scenario, sources: { duty: spec.source, price: 'assumed' } })
  }
  if (clashes.length) return { drafts: [], errors: [`${clashes.length} id${clashes.length > 1 ? 's are' : ' is'} already in the fleet (${clashes.slice(0, 4).join(', ')}${clashes.length > 4 ? ', …' : ''}). Change the prefix or the start number.`] }
  return { drafts, errors: [] }
}

// ---- the gate: merge drafts into a fleet and describe the result -------------------------------------------------------------------------------------------------

export type MergeOpts = { mode: 'add' | 'replace'; nowMs: number; name?: string; source?: Source
  /** Edit a sample fleet in place instead of replacing it with the new buses. */
  keepSample?: boolean }
export type MergePlan = {
  ok: boolean
  message?: string
  fleet: Fleet | null
  added: number
  updated: number
  /** Buses already in the fleet that the file does not mention: they are kept, never deleted. */
  kept: number
  /** Buses dropped because the fleet is replaced. */
  replaced: number
  classesBefore: number
  classesAfter: number
  multiplier: number
}

const fresh = (id: string, name: string, kind: Fleet['kind'], now: number, classes: DutyClass[], buses: Bus[]): Fleet => ({ id, name, kind, classes, buses, createdAt: new Date(now).toISOString() })

/** Builds the fleet that would result, without touching the current one. Re-importing matches on bus id: new buses are added, buses in the file are updated, buses not in the file are kept.
 *  A bus whose file row says nothing about duty or bus type keeps the duty it already had, and a blank depot, route, age or price keeps what is there: nothing is erased by omission. */
export function mergeFleet(existing: Fleet | null, drafts: DraftBus[], opts: MergeOpts): MergePlan {
  const source = opts.source ?? 'entered'
  const before = existing?.classes.length ?? 0
  const none: MergePlan = { ok: false, fleet: null, added: 0, updated: 0, kept: 0, replaced: 0, classesBefore: before, classesAfter: before, multiplier: 1 }
  if (!drafts.length) return { ...none, message: 'There are no buses to add.' }

  // a sample fleet is a demonstration, so real data replaces it instead of being mixed into it
  if (!existing || opts.mode === 'replace' || (existing.kind === 'sample' && !opts.keepSample)) {
    if (drafts.length > MAX_BUSES) return { ...none, message: `A fleet can have at most ${MAX_BUSES} buses.` }
    const c = classify(drafts, source)
    if (!c.ok) return { ...none, message: c.message, multiplier: c.multiplier }
    return { ok: true, fleet: fresh('fleet', opts.name ?? 'My fleet', 'user', opts.nowMs, c.classes, c.buses), added: drafts.length, updated: 0, kept: 0, replaced: existing?.buses.length ?? 0, classesBefore: before, classesAfter: c.classes.length, multiplier: c.multiplier }
  }

  const byId = new Map(existing.buses.map((b) => [b.id, b]))
  const classOf = new Map(existing.classes.map((c) => [c.id, c]))
  const incoming = new Set(drafts.map((d) => d.id))
  const resolved: DraftBus[] = drafts.map((d) => {
    const old = byId.get(d.id)
    if (!old) return d
    const oc = classOf.get(old.classId)!
    // Only what the input states changes. A file that names the same bus with no duty columns keeps the duty it has; one that adds a zone changes the zone and nothing else.
    // Moving the bus to the other bus type starts from that type's defaults instead.
    const sameType = !d.stated?.archetype || d.stated.archetype === oc.scenario.archetype
    const partial = d.stated != null && sameType
    const scenario = partial ? ({ ...oc.scenario, ...d.stated } as Scenario) : d.scenario
    const untouched = partial && Object.keys(d.stated!).length === 0
    return {
      ...d,
      depot: d.depot ?? (old.depot !== UNASSIGNED ? old.depot : undefined), route: d.route ?? (old.route !== UNASSIGNED ? old.route : undefined),
      inServiceMonth: d.inServiceMonth ?? old.inServiceMonth, packPriceInr: d.packPriceInr ?? old.packPriceInr, reportedSohPct: d.reportedSohPct ?? old.reportedSohPct,
      scenario, carryMonths: partial ? oc.spreadMonths : 0,
      sources: defined({ ...d.sources, duty: untouched ? (old.sources.duty ?? oc.source) : d.sources?.duty, age: d.inServiceMonth ? d.sources?.age : old.sources.age, price: d.packPriceInr ? d.sources?.price : old.sources.price }),
    }
  })
  const kept = existing.buses.filter((b) => !incoming.has(b.id))
  const updated = drafts.filter((d) => byId.has(d.id)).length
  const total = kept.length + resolved.length
  if (total > MAX_BUSES) return { ...none, message: `That would make ${total} buses, and a fleet can have at most ${MAX_BUSES}.` }

  // First try to keep every existing class as it is and only classify the incoming buses.
  const c = classify(resolved, source)
  if (!c.ok) return { ...none, message: c.message, multiplier: c.multiplier }
  const keptClassIds = new Set(kept.map((b) => b.classId))
  const classes = new Map<string, DutyClass>(existing.classes.filter((k) => keptClassIds.has(k.id)).map((k) => [k.id, k]))
  for (const nc of c.classes) {
    const oc = classes.get(nc.id)
    // the same class again: keep the existing scenario, and widen its spread by how far the new class's centre is from it, so the spread is never understated
    classes.set(nc.id, oc ? { ...oc, spreadMonths: Math.ceil(1000 * Math.max(oc.spreadMonths, nc.spreadMonths + spreadBound(nc.scenario, oc.scenario))) / 1000 } : nc)
  }
  if (classes.size <= MAX_CLASSES) {
    return { ok: true, fleet: { ...existing, classes: [...classes.values()], buses: [...kept, ...c.buses] }, added: drafts.length - updated, updated, kept: kept.length, replaced: 0, classesBefore: before, classesAfter: classes.size, multiplier: c.multiplier }
  }

  // Too many classes together: classify everything again, from each existing bus's class scenario, carrying the class's spread forward.
  const all: DraftBus[] = [
    ...kept.map((b) => { const oc = classOf.get(b.classId)!; return { id: b.id, depot: b.depot, route: b.route, inServiceMonth: b.inServiceMonth, scenario: oc.scenario, packPriceInr: b.packPriceInr, reportedSohPct: b.reportedSohPct, sources: b.sources, carryMonths: oc.spreadMonths } as DraftBus }),
    ...resolved,
  ]
  const all2 = classify(all, existing.classes[0]?.source ?? source)
  if (!all2.ok) return { ...none, message: all2.message, multiplier: all2.multiplier }
  return { ok: true, fleet: { ...existing, classes: all2.classes, buses: all2.buses }, added: drafts.length - updated, updated, kept: kept.length, replaced: 0, classesBefore: before, classesAfter: all2.classes.length, multiplier: all2.multiplier }
}

// ---- editing buses already in the fleet --------------------------------------------------------------------------------------------------------------------------

export type BusPatch = { depot?: string; route?: string; inServiceMonth?: string; duty?: { scenario: Scenario; source: Source } }

/** Edits some buses. Depot, route and in-service month change in place; a duty change re-classes only the edited buses (the other classes are untouched). */
export function editBuses(fleet: Fleet, ids: string[], patch: BusPatch, nowMs: number): { ok: boolean; message?: string; fleet: Fleet } {
  const set = new Set(ids)
  const depot = patch.depot?.trim(), route = patch.route?.trim()
  if ((depot != null && depot.length > 64) || (route != null && route.length > 64)) return { ok: false, message: 'Depot and route names can be at most 64 characters.', fleet }
  let month: string | undefined
  if (patch.inServiceMonth != null && patch.inServiceMonth.trim() !== '') { const c = checkMonth(patch.inServiceMonth, nowMs); if ('error' in c) return { ok: false, message: c.error, fleet }; month = c.month }
  if (patch.duty) { const bad = Object.keys(validateScenario(patch.duty.scenario)); if (bad.length) return { ok: false, message: `The duty is not valid (${bad.slice(0, 3).join(', ')}).`, fleet } }
  const edited = (b: Bus): Bus => ({
    ...b, depot: depot || b.depot, route: route || b.route, inServiceMonth: month ?? b.inServiceMonth,
    sources: { ...b.sources, ...(depot ? { depot: 'entered' as const } : {}), ...(route ? { route: 'entered' as const } : {}), ...(month ? { age: 'entered' as const } : {}) },
  })
  const buses = fleet.buses.map((b) => (set.has(b.id) ? edited(b) : b))
  if (!patch.duty) return { ok: true, fleet: { ...fleet, buses } }
  const drafts: DraftBus[] = buses.filter((b) => set.has(b.id)).map((b) => ({
    id: b.id, depot: b.depot, route: b.route, inServiceMonth: b.inServiceMonth, scenario: patch.duty!.scenario, packPriceInr: b.packPriceInr, reportedSohPct: b.reportedSohPct,
    sources: { ...b.sources, duty: patch.duty!.source }, carryMonths: 0,
  }))
  const rest = { ...fleet, buses: buses.filter((b) => !set.has(b.id)) }
  const plan = mergeFleet(rest.buses.length ? { ...rest, classes: rest.classes.filter((c) => rest.buses.some((b) => b.classId === c.id)) } : null, drafts, { mode: 'add', nowMs, source: patch.duty.source, keepSample: true })
  if (!plan.ok || !plan.fleet) return { ok: false, message: plan.message, fleet }
  // keep the original order, name and id of the fleet
  const order = new Map(fleet.buses.map((b, i) => [b.id, i]))
  const next = { ...fleet, classes: plan.fleet.classes, buses: [...plan.fleet.buses].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) }
  return { ok: true, fleet: next }
}

// ---- files out ---------------------------------------------------------------------------------------------------------------------------------------------------

export const ROSTER_HEADER = ['bus_id', 'in_service', 'depot', 'route', 'bus_type', 'zone', 'pack_kwh', 'battery_cost_per_kwh_inr', 'km_per_day', 'charge_start', 'departure', 'soc_max_pct', 'soc_min_pct', 'kwh_per_km', 'charge_power_kw', 'operating_days_per_year', 'heat_rise_c', 'pack_price_inr', 'reported_soh_pct']

/** A clock time as hh:mm when that is exact, otherwise as a decimal hour, so an export never moves a bus across a class boundary. */
const clock = (h: number) => { const t = ((h % 24) + 24) % 24, mm = Math.round(t * 60); return Math.abs(mm / 60 - t) < 1e-9 ? `${String(Math.floor(mm / 60) % 24).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}` : String(h) }

/** The fleet as a roster CSV (a register: one row per bus, duty and the settings that differ between buses taken from the bus's class). Threshold, electricity tariff, charger efficiency
 *  and the weakest-cell range are not in it: they come from the bus on screen on import, so use the fleet file as the full backup. */
export function rosterCsv(f: Fleet): string {
  const cls = new Map(f.classes.map((c) => [c.id, c.scenario]))
  const rows = f.buses.map((b) => {
    const s = cls.get(b.classId)!
    return [b.id, b.inServiceMonth ?? '', b.depot === UNASSIGNED ? '' : b.depot, b.route === UNASSIGNED ? '' : b.route, s.archetype, s.zone, s.pack_kwh, s.battery_cost_per_kwh_inr ?? '', s.km_per_day, clock(s.charge_start_hour), clock(s.departure_hour),
      s.soc_max_pct, s.soc_min_pct, s.kwh_per_km, s.charge_power_kw, s.operating_days_per_year, s.heat_rise_c, b.packPriceInr ?? '', b.reportedSohPct ?? ''].map((v) => quote(String(v))).join(',')
  })
  return [ROSTER_HEADER.join(','), ...rows].join('\n') + '\n'
}

/** A roster template: the full header and three clearly synthetic example rows. */
export function rosterTemplate(): string {
  const ex: Record<string, string>[] = [
    { bus_id: 'EXAMPLE-1', in_service: '2023-07', depot: 'Depot A', route: 'Route 1', bus_type: '12m', km_per_day: '210', charge_start: '22:00', departure: '05:00' },
    { bus_id: 'EXAMPLE-2', in_service: '2024-02', depot: 'Depot A', route: 'Route 1', bus_type: '12m' },
    { bus_id: 'EXAMPLE-3', in_service: '2022-11', depot: 'Depot B', route: 'Route 2', bus_type: '9m', zone: 'cool', km_per_day: '160' },
  ]
  return [ROSTER_HEADER.join(','), ...ex.map((r) => ROSTER_HEADER.map((h) => r[h] ?? '').join(','))].join('\n') + '\n'
}
export const logTemplate = () => ['bus_id,date,km,arrival_soc_pct,end_soc_pct,charge_start,charge_end,charge_kwh,departure,depot,route,in_service',
  'EXAMPLE-1,2026-09-01,212,24,100,22:10,02:40,300,05:00,Depot A,Route 1,2023-07', 'EXAMPLE-1,2026-09-02,208,26,100,22:05,02:30,296,05:00,Depot A,Route 1,2023-07'].join('\n') + '\n'

/** The rows that were not imported, with the reason first, so the file can be fixed and loaded again. */
export function rejectedCsv(header: string[], rejected: Rejected[]): string {
  return [['data_row', 'reason', ...header].map(quote).join(','), ...rejected.map((r) => [String(r.row), r.reason, ...r.cells].map(quote).join(','))].join('\n') + '\n'
}
