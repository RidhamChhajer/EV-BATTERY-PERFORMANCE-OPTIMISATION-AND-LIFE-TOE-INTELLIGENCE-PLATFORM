import { describe, expect, it } from 'vitest'
import type { Scenario } from '../../api/types'
import fixture from '../../test/fixtures/fleet.json'
import presets from '../../test/fixtures/presets.json'
import { classify, DUTY_FIELDS, spreadBound, TOLERANCE } from './classes'
import { parseFleet, serializeFleet, toFleetRequest } from './io'
import { sampleFleet } from './sample'
import { ageOf, batchOf, buildRows, groupRows, requestFor, type GroupBy } from './segments'
import { MAX_CLASSES, type DraftBus, type Fleet, type FleetForecast } from './types'

const P = presets.presets as unknown as Parameters<typeof sampleFleet>[0]
const base12 = P.find((p) => p.id === '12m')!.scenario as Scenario
const NOW = new Date(2026, 10, 11)

const draft = (i: number, over: Partial<Scenario> = {}, extra: Partial<DraftBus> = {}): DraftBus => ({ id: `B-${i}`, depot: 'Depot A', route: 'Route 1', inServiceMonth: '2023-07', scenario: { ...base12, ...over }, ...extra })

/** The real response for a small two-class fleet, with the fleet rebuilt from the request that produced it. */
function realFleet(): { fleet: Fleet; forecast: FleetForecast } {
  const req = fixture.request as unknown as ReturnType<typeof toFleetRequest>
  const fleet: Fleet = {
    id: 'fx', name: 'fx', kind: 'user', createdAt: '2026-11-11T00:00:00Z',
    classes: req.classes.map((c) => ({ id: c.id, name: c.id, scenario: c.scenario as Scenario, source: 'entered' as const, spreadMonths: 0 })),
    buses: req.buses.map((b, i) => ({ id: b.id, class_id: b.class_id, depot: i % 2 ? 'Depot A' : 'Depot B', route: i % 4 ? 'Route 1' : 'Route 2', inServiceMonth: b.in_service ?? undefined, classId: b.class_id, sources: {} })),
  }
  return { fleet, forecast: fixture.response as unknown as FleetForecast }
}

