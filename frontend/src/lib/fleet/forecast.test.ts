import { describe, expect, it } from 'vitest'
import { FIX, fleetResponse } from '../../test/utils'
import { budgetHeadline, busPerYear, cumulative, leverFleetValue, moneyBy, peakPeriod, periodAt, seriesOf, stackBy, timelineOf, yearLabel, type Series } from './forecast'
import { buildRows, groupRows } from './segments'
import type { FleetForecast } from './types'

const real = FIX.fleet.response as unknown as FleetForecast
const S = seriesOf(real)

describe('series and financial years', () => {
  it('reads the real response: one more edge than labels, and the first period is the rest of this year', () => {
    expect(S.labels).toHaveLength(11)
    expect(S.edges).toHaveLength(12)
    expect(S.labels[0]).toBe('FY2026-27')
    expect(S.edges[1]).toBe(5)               // 11 Nov to 31 Mar
    expect(S.spend).toHaveLength(11)
  })
  it('places months in the right year at the boundaries, and after the last edge is “after”', () => {
    expect(periodAt(S.edges, 0)).toBe(0)
    expect(periodAt(S.edges, 4.99)).toBe(0)
    expect(periodAt(S.edges, 5)).toBe(1)
    expect(periodAt(S.edges, 124.9)).toBe(10)
    expect(periodAt(S.edges, 125)).toBeNull()
    expect(periodAt(S.edges, null)).toBeNull()
    expect(yearLabel(S, 17)).toBe('FY2028-29')
    expect(yearLabel(S, 300)).toBe('after FY2036-37')
    expect(yearLabel(S, null)).toBe('')
    expect(yearLabel(null, 10)).toBe('')
  })
  it('a running total adds the years and carries no band', () => {
    expect(cumulative([1, 2, 3])).toEqual([1, 3, 6])
  })
})

describe('the budget headline', () => {
  it('names the first full financial year, not the part-year, and says “up to” when the 10th percentile is zero', () => {
    const h = budgetHeadline(S)
    expect(h.index).toBe(1)
    expect(h.text).toContain('FY2027-28')
    expect(h.text).toMatch(/^Budget about ₹/)
    expect(S.spendP10![1]).toBe(0)
    expect(h.text).toContain('up to')
    expect(h.text).not.toMatch(/₹0/)
  })
  it('gives a range when both ends are above zero, and no band when there is none to give', () => {
    const wide: Series = { ...S, spend: [0, 5e6], spendP10: [0, 3e6], spendP90: [0, 7e6] }
    expect(budgetHeadline(wide).text).toMatch(/₹30\.0 lakh to ₹70\.0 lakh, 10th to 90th percentile/)
    const flat: Series = { ...S, spend: [0, 5e6], spendP10: [0, 5e6], spendP90: [0, 5e6] }
    expect(budgetHeadline(flat).text).toBe('Budget about ₹50.0 lakh in FY2027-28.')
  })
  it('says so when nothing is due, counts buses without a battery price, and refuses a one-period forecast', () => {
    expect(budgetHeadline({ ...S, spend: [0, 0], spendP10: [0, 0], spendP90: [0, 0] }).text).toMatch(/No bus is expected to reach the line in FY2027-28/)
    const bare = budgetHeadline({ ...S, spend: null, spendP10: null, spendP90: null, buses: [0, 3.2] }).text
    expect(bare).toMatch(/Expect about 3\.2 buses/)
    expect(bare).toMatch(/Set a battery price/)
    expect(budgetHeadline({ ...S, buses: [1] }).index).toBeNull()
  })
  it('finds the biggest year', () => {
    const p = peakPeriod(S)!
    expect(p.label).toBe('FY2034-35')
    expect(p.spend).toBeCloseTo(4152000, -2)
    expect(peakPeriod({ ...S, spend: null, buses: [0, 0, 2, 1] })!.index).toBe(2)
    expect(peakPeriod({ ...S, spend: [0, 0], buses: [0, 0] })).toBeNull()
  })
})

