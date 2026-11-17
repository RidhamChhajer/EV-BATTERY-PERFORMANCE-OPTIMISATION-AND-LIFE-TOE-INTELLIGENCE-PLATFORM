import { describe, expect, it } from 'vitest'
import type { Scenario } from '../../api/types'
import presets from '../../test/fixtures/presets.json'
import { DEFAULT_PRICE } from '../scenario'
import { classify, TOLERANCE } from './classes'
import { checkMonth, editBuses, maxAgeMonths, logTemplate, makeBatch, mergeFleet, parseMonth, parseType, readTable, rejectedCsv, rosterCsv, rosterTemplate, scenarioForType, type Context } from './roster'
import { parseFleet, serializeFleet } from './io'
import { sampleFleet } from './sample'
import { MAX_CLASSES, UNASSIGNED, type DraftBus, type Fleet } from './types'

const P = presets.presets as unknown as Context['presets']
const screen = { ...(P.find((p) => p.id === '12m')!.scenario as Scenario), battery_cost_per_kwh_inr: DEFAULT_PRICE }
const NOW = new Date(2026, 10, 11).getTime()
const ctx: Context = { screen, presets: P, nowMs: NOW }
const H = 'bus_id,in_service,depot,route,bus_type,km_per_day,charge_start,departure'

const userFleet = (): Fleet => {
  const d = (id: string, km: number, extra: Partial<DraftBus> = {}): DraftBus => ({ id, depot: 'Depot A', route: 'Route 1', inServiceMonth: '2023-07', scenario: { ...screen, km_per_day: km }, sources: { duty: 'entered' }, ...extra })
  const plan = mergeFleet(null, [d('B-1', 200), d('B-2', 200), d('B-3', 160, { depot: 'Depot B', route: 'Route 2' })], { mode: 'replace', nowMs: NOW })
  return plan.fleet!
}

describe('months and types', () => {
  it('reads the common month forms and rejects the rest', () => {
    expect(parseMonth('2023-07')).toBe('2023-07')
    expect(parseMonth('2023/7')).toBe('2023-07')
    expect(parseMonth('2023-07-15')).toBe('2023-07')
    expect(parseMonth('07/2023')).toBe('2023-07')
    for (const bad of ['2023-13', 'Jul-23', '', '23', '2023-00']) expect(parseMonth(bad)).toBeNull()
  })

  it('refuses a month in the future and one too old for the forecast, at the boundary the server uses', () => {
    expect(checkMonth('2026-11', NOW)).toEqual({ month: '2026-11' })
    expect(checkMonth('2026-12', NOW)).toHaveProperty('error', expect.stringContaining('future'))
    // November: the oldest bus the forecast takes is 115 months (9 years 7 months), which is April 2017
    expect(checkMonth('2017-04', NOW)).toEqual({ month: '2017-04' })
    expect(checkMonth('2017-03', NOW)).toHaveProperty('error', expect.stringContaining('9 years 7 months'))
  })

  it('has the same oldest-bus table as POST /api/v1/fleet (tests/test_api_fleet.py::MAX_AGE_BY_MONTH)', () => {
    const table = { 1: 117, 2: 118, 3: 119, 4: 120, 5: 109, 6: 110, 7: 111, 8: 112, 9: 113, 10: 114, 11: 115, 12: 116 }
    for (const [m, max] of Object.entries(table)) expect(maxAgeMonths(10, new Date(2026, +m - 1, 11).getTime())).toBe(max)
  })

  it('reads bus types and keeps the operator\'s choices when the type changes', () => {
    expect(parseType('12 m')).toBe('12m')
    expect(parseType('9')).toBe('9m')
    expect(parseType('15m')).toBeNull()
    const s9 = scenarioForType({ ...screen, zone: 'cool', soc_max_pct: 90 }, P, '9m')
    expect(s9.archetype).toBe('9m')
    expect(s9.pack_kwh).toBe(P.find((p) => p.id === '9m')!.scenario.pack_kwh)
    expect(s9.zone).toBe('cool')
    expect(s9.soc_max_pct).toBe(90)
  })
})

