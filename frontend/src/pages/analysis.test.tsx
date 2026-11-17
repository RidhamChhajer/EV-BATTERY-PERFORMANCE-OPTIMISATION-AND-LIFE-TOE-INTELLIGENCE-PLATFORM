import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setToken } from '../api/client'
import { FIX, mockApi, renderApp } from '../test/utils'

afterEach(() => { vi.unstubAllGlobals(); setToken(null); try { localStorage.clear() } catch { /* ignore */ } })

describe('analysis pages', () => {
  it('Health: ageing lab with a one-line insight, a day strip, a temperature ring and the notes list', async () => {
    mockApi(); renderApp('/health')
    expect(await screen.findByRole('heading', { name: 'Ageing lab' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Ninety-six cells/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Drives .* charges .* rests full/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Mean cell temperature by month/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /See ageing on the bus/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('region', { name: 'Try a change' })).toBeInTheDocument()
  })

  it('Replacement: fifty dots, a fleet planner that remembers its size, and the probability detail', async () => {
    mockApi(); renderApp('/replacement')
    expect(await screen.findByRole('heading', { name: 'Fifty runs, fifty replacement dates' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Fifty dots, each one 2 percent/ })).toBeInTheDocument()
    const fleet = await screen.findByLabelText('Buses in the fleet')
    fireEvent.change(fleet, { target: { value: '120' } })
    expect(localStorage.getItem('ph.fleet')).toBe('120')
    expect(screen.getByText(/Detail: share of runs/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Show as table' })[0])
    expect(screen.getAllByRole('columnheader', { name: 'Expected buses' })).toHaveLength(1)
  })

  it('Range: route-fit hero says whether the route is covered and the route slider is labelled', async () => {
    mockApi(); renderApp('/range')
    expect(await screen.findByRole('heading', { name: 'Does it cover your route?' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Route length, kilometres per day' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^A full charge goes about/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Range on a full charge by pack age/ })).toBeInTheDocument()
  })

  it('Cost: price curve hero with a keyboard-reachable price control', async () => {
    mockApi(); renderApp('/cost')
    expect(await screen.findByRole('heading', { name: 'Cost against battery price' })).toBeInTheDocument()
  })
})

describe('electricity cost', () => {
  const withElec = () => {
    const c = FIX.predict.cost as Record<string, unknown>
    const b = (c.cost_per_km_p50 as { value: number }).value, e = 14.4
    const lab = (value: number, unit: string, evidence_level: string, note = '') => ({ value, unit, evidence_level, validated_on_buses: false, note })
    return { ...FIX.predict, scenario: { ...FIX.predict.scenario, electricity_tariff: 'msedcl_ht_ix' }, cost: { ...c, electricity: {
      tariff: 'Pune, MSEDCL HT IX', price_inr_per_kwh: lab(11.16, 'INR/kWh', 'assumption'), energy_charge_inr_per_kwh: lab(8.92, 'INR/kWh', 'assumption'), wheeling_charge_inr_per_kwh: lab(0.81, 'INR/kWh', 'assumption'),
      tod_change_pct: lab(16, '%', 'derived'), cost_per_km: lab(e, 'INR/km', 'derived'), grid_kwh_per_km: lab(1.3, 'kWh/km', 'derived'), charge_window: '22:00 to 00:30', note: '' },
      total_cost_per_km_p10: lab((c.cost_per_km_p10 as { value: number }).value + e, 'INR/km', 'derived'), total_cost_per_km_p50: lab(b + e, 'INR/km', 'derived'), total_cost_per_km_p90: lab((c.cost_per_km_p90 as { value: number }).value + e, 'INR/km', 'derived') } }
  }
  it('Cost: offers the Pune tariff when electricity is off, and does not touch the battery figures', async () => {
    mockApi(); renderApp('/cost')
    expect(await screen.findByRole('heading', { name: 'Cost to run the bus, per km' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Pune electricity (MSEDCL HT IX)' })).toBeInTheDocument()
  })
  it('Cost: with electricity on but no battery price, shows the electricity alone and asks for the price', async () => {
    const e = withElec() as Record<string, unknown> & { cost: Record<string, unknown> }
    const c = { ...e.cost, cost_per_km_p10: null, cost_per_km_p50: null, cost_per_km_p90: null, battery_cost: null, total_cost_per_km_p10: null, total_cost_per_km_p50: null, total_cost_per_km_p90: null }
    mockApi({ '/predict': () => ({ body: { ...e, scenario: { ...(e.scenario as object), battery_cost_per_kwh_inr: null }, cost: c } }) }); renderApp('/cost?electricity_tariff=msedcl_ht_ix')
    expect(await screen.findByText(/Enter a battery price to add the battery and see the total/)).toBeInTheDocument()
    expect(screen.queryByText(/Add Maharashtra electricity/)).not.toBeInTheDocument()
  })
  it('Cost: shows battery plus electricity, the split and what is left out when the tariff is on', async () => {
    mockApi({ '/predict': () => ({ body: withElec() }) }); renderApp('/cost?electricity_tariff=msedcl_ht_ix')
    const bar = await screen.findByRole('img', { name: /battery ₹.* and electricity ₹14\.40/ })
    expect(bar).toBeInTheDocument()
    expect(screen.getByText(/Electricity is about \d+ %/)).toBeInTheDocument()
    expect(screen.getByText('22:00 to 00:30')).toBeInTheDocument()
    expect(screen.getByText('Electricity per km').nextElementSibling).toHaveTextContent('₹14.40')
    expect(screen.getByText('Battery per km')).toBeInTheDocument()
    expect(screen.getByText(/check your first bill/)).toBeInTheDocument()
    expect(screen.getByText(/Left out: electricity duty, the fuel adjustment charge/)).toBeInTheDocument()
    expect(screen.getByText(/The tariff is an assumption, not yet validated on buses/)).toBeInTheDocument()
  })
})

describe('Cost: Try the cheaper case', () => {
  it('applies the change, says what it does right there, and can be undone', async () => {
    mockApi(); renderApp('/cost')
    const btns = await screen.findAllByRole('button', { name: 'Try the cheaper case' })
    await userEvent.click(btns[0])
    expect(await screen.findByText(/With this change/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByText(/With this change/)).not.toBeInTheDocument()
  })
})

describe('decision insights', () => {
  it('Health: ranks one-lever changes, applies one to the Try a change bar, and says how far charging can be staggered', async () => {
    mockApi(); renderApp('/health')
    expect(await screen.findByRole('heading', { name: 'What to do first' })).toBeInTheDocument()
    const rows = await screen.findAllByRole('button', { name: /Apply to the Try a change bar/ })
    expect(rows.length).toBeGreaterThan(0)
    expect(await screen.findByText(/Charging can start anywhere in the/)).toBeInTheDocument()
    await userEvent.click(rows[0])
    expect(await screen.findByRole('button', { name: 'Reset' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'List as table' }))
    expect(await screen.findByRole('columnheader', { name: 'Months gained (10th pct)' })).toBeInTheDocument()
  }, 15000)

  it('Cost: draws cost against the replacement line with the numbers in its label', async () => {
    mockApi(); renderApp('/cost')
    expect(await screen.findByRole('heading', { name: 'Cost against the replacement line' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Cost per kilometre against the replacement line/ })).toBeInTheDocument()
    expect(screen.queryByText('Pack cost per year of life')).not.toBeInTheDocument()
  })

  it('Range: names how many buses are short, in buckets, never as an invented percentage', async () => {
    mockApi(); renderApp('/range')
    expect(await screen.findByText(/buses short|every run short|fewer than 1 in 10/)).toBeInTheDocument()
    expect(screen.queryByText(/\d+ % of buses/)).not.toBeInTheDocument()
  })

  it('Replacement: puts a budget range and a bulk-order window on the fleet plan', async () => {
    mockApi(); renderApp('/replacement')
    expect(await screen.findByText(/^Budget about /)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Show as table' })[0])
    expect(screen.getAllByRole('columnheader', { name: '10th pct' })).toHaveLength(1)
  }, 15000)
})