describe('duty classes', () => {
  it('merges buses whose duty differs by less than a step and splits buses that differ by more', () => {
    const step = TOLERANCE.step.km_per_day
    const c = classify([draft(1, { km_per_day: 200 }), draft(2, { km_per_day: 200 + step * 0.4 }), draft(3, { km_per_day: 200 + step * 3 })])
    expect(c.ok).toBe(true)
    expect(c.classes).toHaveLength(2)
    expect(c.buses.find((b) => b.id === 'B-1')!.classId).toBe(c.buses.find((b) => b.id === 'B-2')!.classId)
    expect(c.buses.find((b) => b.id === 'B-3')!.classId).not.toBe(c.buses.find((b) => b.id === 'B-1')!.classId)
  })

  it('never merges buses that differ in something that is not a duty input', () => {
    const c = classify([draft(1), draft(2, { zone: 'cool' }), draft(3, { pack_kwh: base12.pack_kwh + 10 }), draft(4, { threshold: 0.75 }), draft(5, { electricity_tariff: 'msedcl_ht_ix' })])
    expect(c.classes).toHaveLength(5)
  })

  it('uses the median of the members for the class scenario and is valid', () => {
    const c = classify([draft(1, { km_per_day: 200 }), draft(2, { km_per_day: 200.1 }), draft(3, { km_per_day: 200.2 })])
    expect(c.classes).toHaveLength(1)
    expect(c.classes[0].scenario.km_per_day).toBeCloseTo(200.1, 3)
  })

  it('reports a spread that bounds every member, and zero for identical buses', () => {
    const same = classify([draft(1), draft(2), draft(3)])
    expect(same.classes[0].spreadMonths).toBe(0)
    const step = TOLERANCE.step.km_per_day
    const c = classify([draft(1, { km_per_day: 200 }), draft(2, { km_per_day: 200 + step * 0.45 })])
    const k = c.classes[0]
    expect(k.spreadMonths).toBeGreaterThan(0)
    for (const m of [200, 200 + step * 0.45]) expect(spreadBound({ ...base12, km_per_day: m }, k.scenario)).toBeLessThanOrEqual(k.spreadMonths + 1e-9)
    expect(k.spreadMonths).toBeLessThanOrEqual(DUTY_FIELDS.length * TOLERANCE.budget_months)
  })

  it('does not split buses over the horizon, which the server overrides to 20 years', () => {
    expect(classify([draft(1, { horizon_years: 15 }), draft(2, { horizon_years: 20 })]).classes).toHaveLength(1)
  })

  it('keeps one id for the same duty on every import', () => {
    const a = classify([draft(1), draft(2)]).classes[0].id
    const b = classify([draft(9), draft(8), draft(7)]).classes[0].id
    expect(a).toBe(b)
  })

  it('widens the tolerance, and says so, when buses need more than the API takes', () => {
    const many = Array.from({ length: 400 }, (_, i) => draft(i, { km_per_day: 100 + i * 0.4 }))
    const c = classify(many)
    expect(c.ok).toBe(true)
    expect(c.classes.length).toBeLessThanOrEqual(MAX_CLASSES)
    expect(c.multiplier).toBeGreaterThan(1)
    expect(c.buses).toHaveLength(400)
    expect(Math.max(...c.classes.map((k) => k.spreadMonths))).toBeGreaterThan(0)
  })

  it('refuses, with a reason, when even the widest tolerance is not enough', () => {
    const c = classify(Array.from({ length: 100 }, (_, i) => draft(i, { zone: i % 2 ? 'cool' : 'hot_dry', pack_kwh: 200 + i * 5 })))
    expect(c.ok).toBe(false)
    expect(c.message).toMatch(/duty classes/)
  })

  it('a one-bus fleet keeps that bus’s scenario exactly, so the single-bus pages and the fleet agree', () => {
    const c = classify([draft(1, { km_per_day: 187.3, soc_max_pct: 93 })])
    expect(c.classes[0].scenario).toEqual({ ...base12, km_per_day: 187.3, soc_max_pct: 93 })
    expect(c.classes[0].spreadMonths).toBe(0)
  })

  it('tags where each field came from, and flags what was filled in', () => {
    const c = classify([draft(1, {}, { depot: undefined, route: undefined, inServiceMonth: undefined })], 'log')
    expect(c.buses[0].sources).toMatchObject({ duty: 'log', age: 'assumed', depot: 'assumed', route: 'assumed' })
    expect(c.buses[0].depot).toBe('Unassigned')
  })
})

describe('sample fleet', () => {
  const f = sampleFleet(P, NOW)
  it('has five classes, sixty buses, three depots and says it is synthetic', () => {
    expect(f.classes).toHaveLength(5)
    expect(f.buses).toHaveLength(60)
    expect(new Set(f.buses.map((b) => b.depot)).size).toBe(3)
    expect(f.kind).toBe('sample')
    expect(f.name).toMatch(/synthetic/i)
    expect(f.buses.every((b) => b.sources.duty === 'sample')).toBe(true)
  })
  it('is the same every time, and every bus is in service before the date given', () => {
    expect(sampleFleet(P, NOW)).toEqual(f)
    expect(f.buses.every((b) => b.inServiceMonth! < '2026-11')).toBe(true)
    expect(f.buses.every((b) => ageOf(b, '2026-11-11')! >= 3)).toBe(true)
  })
})