describe('reading a roster', () => {
  it('reads good rows, rejects bad ones with a row number and reason, and never drops the good rows', () => {
    const r = readTable([H, 'B-1,2023-07,Depot A,Route 1,12m,210,22:00,05:00', 'B-2,2023-13,Depot A,Route 1,12m,,,', ',2023-07,Depot A,Route 1,12m,,,', 'B-4,2023-07,Depot A,Route 1,15m,,,', 'B-5,2023-07,Depot A,Route 1,12m,9000,,', 'B-1,2022-01,Depot A,Route 1,12m,,,', 'B-7,2022-01,Depot A,Route 1,12m,abc,,'].join('\n'), ctx)
    expect(r.ok).toBe(true)
    expect(r.kind).toBe('roster')
    expect(r.drafts.map((d) => d.id)).toEqual(['B-1'])
    expect(r.rejected.map((x) => x.row)).toEqual([2, 3, 4, 5, 6, 7])
    expect(r.rejected[0].reason).toContain('not a month')
    expect(r.rejected[1].reason).toContain('No bus id')
    expect(r.rejected[2].reason).toContain('not 12 m or 9 m')
    expect(r.rejected[3].reason).toMatch(/Distance per day/)
    expect(r.rejected[4].reason).toContain('more than once')
    expect(r.rejected[5].reason).toContain('not a number')
    expect(r.drafts[0].scenario.km_per_day).toBe(210)
    expect(r.drafts[0].scenario.charge_start_hour).toBe(22)
    expect(r.drafts[0].inServiceMonth).toBe('2023-07')
  })

  it('accepts a pasted spreadsheet (tabs), semicolons, header aliases and a byte-order mark', () => {
    const tab = readTable(['Bus ID\tIn Service\tDepot\tRoute\tKM', 'B-1\t2023-07\tA\tR1\t180', 'B-2\t2024-01\tA\tR1\t182'].join('\n'), ctx)
    expect(tab.drafts.map((d) => d.scenario.km_per_day)).toEqual([180, 182])
    const semi = readTable('﻿bus_id;depot\nB-1;A\nB-2;A', ctx)
    expect(semi.drafts).toHaveLength(2)
    expect(semi.columns.used).toContain('depot')
  })

  it('says what each missing field becomes, and counts it', () => {
    const r = readTable(['bus_id,in_service,route,km_per_day', 'B-1,2023-07,R1,200', 'B-2,,R1,', 'B-3,2023-07,,'].join('\n'), ctx)
    const by = Object.fromEntries(r.drafts.map((d) => [d.id, d]))
    expect(by['B-1'].sources?.duty).toBe('entered')
    expect(by['B-2'].sources?.duty).toBe('inherited')                // same route as B-1
    expect(by['B-2'].scenario.km_per_day).toBe(200)
    expect(by['B-3'].sources?.duty).toBe('assumed')                  // no route peers: the bus on screen
    expect(by['B-3'].scenario.km_per_day).toBe(screen.km_per_day)
    expect(by['B-2'].inServiceMonth).toBeUndefined()
    expect(r.missing).toEqual({ age: 1, dutyAssumed: 1, dutyInherited: 1, type: 3, depot: 3, route: 1, price: 3 })
    expect(r.columns.ignored).toEqual([])
  })

  it('inherits from the median of the route, within one bus type only', () => {
    const r = readTable(['bus_id,route,bus_type,km_per_day', 'A,R,12m,100', 'B,R,12m,200', 'C,R,12m,300', 'D,R,12m,', 'E,R,9m,', 'F,R,9m,150'].join('\n'), ctx)
    const by = Object.fromEntries(r.drafts.map((d) => [d.id, d]))
    expect(by.D.scenario.km_per_day).toBe(200)
    expect(by.E.scenario.km_per_day).toBe(150)
  })

  it('reports ignored columns and file-level problems', () => {
    expect(readTable('bus_id,colour\nB-1,red', ctx).columns.ignored).toEqual(['colour'])
    expect(readTable('depot\nA', ctx).ok).toBe(false)
    expect(readTable('bus_id', ctx).errors[0]).toContain('header row')
    expect(readTable('bus_id\n', ctx).ok).toBe(false)
    const bad = readTable('bus_id\nB-1', { ...ctx, screen: { ...screen, km_per_day: -5 } })
    expect(bad.ok).toBe(false)
    expect(bad.errors[0]).toContain('Fix the bus on screen')
    expect(readTable('bus_id\n' + 'x\n'.repeat(5) + '', ctx).drafts).toHaveLength(1)   // repeated id: first kept
  })

  it('takes bus type from the file and keeps the pack price and reported health as given', () => {
    const r = readTable(['bus_id,bus_type,pack_price_inr,reported_soh_pct', 'N-1,9m,"1,200,000",91', 'N-2,12m,-5,', 'N-3,12m,,101'].join('\n'), ctx)
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].scenario.archetype).toBe('9m')
    expect(r.drafts[0].packPriceInr).toBe(1_200_000)
    expect(r.drafts[0].reportedSohPct).toBe(91)
    expect(r.rejected).toHaveLength(2)
  })
})

