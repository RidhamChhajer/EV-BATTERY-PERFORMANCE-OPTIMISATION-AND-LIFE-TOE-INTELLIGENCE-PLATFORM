import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setToken } from '../api/client'
import { FIX, mockApi, renderApp } from '../test/utils'

afterEach(() => { vi.unstubAllGlobals(); setToken(null) })

describe('Evidence: what vendor data would change', () => {
  it('shows the calibration demo numbers from the API, with the not-LFP caveat', async () => {
    mockApi(); renderApp('/evidence')
    const h = await screen.findByRole('heading', { name: 'What vendor data would change' })
    const card = h.closest('.card') as HTMLElement
    const cd = FIX.evidence.metrics.calibration_demo
    const rs = cd.with_snippet_features.results
    const r0 = rs[0], r5 = rs.find((r: { n_labels: number }) => r.n_labels === 5)!
    expect(within(card).getByText(`${r0.prior_mape.toFixed(2)}% to ${r5.partial_pooling_mape.toFixed(2)}%`, { exact: false })).toBeInTheDocument()
    expect(within(card).getAllByText(/not a result for LFP buses/).length).toBeGreaterThan(0)
    expect(within(card).getAllByRole('row')).toHaveLength(rs.length + 1)
  })
})

describe('Evidence: the NREL reference models', () => {
  const r = FIX.evidence.reference_engine

  it('says the range is a spread of runs, not a confidence interval, and shows both models', async () => {
    mockApi(); renderApp('/evidence')
    const h = await screen.findByRole('heading', { name: 'The ageing models behind every number' })
    const card = h.closest('.card') as HTMLElement
    expect(within(card).getByText(new RegExp(`range from ${r.ensemble.runs_per_scenario} runs`))).toBeInTheDocument()
    expect(within(card).getByText(/not a statistical confidence interval/)).toBeInTheDocument()
    for (const m of r.models) expect(within(card).getByRole('heading', { name: m.label })).toBeInTheDocument()
    expect(within(card).getByText(/Not validated on buses/)).toBeInTheDocument()
  })

  it('reports how closely the port matches the package, from the API', async () => {
    mockApi(); renderApp('/evidence')
    const h = await screen.findByRole('heading', { name: 'How closely this tool reproduces the original package' })
    const card = h.closest('.card') as HTMLElement
    expect(within(card).getByText(`largest gap ${r.port_check.bus_duty_max_diff_points.toFixed(2)} points of capacity`)).toBeInTheDocument()
  })

  it('no longer shows our own lab model or the old cross-check', async () => {
    mockApi(); renderApp('/evidence')
    await screen.findByRole('heading', { name: 'The ageing models behind every number' })
    expect(screen.queryByText(/Cross-check against NREL/)).toBeNull()
    expect(screen.queryByText(/HUST/)).toBeNull()
    expect(screen.queryByText(/How accurate is it/)).toBeNull()
  })

  it('lists the known limits, matching the number of tags', async () => {
    mockApi(); renderApp('/evidence')
    const h = await screen.findByRole('heading', { name: 'Known limits' })
    const card = h.closest('.card') as HTMLElement
    expect(within(card).getAllByText(/^0\d · /)).toHaveLength(FIX.evidence.limitations.length)
    expect(within(card).queryByText(/· Limit$/)).toBeNull()
  })
})