describe('fleet file', () => {
  it('round-trips: export then import gives the same fleet', () => {
    for (const fl of [sampleFleet(P, NOW), (() => { const c = classify(Array.from({ length: 30 }, (_, i) => draft(i, { km_per_day: 150 + (i % 5) * 20 }, { reportedSohPct: 90, packPriceInr: 4.5e6 }))); return { id: 'u', name: 'u', kind: 'user' as const, classes: c.classes, buses: c.buses, createdAt: '2026-01-01T00:00:00.000Z' } })()]) {
      const back = parseFleet(serializeFleet(fl))
      expect(back.errors).toBeUndefined()
      expect(back.fleet).toEqual(fl)
    }
  })
  it('rejects bad files with a reason', () => {
    const ok = sampleFleet(P, NOW)
    const bad = (mut: (f: Fleet) => void) => { const c = structuredClone(ok); mut(c); return parseFleet(serializeFleet(c)).errors?.join(' ') ?? '' }
    expect(parseFleet('nope').errors?.[0]).toMatch(/JSON/)
    expect(parseFleet('{"format":"other"}').errors?.[0]).toMatch(/not a Pack Horizon/)
    expect(bad((f) => { f.buses[1].id = f.buses[0].id })).toMatch(/appears twice/)
    expect(bad((f) => { f.buses[0].classId = 'zzz' })).toMatch(/unknown class/)
    expect(bad((f) => { f.buses[0].inServiceMonth = '2023-13' })).toMatch(/in-service month/)
    expect(bad((f) => { f.classes[0].scenario.km_per_day = -5 })).toMatch(/invalid km_per_day/)
    expect(bad((f) => { f.buses[0].reportedSohPct = 140 })).toMatch(/cannot exceed 100/)
  })
  it('sends the server only classes and ages, never reported health or depot names', () => {
    const f = sampleFleet(P, NOW)
    f.buses[0].reportedSohPct = 91
    const req = JSON.stringify(toFleetRequest(f, '2026-11-11'))
    expect(req).not.toMatch(/reported|Depot|Route|sample/i)
    expect(JSON.parse(req).buses[0]).toEqual({ id: f.buses[0].id, class_id: f.buses[0].classId, in_service: f.buses[0].inServiceMonth })
  })
})