describe('reading a duty log', () => {
  const log = [
    'bus_id,date,km,arrival_soc_pct,end_soc_pct,charge_start,departure,depot,route,in_service',
    ...Array.from({ length: 40 }, (_, i) => `L-1,2026-09-${String(1 + (i % 28)).padStart(2, '0')},${200 + (i % 3)},25,100,22:00,05:00,Depot A,Route 1,2023-07`),
    ...Array.from({ length: 40 }, (_, i) => `L-2,2026-09-${String(1 + (i % 28)).padStart(2, '0')},${150 + (i % 3)},30,95,23:30,05:00,Depot B,Route 2,2024-03`),
    'L-3,2026-09-01,,,,,,Depot B,Route 2,2024-03',
    'L-3,2026-09-02,,,,,,Depot B,Route 2,2024-03',
  ].join('\n')

  it('is told apart from a roster and derives each bus\'s duty from its own rows', () => {
    const r = readTable(log, ctx)
    expect(r.kind).toBe('log')
    expect(r.drafts.map((d) => d.id)).toEqual(['L-1', 'L-2'])
    expect(r.drafts[0].scenario.km_per_day).toBe(201)
    expect(r.drafts[1].scenario.km_per_day).toBe(151)
    expect(r.drafts[1].scenario.charge_start_hour).toBe(23.5)
    expect(r.drafts[0].depot).toBe('Depot A')
    expect(r.drafts[0].inServiceMonth).toBe('2023-07')
    expect(r.drafts[0].sources?.duty).toBe('log')
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0].id).toBe('L-3')
    expect(r.rejected[0].reason).toContain('distance')
  })

  it('treats a roster with one row per bus as a roster even if it has a date column', () => {
    expect(readTable('bus_id,date,km\nB-1,2026-09-01,200\nB-2,2026-09-01,190', ctx).kind).toBe('roster')
  })
})

describe('add buses by hand', () => {
  const spec = { count: 40, prefix: 'B-', start: 201, depot: 'Depot A', route: 'Route 3', inService: '2025-04', scenario: screen, source: 'assumed' as const }

  it('makes consecutive ids and one shared duty, so forty buses become one class', () => {
    const { drafts, errors } = makeBatch(spec, [], NOW)
    expect(errors).toEqual([])
    expect(drafts).toHaveLength(40)
    expect(drafts[0].id).toBe('B-201')
    expect(drafts[39].id).toBe('B-240')
    expect(classify(drafts).classes).toHaveLength(1)
  })

  it('catches duplicate ids before commit, and bad counts, months and duty', () => {
    expect(makeBatch(spec, ['B-205', 'B-206'], NOW).errors[0]).toContain('2 ids are already in the fleet')
    expect(makeBatch({ ...spec, count: 0 }, [], NOW).errors[0]).toContain('1 to 500')
    expect(makeBatch({ ...spec, count: 501 }, [], NOW).errors[0]).toContain('1 to 500')
    expect(makeBatch({ ...spec, inService: '2027-01' }, [], NOW).errors[0]).toContain('future')
    expect(makeBatch({ ...spec, scenario: { ...screen, km_per_day: -1 } }, [], NOW).errors[0]).toContain('duty is not valid')
    expect(makeBatch({ ...spec, count: 1 }, [], NOW).drafts).toHaveLength(1)
  })
})

