import { describe, expect, it } from 'vitest'
import { budgetCsv, forecastCsv } from './exports'
import type { Series } from './forecast'

const s: Series = { labels: ['FY2026-27', 'FY2027-28'], edges: [0, 5, 17], buses: [0.4, 3], spend: [200000, 1500000], spendP10: [0, 900000], spendP90: [400000, 2100000], busesP10: [0, 1], busesP90: [1, 5], beyond: 0 }

describe('exports', () => {
  it('budget csv has a row per year, a running total and no band on it', () => {
    const lines = budgetCsv(s).trim().split('\n')
    expect(lines[1]).toContain('running_total_inr_no_band')
    expect(lines).toHaveLength(4)
    expect(lines[3].split(',').pop()).toBe('1700000')
    expect(lines[0]).toMatch(/not yet validated/i)
  })
  it('budget csv without a price has bus columns only', () => {
    expect(budgetCsv({ ...s, spend: null, spendP10: null, spendP90: null }).split('\n')[1]).not.toContain('spend')
  })
  it('forecast csv defuses formulas and quotes commas', () => {
    const row = { bus: { id: '=cmd', depot: 'North, A', route: 'Unassigned', inServiceMonth: '2024-01', classId: 'c' }, cls: { name: 'City', scenario: { archetype: 'city_12m' } }, p10: 10, p50: 20.04, p90: 30, due12: 0.1234, flags: [], band: undefined } as never
    const out = forecastCsv([row], s, '2026-11-11')
    expect(out).toContain("'=cmd")
    expect(out).toContain('"North, A"')
    expect(out).toContain('20')
  })
})