describe('segments, on a real engine response', () => {
  const { fleet, forecast } = realFleet()
  const rows = buildRows(fleet, forecast)
  const asOf = forecast.as_of
  const PARTITIONS: GroupBy[] = ['depot', 'route', 'type', 'cohort', 'class', 'risk', 'batch']

  it('finds the cohort of every bus, using the same age the server used', () => {
    expect(rows.every((r) => r.cohort)).toBe(true)
    for (const r of rows) expect(r.cohort!.n_buses.value as number).toBeGreaterThan(0)
    expect(rows.filter((r) => r.band === 'unknown')).toHaveLength(1)                 // the one bus with no in-service month
    expect(rows.find((r) => r.bus.inServiceMonth === undefined)!.flags).toContain('age_unknown')
  })

  it('every grouping except flags is a partition: sizes add up to the fleet and no bus is in two groups', () => {
    for (const by of PARTITIONS) {
      const g = groupRows(rows, by, asOf)
      expect(g.pending, by).toBe(false)
      expect(g.groups.reduce((s, x) => s + x.n, 0), by).toBe(fleet.buses.length)
      const ids = g.groups.flatMap((x) => x.busIds)
      expect(new Set(ids).size, by).toBe(fleet.buses.length)
    }
  })

  it('grouping never changes the totals: the expected number due in the next 12 months is the same however the fleet is cut', () => {
    const total = rows.reduce((s, r) => s + (r.due12 ?? 0), 0)
    expect(total).toBeGreaterThan(0)
    for (const by of PARTITIONS) {
      const g = groupRows(rows, by, asOf)
      expect(g.groups.reduce((s, x) => s + (x.due12 ?? 0), 0), by).toBeCloseTo(total, 9)
    }
  })

  it('flags overlap, so they are reported as overlapping and each bus appears once per flag it has', () => {
    const g = groupRows(rows, 'flags', asOf)
    expect(g.overlapping).toBe(true)
    const per = new Map<string, number>()
    for (const x of g.groups) for (const id of x.busIds) per.set(id, (per.get(id) ?? 0) + 1)
    for (const r of rows) expect(per.get(r.bus.id)).toBe(Math.max(1, r.flags.length))
  })

  it('risk bands order buses by how close they are, and an older bus is never in a later band than a younger one of the same class', () => {
    const order = ['past_median', 'within_12', 'y1_3', 'y3_5', 'later', 'beyond']
    for (const cls of ['A', 'B']) {
      const r = rows.filter((x) => x.bus.classId === cls && x.age != null).sort((a, b) => a.age! - b.age!)
      for (let i = 1; i < r.length; i++) expect(order.indexOf(r[i].band!)).toBeLessThanOrEqual(order.indexOf(r[i - 1].band!))
    }
  })

  it('batches are depot, bus type and risk band, and leave unknown-age buses out', () => {
    const batched = rows.map((r) => ({ r, b: batchOf(r) })).filter((x) => x.b)
    expect(batched.length).toBeGreaterThan(0)
    for (const { r, b } of batched) { expect(b!.depot).toBe(r.bus.depot); expect(b!.band).toBe(r.band); expect(r.band).not.toBe('unknown') }
    expect(groupRows(rows, 'batch', asOf).groups.some((g) => g.label === 'Not in a batch')).toBe(true)
  })

  it('batches are not one bus each on a fleet of the sample’s shape: a depot and type in one band is a unit of several', () => {
    const f = sampleFleet(P, NOW)
    const sizes = groupRows(buildRows(f, fakeForecast(f)), 'batch', '2026-11-11').groups.filter((g) => g.label !== 'Not in a batch').map((g) => g.n)
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(5)
    expect(sizes.length).toBeLessThan(f.buses.length / 3)
  })

  it('structure-only groupings work with no forecast; the others wait for it', () => {
    const bare = buildRows(fleet, null)
    expect(groupRows(bare, 'depot', null).pending).toBe(false)
    expect(groupRows(bare, 'depot', null).groups.reduce((s, g) => s + g.n, 0)).toBe(fleet.buses.length)
    for (const by of ['risk', 'batch', 'flags'] as GroupBy[]) expect(groupRows(bare, by, null).pending).toBe(true)
  })

  it('a group’s own request holds only its buses and the classes they use', () => {
    const g = groupRows(rows, 'depot', asOf).groups[0]
    const req = requestFor(fleet, g.busIds, asOf)
    expect(req.buses).toHaveLength(g.n)
    expect(new Set(req.buses.map((b) => b.class_id))).toEqual(new Set(req.classes.map((c) => c.id)))
  })
})

/** A stand-in response with the real shape: months to the line shrink with age, so the sample fleet spreads over several bands. */
function fakeForecast(f: Fleet): FleetForecast {
  const lab = (v: number, unit = 'months') => ({ value: v, unit, evidence_level: 'derived' as const, validated_on_buses: false as const, note: '' })
  const seen = new Map<string, FleetForecast['cohorts'][number]>()
  for (const b of f.buses) {
    const age = ageOf(b, '2026-11-11')!
    const k = `${b.classId}|${age}`
    if (seen.has(k)) { const c = seen.get(k)!; c.n_buses = lab((c.n_buses.value as number) + 1, 'buses'); continue }
    const left = Math.max(2, 144 - age)
    seen.set(k, { class_id: b.classId, age_months: lab(age), n_buses: lab(1, 'buses'), months_to_line_p10: lab(left * 0.6), months_to_line_p50: lab(left), months_to_line_p90: lab(left * 1.4), chance_due_next_12_months: lab(left < 12 ? 0.6 : 0.02, 'fraction'), flags: [] })
  }
  return { as_of: '2026-11-11', cohorts: [...seen.values()], classes: f.classes.map((c) => ({ id: c.id, extrapolation_reasons: [] })) } as unknown as FleetForecast
}