describe('the gate: merging into a fleet', () => {
  const rows = (...r: string[]) => readTable([H, ...r].join('\n'), ctx)

  it('builds a new fleet from drafts', () => {
    const plan = mergeFleet(null, rows('B-1,2023-07,A,R1,12m,200,,', 'B-2,2023-07,A,R1,12m,200,,').drafts, { mode: 'add', nowMs: NOW })
    expect(plan.ok).toBe(true)
    expect(plan).toMatchObject({ added: 2, updated: 0, kept: 0 })
    expect(plan.fleet!.kind).toBe('user')
    expect(plan.fleet!.classes).toHaveLength(1)
  })

  it('re-importing matches on id: new buses are added, listed buses updated, unlisted buses kept', () => {
    const f = userFleet()
    const plan = mergeFleet(f, rows('B-1,2024-01,A,R1,12m,200,,', 'B-9,2024-01,A,R1,12m,200,,').drafts, { mode: 'add', nowMs: NOW })
    expect(plan).toMatchObject({ added: 1, updated: 1, kept: 2 })
    const by = Object.fromEntries(plan.fleet!.buses.map((b) => [b.id, b]))
    expect(by['B-1'].inServiceMonth).toBe('2024-01')
    expect(by['B-2'].inServiceMonth).toBe('2023-07')
    expect(Object.keys(by).sort()).toEqual(['B-1', 'B-2', 'B-3', 'B-9'])
  })

  it('does not erase anything by leaving it out of the file', () => {
    const f = userFleet()
    const before = f.buses.find((b) => b.id === 'B-3')!
    const draft = readTable('bus_id\nB-3', ctx).drafts
    const plan = mergeFleet(f, draft, { mode: 'add', nowMs: NOW })
    const after = plan.fleet!.buses.find((b) => b.id === 'B-3')!
    expect(after.depot).toBe(before.depot)
    expect(after.route).toBe(before.route)
    expect(after.inServiceMonth).toBe(before.inServiceMonth)
    expect(after.classId).toBe(before.classId)
    expect(plan.fleet!.classes.find((c) => c.id === after.classId)!.scenario.km_per_day).toBe(160)
  })

  it('a bus type column alone does not reset duty; moving a bus to the other type does', () => {
    const f = userFleet()
    const same = mergeFleet(f, readTable('bus_id,bus_type\nB-3,12m', ctx).drafts, { mode: 'add', nowMs: NOW })
    const b3 = same.fleet!.buses.find((b) => b.id === 'B-3')!
    expect(same.fleet!.classes.find((c) => c.id === b3.classId)!.scenario.km_per_day).toBe(160)
    const moved = mergeFleet(f, readTable('bus_id,bus_type\nB-3,9m', ctx).drafts, { mode: 'add', nowMs: NOW })
    const m3 = moved.fleet!.buses.find((b) => b.id === 'B-3')!
    expect(moved.fleet!.classes.find((c) => c.id === m3.classId)!.scenario.archetype).toBe('9m')
  })

  it('a changed duty moves the bus to another class and drops a class that is left empty', () => {
    const f = userFleet()
    const plan = mergeFleet(f, rows('B-3,2023-07,B,R2,12m,260,,').drafts, { mode: 'add', nowMs: NOW })
    expect(plan.fleet!.classes).toHaveLength(2)
    expect(plan.fleet!.classes.some((c) => c.scenario.km_per_day === 160)).toBe(false)
    expect(plan.fleet!.buses.find((b) => b.id === 'B-3')!.sources.duty).toBe('entered')
  })

  it('replace mode starts again; a sample fleet is replaced, never mixed with real buses', () => {
    const f = userFleet()
    const r = mergeFleet(f, rows('N-1,2023-07,A,R1,12m,200,,').drafts, { mode: 'replace', nowMs: NOW })
    expect(r.fleet!.buses.map((b) => b.id)).toEqual(['N-1'])
    expect(r.replaced).toBe(3)
    const sample = sampleFleet(P, new Date(NOW))
    const onSample = mergeFleet(sample, rows('N-1,2023-07,A,R1,12m,200,,').drafts, { mode: 'add', nowMs: NOW })
    expect(onSample.fleet!.kind).toBe('user')
    expect(onSample.fleet!.buses).toHaveLength(1)
    expect(onSample.replaced).toBe(60)
  })

  it('never lets a class spread shrink: a re-merge keeps the larger bound', () => {
    const step = TOLERANCE.step.km_per_day
    const spread = (km: number[]) => mergeFleet(null, km.map((k, i) => ({ id: `S-${i}`, inServiceMonth: '2023-07', scenario: { ...screen, km_per_day: k } })), { mode: 'add', nowMs: NOW }).fleet!
    const f = spread([200, 200 + step * 0.4])
    const c0 = f.classes[0].spreadMonths
    expect(c0).toBeGreaterThan(0)
    const again = mergeFleet(f, [{ id: 'S-new', inServiceMonth: '2023-07', scenario: { ...screen, km_per_day: 200 + step * 0.2 } }], { mode: 'add', nowMs: NOW })
    expect(again.fleet!.classes.every((c) => c.spreadMonths >= c0 - 1e-9)).toBe(true)
  })

  it('merges classes again when old and new together need more than the class limit, and carries the spread', () => {
    const mk = (tag: string, first: number): DraftBus[] => Array.from({ length: 40 }, (_, i) => ({ id: `${tag}-${i}`, inServiceMonth: '2023-07', scenario: { ...screen, km_per_day: first + i * 4 } }))
    const f = mergeFleet(null, mk('a', 60), { mode: 'add', nowMs: NOW }).fleet!
    expect(f.classes.length).toBe(40)
    const plan = mergeFleet(f, mk('b', 62), { mode: 'add', nowMs: NOW })
    expect(plan.ok).toBe(true)
    expect(plan.multiplier).toBeGreaterThan(1)
    expect(plan.fleet!.classes.length).toBeLessThanOrEqual(MAX_CLASSES)
    expect(plan.fleet!.buses).toHaveLength(80)
    expect(new Set(plan.fleet!.buses.map((b) => b.classId)).size).toBe(plan.fleet!.classes.length)
  })

  it('refuses more than 5000 buses and says so', () => {
    const many: DraftBus[] = Array.from({ length: 5001 }, (_, i) => ({ id: `Z-${i}`, scenario: screen }))
    const plan = mergeFleet(null, many, { mode: 'add', nowMs: NOW })
    expect(plan.ok).toBe(false)
    expect(plan.message).toContain('5000')
  })

  it('every bus names a class that exists, and class sizes add up to the fleet', () => {
    const plan = mergeFleet(userFleet(), rows('B-1,2023-07,A,R1,12m,230,,', 'Q-1,2023-07,A,R1,9m,150,,').drafts, { mode: 'add', nowMs: NOW })
    const ids = new Set(plan.fleet!.classes.map((c) => c.id))
    expect(plan.fleet!.buses.every((b) => ids.has(b.classId))).toBe(true)
    expect(plan.fleet!.classes.every((c) => plan.fleet!.buses.some((b) => b.classId === c.id))).toBe(true)
  })
})

