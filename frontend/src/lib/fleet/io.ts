import type { Scenario } from '../../api/types'
import { validateScenario } from '../scenario'
import { MAX_BUSES, MAX_CLASSES, type Bus, type DutyClass, type Fleet, type FleetRequest, type Source, type SourceKey } from './types'

const FORMAT = 'pack-horizon-fleet'
const VERSION = 1
const SOURCES: Source[] = ['log', 'entered', 'inherited', 'assumed', 'sample']
const SOURCE_KEYS: SourceKey[] = ['duty', 'age', 'price', 'depot', 'route']
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export const serializeFleet = (f: Fleet): string => JSON.stringify({ format: FORMAT, version: VERSION, fleet: f }, null, 2)

export type Parsed = { fleet: Fleet; errors?: undefined } | { fleet?: undefined; errors: string[] }
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length >= 1 && v.length <= max

/** Strict check of a fleet file or a stored fleet. Nothing here is trusted: every bus and class is validated the way the forms validate them. */
export function parseFleet(text: string): Parsed {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { errors: ['The file is not valid JSON.'] } }
  if (!isObj(raw) || raw.format !== FORMAT) return { errors: ['This is not a Pack Horizon fleet file.'] }
  if (raw.version !== VERSION) return { errors: [`Unsupported fleet file version ${String(raw.version)}.`] }
  const f = raw.fleet
  if (!isObj(f) || !Array.isArray(f.classes) || !Array.isArray(f.buses)) return { errors: ['The fleet file has no classes or buses.'] }
  const errors: string[] = []
  if (f.classes.length < 1 || f.classes.length > MAX_CLASSES) errors.push(`A fleet needs 1 to ${MAX_CLASSES} duty classes.`)
  if (f.buses.length < 1 || f.buses.length > MAX_BUSES) errors.push(`A fleet needs 1 to ${MAX_BUSES} buses.`)
  if (errors.length) return { errors }
  const classes: DutyClass[] = []
  const classIds = new Set<string>()
  f.classes.forEach((c, i) => {
    if (!isObj(c) || !str(c.id) || !str(c.name, 120) || !isObj(c.scenario)) { errors.push(`Class ${i + 1} is incomplete.`); return }
    if (classIds.has(c.id)) { errors.push(`Class id ${c.id} appears twice.`); return }
    const bad = Object.keys(validateScenario(c.scenario as unknown as Scenario))
    if (bad.length) { errors.push(`Class ${c.name}: invalid ${bad.slice(0, 3).join(', ')}.`); return }
    classIds.add(c.id)
    classes.push({ id: c.id, name: c.name, scenario: c.scenario as unknown as Scenario, source: SOURCES.includes(c.source as Source) ? (c.source as Source) : 'entered', spreadMonths: typeof c.spreadMonths === 'number' && c.spreadMonths >= 0 ? c.spreadMonths : 0 })
  })
  const buses: Bus[] = []
  const busIds = new Set<string>()
  f.buses.forEach((b, i) => {
    if (!isObj(b) || !str(b.id)) { errors.push(`Bus ${i + 1} has no id.`); return }
    if (busIds.has(b.id)) { errors.push(`Bus id ${b.id} appears twice.`); return }
    if (!str(b.classId) || !classIds.has(b.classId as string)) { errors.push(`Bus ${b.id} names an unknown class.`); return }
    if (!str(b.depot) || !str(b.route)) { errors.push(`Bus ${b.id} needs a depot and a route (use "Unassigned" if unknown).`); return }
    if (b.inServiceMonth != null && !(typeof b.inServiceMonth === 'string' && MONTH.test(b.inServiceMonth))) { errors.push(`Bus ${b.id}: in-service month must look like 2023-07.`); return }
    for (const k of ['packPriceInr', 'reportedSohPct'] as const) if (b[k] != null && !(typeof b[k] === 'number' && Number.isFinite(b[k]) && (b[k] as number) > 0)) { errors.push(`Bus ${b.id}: ${k} must be a positive number.`); return }
    if (b.reportedSohPct != null && (b.reportedSohPct as number) > 100) { errors.push(`Bus ${b.id}: reportedSohPct cannot exceed 100.`); return }
    const sources: Bus['sources'] = {}
    if (isObj(b.sources)) for (const k of SOURCE_KEYS) if (SOURCES.includes(b.sources[k] as Source)) sources[k] = b.sources[k] as Source
    busIds.add(b.id)
    buses.push({ id: b.id, depot: b.depot as string, route: b.route as string, inServiceMonth: b.inServiceMonth as string | undefined, classId: b.classId as string,
      packPriceInr: b.packPriceInr as number | undefined, reportedSohPct: b.reportedSohPct as number | undefined, sources })
  })
  if (errors.length) return { errors: errors.slice(0, 20) }
  return { fleet: { id: str(f.id) ? (f.id as string) : 'fleet', name: str(f.name, 120) ? (f.name as string) : 'Fleet', kind: f.kind === 'sample' ? 'sample' : 'user', classes, buses, createdAt: typeof f.createdAt === 'string' ? f.createdAt : new Date(0).toISOString() } }
}

/** The request the API takes. Only duty classes and bus ages go to the server; raw logs and reported health never do. */
export function toFleetRequest(f: Fleet, asOf?: string, forecastYears = 10): FleetRequest {
  return {
    mode: 'prior',
    classes: f.classes.map((c) => ({ id: c.id, scenario: c.scenario })),
    buses: f.buses.map((b) => ({ id: b.id, class_id: b.classId, ...(b.inServiceMonth ? { in_service: b.inServiceMonth } : {}), ...(b.packPriceInr ? { pack_price_inr: b.packPriceInr } : {}) })),
    ...(asOf ? { as_of: asOf } : {}), forecast_years: forecastYears,
  }
}
