import type { Scenario } from '../../api/types'
import { validateScenario } from '../scenario'
import tol from '../fleetTolerance.json'
import { MAX_CLASSES, UNASSIGNED, type Bus, type DraftBus, type DutyClass, type Source } from './types'

/** Duty inputs that may differ a little between two buses of one class: they are put on a grid, and buses in the same grid cell share a class. (A grid, not a
 *  distance: two buses a hair apart can fall either side of a cell edge and end up in different classes. Forecasts stay right; there are just more classes.)
 *  Everything else on a scenario must match exactly. */
export const DUTY_FIELDS = Object.keys(tol.step) as (keyof typeof tol.step)[]
const STEP = tol.step as Record<string, number>
const SLOPE = tol.slope_months_per_unit as Record<string, number>
export const TOLERANCE = tol

const round3 = (v: number) => Math.round(v * 1000) / 1000
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }
const num = (s: Scenario, f: string) => (s as unknown as Record<string, number>)[f]

/** FNV-1a, so a class keeps the same id whenever the same duty is imported again. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36).padStart(7, '0').slice(0, 6)
}

/** Everything that is not a duty input, in a fixed order, so equal scenarios give equal text. The horizon is left out: the server runs every class at 20 years. */
function exactPart(s: Scenario): string {
  const o = s as unknown as Record<string, unknown>
  return JSON.stringify(Object.keys(o).filter((k) => !(k in STEP) && k !== 'horizon_years').sort().map((k) => [k, o[k]]))
}
const bucket = (s: Scenario, mult: number) => DUTY_FIELDS.map((f) => Math.round(num(s, f) / (STEP[f] * mult)))

/** Estimate of how far apart in life two buses can be: sum of |difference| x worst measured slope. It assumes every difference pushes the same way, and tests/test_fleet_tolerance.py
 *  checks it against the engine on sampled buses at 1x and 8x the class step (at 1x the largest real/bound ratio was 0.97, so there is little headroom there). */
export function spreadBound(a: Scenario, b: Scenario): number {
  return DUTY_FIELDS.reduce((m, f) => m + Math.abs(num(a, f) - num(b, f)) * SLOPE[f], 0)
}

/** Componentwise median of the members' duty, or the member closest to it when the medians do not form a valid scenario together. */
export function centreOf(members: Scenario[]): Scenario {
  if (members.length === 1) return members[0]
  const cand = { ...members[0] } as unknown as Record<string, number>
  for (const f of DUTY_FIELDS) cand[f] = round3(median(members.map((m) => num(m, f))))
  const c = cand as unknown as Scenario
  if (Object.keys(validateScenario(c)).length === 0) return c
  return members.reduce((best, m) => (spreadBound(m, c) < spreadBound(best, c) ? m : best))
}

function nameOf(arch: string, s: Scenario, routes: string[]): string {
  const counts = new Map<string, number>()
  for (const r of routes) if (r !== UNASSIGNED) counts.set(r, (counts.get(r) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const lead = top && top[1] / routes.length >= 0.6 ? `${top[0]} · ` : ''
  const h = s.charge_start_hour
  return `${lead}${arch === '12m' ? '12 m' : '9 m'} · ${Math.round(s.km_per_day)} km · ${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`
}

export type Classified = { classes: DutyClass[]; buses: Bus[]; multiplier: number; ok: boolean; message?: string }

/** Group draft buses into duty classes. If that needs more classes than the API takes, the tolerance is widened in steps (2x, 4x, 8x) and the
 *  widening is reported, so the loss of precision is visible rather than silent. */
export function classify(drafts: DraftBus[], source: Source = 'entered'): Classified {
  for (let mult = 1; mult <= 8; mult *= 2) {
    const groups = new Map<string, DraftBus[]>()
    for (const d of drafts) {
      const k = `${exactPart(d.scenario)}|${bucket(d.scenario, mult).join(',')}`
      ;(groups.get(k) ?? groups.set(k, []).get(k)!).push(d)
    }
    if (groups.size > MAX_CLASSES && mult < 8) continue
    if (groups.size > MAX_CLASSES) return { classes: [], buses: [], multiplier: mult, ok: false, message: `These buses need ${groups.size} duty classes even at the widest tolerance, and the limit is ${MAX_CLASSES}. Group them by route first.` }
    const classes: DutyClass[] = [], buses: Bus[] = []
    for (const [k, ms] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) {
      const centre = centreOf(ms.map((m) => m.scenario))
      const id = `C-${hash(k)}`
      classes.push({ id, name: nameOf(centre.archetype, centre, ms.map((m) => m.route || UNASSIGNED)), scenario: centre, source, spreadMonths: Math.ceil(1000 * Math.max(...ms.map((m) => spreadBound(m.scenario, centre) + (m.carryMonths ?? 0)))) / 1000 })
      for (const m of ms) {
        buses.push({
          id: m.id, depot: m.depot?.trim() || UNASSIGNED, route: m.route?.trim() || UNASSIGNED, inServiceMonth: m.inServiceMonth, classId: id,
          packPriceInr: m.packPriceInr, reportedSohPct: m.reportedSohPct,
          sources: { duty: source, age: m.inServiceMonth ? source : 'assumed', depot: m.depot ? source : 'assumed', route: m.route ? source : 'assumed', ...m.sources },
        })
      }
    }
    // classes were sorted largest first and buses were appended in that order; put buses back in the caller's order
    const at = new Map(drafts.map((d, i) => [d.id, i]))
    buses.sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0))
    return { classes, buses, multiplier: mult, ok: true }
  }
  return { classes: [], buses: [], multiplier: 8, ok: false, message: 'No buses to group.' }
}