describe('editing buses in the fleet', () => {
  it('changes depot, route and in-service month in place without touching classes', () => {
    const f = userFleet()
    const r = editBuses(f, ['B-1', 'B-2'], { depot: 'Depot Z', inServiceMonth: '2024-05' }, NOW)
    expect(r.ok).toBe(true)
    expect(r.fleet.classes).toEqual(f.classes)
    expect(r.fleet.buses.filter((b) => b.depot === 'Depot Z').map((b) => b.id)).toEqual(['B-1', 'B-2'])
    expect(r.fleet.buses.find((b) => b.id === 'B-1')!.sources.depot).toBe('entered')
    expect(r.fleet.buses.find((b) => b.id === 'B-3')!.depot).toBe('Depot B')
  })

  it('a duty change re-classes only the edited buses and keeps the other classes and the order', () => {
    const f = userFleet()
    const other = f.classes.find((c) => c.scenario.km_per_day === 160)!
    const r = editBuses(f, ['B-1'], { duty: { scenario: { ...screen, km_per_day: 240 }, source: 'entered' } }, NOW)
    expect(r.ok).toBe(true)
    expect(r.fleet.buses.map((b) => b.id)).toEqual(f.buses.map((b) => b.id))
    expect(r.fleet.classes.find((c) => c.id === other.id)).toEqual(other)
    expect(r.fleet.buses.find((b) => b.id === 'B-1')!.classId).not.toBe(f.buses.find((b) => b.id === 'B-2')!.classId)
    expect(r.fleet.buses.find((b) => b.id === 'B-1')!.sources.duty).toBe('entered')
    expect(r.fleet.classes).toHaveLength(3)
  })

  it('rejects an invalid month or duty and leaves the fleet as it was', () => {
    const f = userFleet()
    expect(editBuses(f, ['B-1'], { inServiceMonth: '2031-01' }, NOW)).toMatchObject({ ok: false, fleet: f })
    expect(editBuses(f, ['B-1'], { duty: { scenario: { ...screen, km_per_day: -1 }, source: 'entered' } }, NOW)).toMatchObject({ ok: false, fleet: f })
  })

  it('a sample fleet stays a sample when edited', () => {
    const s = sampleFleet(P, new Date(NOW))
    const r = editBuses(s, [s.buses[0].id], { duty: { scenario: { ...screen, km_per_day: 123 }, source: 'entered' } }, NOW)
    expect(r.ok).toBe(true)
    expect(r.fleet.kind).toBe('sample')
    expect(r.fleet.buses).toHaveLength(60)
  })
})

