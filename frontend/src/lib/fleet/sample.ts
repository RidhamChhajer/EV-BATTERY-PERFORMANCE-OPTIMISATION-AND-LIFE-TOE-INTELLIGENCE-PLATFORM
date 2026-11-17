import type { ArchetypePreset } from '../../api/types'
import { DEFAULT_PRICE } from '../scenario'
import { classify } from './classes'
import type { DraftBus, Fleet } from './types'

/** Small seeded generator, so the sample fleet is the same every time for the same date. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

/** A city e-bus operator with five routes over three depots, bought in delivery batches the way tenders are: an early pilot batch, then larger orders.
 *  Each route's buses share one duty, as route sheets do. Most routes sit comfortably inside what a pack can do; one is longer than a 12 m pack can cover
 *  with the 20 % reserve, one slips later as packs age, and the oldest pilot batch is already near its replacement window, so the page has a few
 *  clear things to say. All numbers are the bus-type presets with the duty moved, and in-service months are drawn for the demonstration.
 *  It is not a real fleet and says so everywhere it appears. `km` is the change from the preset's km a day; `batches` are [buses, oldest, newest age in months]. */
const ROUTES = [
  { depot: 'Depot A', route: 'Route 12', type: '12m', km: -30, start: 0, batches: [[10, 86, 98], [8, 30, 38]] },
  { depot: 'Depot A', route: 'Route 14', type: '12m', km: 40, start: 1, batches: [[8, 14, 22]] },
  { depot: 'Depot B', route: 'Route 21', type: '9m', km: -50, start: 0, batches: [[6, 104, 108], [8, 42, 50]] },
  { depot: 'Depot C', route: 'Route 33', type: '12m', km: -10, start: 2, batches: [[12, 6, 13]] },
  { depot: 'Depot C', route: 'Route 47', type: '9m', km: -15, start: -1, batches: [[8, 54, 62]] },
] as const

export function sampleFleet(presets: Pick<ArchetypePreset, 'id' | 'scenario'>[], now: Date = new Date()): Fleet {
  const rand = rng(2026)
  const nowIdx = now.getFullYear() * 12 + now.getMonth()
  const drafts: DraftBus[] = []
  let n = 100
  for (const r of ROUTES) {
    const base = presets.find((p) => p.id === r.type)?.scenario ?? presets[0].scenario
    const start = (((base.charge_start_hour + r.start) % 24) + 24) % 24
    const scenario = { ...base, battery_cost_per_kwh_inr: DEFAULT_PRICE, km_per_day: Math.max(60, base.km_per_day + r.km), charge_start_hour: start }
    for (const [count, oldest, newest] of r.batches) {
      for (let i = 0; i < count; i++) {
        const idx = nowIdx - Math.floor(oldest + rand() * (newest - oldest + 1))      // the oldest the forecast can take is 9 years (108 months)
        drafts.push({ id: `B-${n++}`, depot: r.depot, route: r.route, inServiceMonth: ym(Math.floor(idx / 12), (idx % 12) + 1), scenario })
      }
    }
  }
  const c = classify(drafts, 'sample')
  return { id: 'sample', name: 'Sample fleet: synthetic, for demonstration', kind: 'sample', classes: c.classes, buses: c.buses, createdAt: now.toISOString() }
}