describe('the depot stack', () => {
  const req = (ids: number[], cls = 'A') => ({ as_of: '2026-11-11', classes: [{ id: cls }], buses: ids.map(() => ({ class_id: cls, in_service: '2020-01' })) })
  const part = (name: string, n: number) => ({ name, buses: n, series: seriesOf(fleetResponse(req(Array(n).fill(0))) as unknown as FleetForecast) })
  const total = seriesOf(fleetResponse(req(Array(30).fill(0))) as unknown as FleetForecast)
  it('adds up exactly to the whole fleet', () => {
    const st = stackBy([part('A', 10), part('B', 20)], total)
    expect(st.names).toEqual(['B', 'A'])        // largest first
    st.total.forEach((t, i) => expect(st.values.reduce((s, v) => s + v[i], 0)).toBeCloseTo(t, 4))
    expect(st.other).toBe(false)
  })
  it('folds depots beyond the cap into “Other”, computed as the total minus the ones shown, never negative', () => {
    const st = stackBy([part('A', 10), part('B', 8)], total, 2, true)
    expect(st.names).toEqual(['A', 'B', 'Other depots'])
    st.total.forEach((t, i) => expect(st.values.reduce((s, v) => s + v[i], 0)).toBeCloseTo(t, 4))
    expect(st.values[2].every((v) => v >= 0)).toBe(true)
    const over = stackBy([part('A', 30), part('B', 8)], seriesOf(fleetResponse(req(Array(10).fill(0))) as unknown as FleetForecast), 2, true)
    expect(over.values[2].every((v) => v === 0)).toBe(true)
  })
  it('keeps buses of unknown age apart, and the stack still adds up to the total', () => {
    const st = stackBy([part('A', 10), part('B', 8)], total, 5, true, part('x', 5).series)
    expect(st.names).toEqual(['A', 'B', 'Age unknown', 'Other depots'])
    expect(st.unknownIndex).toBe(2)
    st.total.forEach((t, i) => expect(st.values.reduce((s, v) => s + v[i], 0)).toBeCloseTo(t, 4))
    expect(stackBy([part('A', 10)], total).unknownIndex).toBeNull()
  })
  it('counts buses when there is no battery price', () => {
    const st = stackBy([part('A', 30)], { ...total, spend: null })
    expect(st.unit).toBe('buses')
  })
})

describe('the class by year timeline', () => {
  it('has one row per class, one cell per year, a scale, and the later column', () => {
    const t = timelineOf([{ id: 'A', name: 'Class A', n: 4, series: S }], S.labels)
    expect(t.rows[0].cells).toHaveLength(11)
    expect(t.max).toBeCloseTo(1.08, 6)
    expect(t.rows[0].beyond).toBeCloseTo(4.54, 6)
    expect(timelineOf([], S.labels).max).toBe(0)
  })
})

describe('where the battery money goes', () => {
  const fleet = {
    id: 'f', name: 'f', kind: 'user' as const, createdAt: '', classes: [{ id: 'A', name: 'Class A', source: 'entered' as const, spreadMonths: 0, scenario: {} as never }, { id: 'B', name: 'Class B', source: 'entered' as const, spreadMonths: 0, scenario: {} as never }],
    buses: ['1', '2', '3'].map((id, i) => ({ id, depot: i < 2 ? 'North' : 'South', route: 'R', inServiceMonth: '2020-01', classId: i < 2 ? 'A' : 'B', sources: {} })),
  }
  const f = fleetResponse({ as_of: '2026-11-11', classes: [{ id: 'A' }, { id: 'B' }], buses: fleet.buses.map((b) => ({ class_id: b.classId, in_service: b.inServiceMonth })) }) as unknown as FleetForecast
  it('is the cost per km times the km a year, per bus, and ranks the biggest group first', () => {
    const c = f.classes[0], per = busPerYear(c)!
    expect(per.perYear).toBeCloseTo(5.116291805137726 * 68000, 3)
    const rows = buildRows(fleet, f)
    const list = moneyBy(rows, groupRows(rows, 'depot', f.as_of).groups, f)
    expect(list.map((r) => r.label)).toEqual(['North', 'South'])   // two buses against one, same class figure
    expect(list[0].perYear).toBeCloseTo(2 * per.perYear, 3)
    expect(list[0].perKm).toBeCloseTo(5.116291805137726, 6)
  })
  it('shows no money for a group whose classes have no figure', () => {
    const none = { ...f, classes: f.classes.map((c) => ({ ...c, battery_cost_per_km_p50: null })) } as FleetForecast
    const rows = buildRows(fleet, none)
    expect(moneyBy(rows, groupRows(rows, 'depot', none.as_of).groups, none).every((r) => r.perYear == null && r.perKm == null)).toBe(true)
  })
})

describe('levers in fleet rupees', () => {
  const P = FIX.predict as never as Parameters<typeof leverFleetValue>[0]
  const alt = (d: number) => { const p = structuredClone(P); (p.replacement.months_p50 as { value: number }).value += d; return p }
  it('is the per-bus saving times the buses in the class, and empty until the alternative has arrived', () => {
    const v = leverFleetValue(P, alt(12), 20)
    expect(v.months).toBeCloseTo(12, 6)
    expect(v.perBus).not.toBeNull()
    expect(v.fleet).toBeCloseTo((v.perBus as number) * 20, 4)
    expect(leverFleetValue(P, undefined, 20)).toEqual({ perBus: null, fleet: null, months: null })
    expect(leverFleetValue(P, alt(-6), 10).fleet).toBeLessThan(0)
  })
})