describe('files out and round trips', () => {
  it('a roster CSV exported from a fleet imports back to the same buses and classes', () => {
    const f = sampleFleet(P, new Date(NOW))
    const back = readTable(rosterCsv(f), ctx)
    expect(back.rejected).toEqual([])
    expect(back.drafts).toHaveLength(f.buses.length)
    const plan = mergeFleet(null, back.drafts, { mode: 'add', nowMs: NOW, source: 'sample' })
    const key = (x: Fleet) => x.buses.map((b) => `${b.id}|${b.depot}|${b.route}|${b.inServiceMonth}|${x.classes.find((c) => c.id === b.classId)!.scenario.km_per_day}`)
    expect(key(plan.fleet!)).toEqual(key(f))
    expect(plan.fleet!.classes.map((c) => c.id).sort()).toEqual(f.classes.map((c) => c.id).sort())
  })

  it('buses that differ only in zone, pack size, heat or battery price stay in separate classes through a roster CSV', () => {
    const mk = (id: string, over: Partial<Scenario>): DraftBus => ({ id, depot: 'A', route: 'R', inServiceMonth: '2023-07', scenario: { ...screen, ...over }, sources: { duty: 'entered' } })
    const f = mergeFleet(null, [mk('Z-1', {}), mk('Z-2', { zone: 'cool' }), mk('Z-3', { pack_kwh: screen.pack_kwh + 40 }), mk('Z-4', { heat_rise_c: screen.heat_rise_c + 3 }), mk('Z-5', { battery_cost_per_kwh_inr: 9000 })], { mode: 'add', nowMs: NOW }).fleet!
    expect(f.classes).toHaveLength(5)
    const back = mergeFleet(null, readTable(rosterCsv(f), ctx).drafts, { mode: 'add', nowMs: NOW }).fleet!
    expect(back.classes.map((c) => c.id).sort()).toEqual(f.classes.map((c) => c.id).sort())
    const z = (x: Fleet, id: string) => x.classes.find((c) => c.id === x.buses.find((b) => b.id === id)!.classId)!.scenario
    expect(z(back, 'Z-2').zone).toBe('cool')
    expect(z(back, 'Z-3').pack_kwh).toBe(screen.pack_kwh + 40)
    expect(z(back, 'Z-5').battery_cost_per_kwh_inr).toBe(9000)
  })

  it('what a roster CSV does not carry (threshold, tariff, charger efficiency, cell range) comes from the bus on screen; the fleet file keeps it', () => {
    const f = mergeFleet(null, [{ id: 'T-1', inServiceMonth: '2023-07', scenario: { ...screen, threshold: 0.7, electricity_tariff: 'msedcl_ht_ix', charger_efficiency: 0.9 }, sources: { duty: 'entered' } }], { mode: 'add', nowMs: NOW }).fleet!
    const back = mergeFleet(null, readTable(rosterCsv(f), ctx).drafts, { mode: 'add', nowMs: NOW }).fleet!.classes[0].scenario
    expect(back.threshold).toBe(screen.threshold)
    expect(back.electricity_tariff).toBe(screen.electricity_tariff)
    const file = parseFleet(serializeFleet(f)).fleet!
    expect(file.classes[0].scenario.threshold).toBe(0.7)
    expect(file.classes[0].scenario.electricity_tariff).toBe('msedcl_ht_ix')
  })

  it('a time that is not on a whole minute is exported as a decimal hour, so a re-import cannot move the bus to another class', () => {
    const f = mergeFleet(null, [{ id: 'C-1', inServiceMonth: '2023-07', scenario: { ...screen, charge_start_hour: 22.2 + 1 / 300 }, sources: { duty: 'entered' } }], { mode: 'add', nowMs: NOW }).fleet!
    const back = readTable(rosterCsv(f), ctx).drafts[0].scenario.charge_start_hour
    expect(back).toBeCloseTo(22.2 + 1 / 300, 9)
  })

  it('a roster that names only a zone changes the zone and keeps the bus\'s other duty', () => {
    const f = userFleet()
    const plan = mergeFleet(f, readTable('bus_id,zone\nB-3,cool', ctx).drafts, { mode: 'add', nowMs: NOW })
    const b3 = plan.fleet!.buses.find((b) => b.id === 'B-3')!
    const sc = plan.fleet!.classes.find((c) => c.id === b3.classId)!.scenario
    expect(sc.zone).toBe('cool')
    expect(sc.km_per_day).toBe(160)
  })

  it('unassigned depot and route are exported blank and come back unassigned', () => {
    const plan = mergeFleet(null, [{ id: 'U-1', scenario: screen }], { mode: 'add', nowMs: NOW })
    expect(plan.fleet!.buses[0].depot).toBe(UNASSIGNED)
    const back = readTable(rosterCsv(plan.fleet!), ctx)
    expect(back.drafts[0].depot).toBeUndefined()
    expect(mergeFleet(null, back.drafts, { mode: 'add', nowMs: NOW }).fleet!.buses[0].depot).toBe(UNASSIGNED)
  })

  it('the templates parse cleanly with their own example rows', () => {
    const r = readTable(rosterTemplate(), ctx)
    expect(r.rejected).toEqual([])
    expect(r.drafts).toHaveLength(3)
    const l = readTable(logTemplate(), ctx)
    expect(l.kind).toBe('log')
    expect(l.drafts).toHaveLength(1)
  })

  it('the rejected-rows file carries the row number, reason and the original cells', () => {
    const r = readTable([H, 'B-1,2023-07,A,R1,12m,,,', 'B-2,bad,A,R1,12m,,,'].join('\n'), ctx)
    const csv = rejectedCsv(r.header, r.rejected)
    const lines = csv.trim().split('\n')
    expect(lines[0].startsWith('data_row,reason,bus_id')).toBe(true)
    expect(lines[1]).toContain('B-2')
    expect(lines[1].startsWith('2,')).toBe(true)
  })
})
