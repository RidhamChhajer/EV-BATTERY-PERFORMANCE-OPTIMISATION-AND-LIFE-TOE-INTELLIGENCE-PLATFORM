import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setToken } from '../api/client'
import type { PresetResult } from '../api/types'
import { FIX, mockApi, renderApp } from '../test/utils'

afterEach(() => { vi.unstubAllGlobals(); setToken(null) })
const presets = FIX.recommend.presets as unknown as PresetResult[]
const byId = (id: string) => presets.find((p) => p.id === id)!

describe('Overview (3D)', () => {
  it('shows the key numbers from the API and shows no status chips', async () => {
    mockApi(); renderApp('/')
    expect(await screen.findByText('Replace around')).toBeInTheDocument()
    expect(screen.getByText('Range on a full charge')).toBeInTheDocument()
    expect(screen.queryByLabelText('Model status')).not.toBeInTheDocument()
  })
  it('falls back to a plain card when WebGL is not available, and says the numbers are still shown', async () => {
    mockApi(); renderApp('/')
    expect(await screen.findByText('3D view is not available here')).toBeInTheDocument()
    expect(screen.getByText(/Every number on this page is still shown/)).toBeInTheDocument()
  })
})

const open = async (name: string) => { await userEvent.click(await screen.findByRole('button', { name })); return screen.findByRole('complementary', { name: new RegExp(name === 'Goals' ? 'Pick a goal' : name === 'Bus B' ? 'Bus B' : name) }) }
const goals = () => open('Goals')

describe('Optimise (compare two buses)', () => {
  it('shows only the stat strip and the dock until a panel is opened', async () => {
    mockApi(); renderApp('/optimise')
    expect(await screen.findByText('Range at replacement')).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    for (const n of ['Bus A', 'Bus B', 'Goals', 'Details', 'View']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument()
  })
  it('shows the route check sentence exactly as the API wrote it, in the goals panel', async () => {
    mockApi(); renderApp('/optimise')
    const g = await goals()
    expect(await within(g).findByText(FIX.recommend.feasibility.plain)).toBeInTheDocument()
  })
  it('lists every goal and points repeated advice back to the first one', async () => {
    mockApi(); renderApp('/optimise')
    const g = await goals()
    expect(await within(g).findByRole('heading', { name: 'Keep full range', level: 3 })).toBeInTheDocument()
    for (const t of ['Balanced', 'Lowest cost per km', 'Longest battery life', 'Hot-climate protection']) expect(within(g).getAllByRole('heading', { name: t, level: 3 }).length).toBe(1)
    expect(within(g).getAllByText(/found the same best option as/).length).toBeGreaterThan(0)
  })
  it('starts with Bus B equal to Bus A and does not call /compare until something changes', async () => {
    const api = mockApi(); renderApp('/optimise')
    const b = await open('Bus B')
    expect(within(b).getByRole('button', { name: 'Same as Bus A' })).toBeDisabled()
    expect(screen.getAllByText('Change Bus B to compare').length).toBeGreaterThan(0)
    expect(api.calls.some((c) => c.path === '/compare')).toBe(false)
  })
  it('adopting a goal sets Bus B to that goal, closes the panel and runs the paired comparison on it', async () => {
    const api = mockApi(); renderApp('/optimise')
    const g = await goals()
    const card = (await within(g).findByRole('heading', { name: 'Lowest cost per km', level: 3 })).closest('article')!
    await userEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Try on Bus B' }))
    const want = byId('lowest_cost').charging.scenario
    await waitFor(() => expect(api.calls.some((c) => c.path === '/compare')).toBe(true), { timeout: 3000 })
    const body = api.calls.find((c) => c.path === '/compare')!.body as { scenarios: { soc_max_pct: number; charge_start_hour: number }[] }
    expect(body.scenarios).toHaveLength(2)
    expect(body.scenarios[0].soc_max_pct).toBe(FIX.predict.scenario.soc_max_pct)
    expect(body.scenarios[1].soc_max_pct).toBe(want.soc_max_pct)
    expect(body.scenarios[1].charge_start_hour).toBe(want.charge_start_hour)
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument())
    const g2 = await goals()
    const card2 = (await within(g2).findByRole('heading', { name: 'Lowest cost per km', level: 3 })).closest('article')! as HTMLElement
    expect(within(card2).getByText('Shown on Bus B', { selector: '.tag' })).toBeInTheDocument()
  })
  it('shows what changed on Bus B, marks both replacement years, and lets you switch the colouring', async () => {
    mockApi(); renderApp('/optimise')
    const g = await goals()
    const card = (await within(g).findByRole('heading', { name: 'Lowest cost per km', level: 3 })).closest('article')!
    await userEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Try on Bus B' }))
    const bar = await screen.findByLabelText('What you changed on Bus B', {}, { timeout: 4000 })
    expect(within(bar).getAllByText(/→/).length).toBeGreaterThan(0)
    expect(await screen.findByTitle(/Bus A reaches the replacement line/)).toBeInTheDocument()
    expect(await screen.findByTitle(/Bus B reaches the replacement line/)).toBeInTheDocument()
    const diff = screen.getByRole('button', { name: 'Difference' }), health = screen.getByRole('button', { name: 'Health' })
    expect(diff).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(health)
    expect(health).toHaveAttribute('aria-pressed', 'true'); expect(diff).toHaveAttribute('aria-pressed', 'false')
  })
  it('only shows cooling and energy-use changes after the user allows them', async () => {
    mockApi(); renderApp('/optimise')
    const g = await goals()
    await within(g).findByRole('heading', { name: 'Keep full range', level: 3 })
    expect(within(g).queryByText(/needs your confirmation/)).not.toBeInTheDocument()
    await userEvent.click(within(g).getByRole('checkbox', { name: /Include changes that need your confirmation/ }))
    expect((await within(g).findAllByText('needs your confirmation')).length).toBeGreaterThan(0)
    expect(within(g).getByText(byId('max_range').with_confirmation!.summary)).toBeInTheDocument()
  })
  it('re-applies the chosen goal when cooling and energy-use changes are allowed afterwards', async () => {
    const api = mockApi(); renderApp('/optimise')
    const g = await goals()
    const card = (await within(g).findByRole('heading', { name: 'Keep full range', level: 3 })).closest('article')! as HTMLElement
    await userEvent.click(within(card).getByRole('button', { name: 'Try on Bus B' }))
    const g2 = await goals()
    await userEvent.click(within(g2).getByRole('checkbox', { name: /Include changes that need your confirmation/ }))
    const want = byId('max_range').with_confirmation!.scenario
    await waitFor(() => {
      const last = [...api.calls].reverse().find((c) => c.path === '/compare')!.body as { scenarios: { heat_rise_c: number; kwh_per_km: number }[] }
      expect(last.scenarios[1].heat_rise_c).toBe(want.heat_rise_c)
      expect(last.scenarios[1].kwh_per_km).toBeCloseTo(want.kwh_per_km as number, 6)
    }, { timeout: 3000 })
    const card2 = within(g2).getByRole('heading', { name: 'Keep full range', level: 3 }).closest('article')! as HTMLElement
    expect(within(card2).getByText('Shown on Bus B', { selector: '.tag' })).toBeInTheDocument()
  })
  it('explains the levers that were deliberately left alone, in the details panel', async () => {
    mockApi(); renderApp('/optimise')
    const d = await open('Details')
    expect(await within(d).findByText('What we did not change, and why')).toBeInTheDocument()
    expect(within(d).getByText(/never suggested/)).toBeInTheDocument()
  })
  it('keeps Bus A and the sliders usable when the goal search fails', async () => {
    mockApi({ '/recommend': () => ({ status: 500, body: { error: { code: 'internal_error', message: 'Something went wrong.', fields: [] } } }) })
    renderApp('/optimise')
    expect(await screen.findByText('Health, year 4.0')).toBeInTheDocument()
    const b = await open('Bus B')
    expect(within(b).getByRole('button', { name: 'Same as Bus A' })).toBeInTheDocument()
    const g = await goals()
    expect(await within(g).findByRole('alert')).toBeInTheDocument()
  })
})

describe('Optimise report (PDF and email)', () => {
  const OK = { '/report/status': () => ({ body: { email_enabled: true } }), '/report/pdf': () => ({ body: { pdf: true } }), '/report/email': () => ({ body: { sent: true, to: 'b***@company.com' } }) }
  const openReport = async () => { await userEvent.click(await screen.findByRole('button', { name: 'Report' })); return screen.findByRole('complementary', { name: /Send report/ }) }
  const changeB = async () => {
    const g = await goals()
    const card = (await within(g).findByRole('heading', { name: 'Lowest cost per km', level: 3 })).closest('article')!
    await userEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Try on Bus B' }))
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument())
  }

  it('cannot be sent until Bus B differs from Bus A', async () => {
    mockApi(OK); renderApp('/optimise')
    const r = await openReport()
    expect(within(r).getByText(/Change Bus B first/)).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: 'Download PDF' })).toBeDisabled()
    await userEvent.type(within(r).getByLabelText('Send to'), 'boss@company.com')
    expect(within(r).getByRole('button', { name: 'Send report' })).toBeDisabled()
  })

  it('downloads the PDF for the two buses and emails it to one valid address', async () => {
    const make = vi.fn(() => 'blob:x'); vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: make, revokeObjectURL: vi.fn() }))
    const api = mockApi(OK); renderApp('/optimise')
    await changeB()
    const r = await openReport()
    expect(within(r).getByText(/Bus B changes in this report/)).toBeInTheDocument()
    await userEvent.click(within(r).getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(make).toHaveBeenCalled())
    const pdf = api.calls.find((c) => c.path === '/report/pdf')!.body as { scenario_a: { soc_max_pct: number }; scenario_b: { soc_max_pct: number }; fleet_size: number }
    expect(pdf.scenario_a.soc_max_pct).toBe(FIX.predict.scenario.soc_max_pct)
    expect(pdf.scenario_b.soc_max_pct).toBe(byId('lowest_cost').charging.scenario.soc_max_pct)
    expect(pdf.fleet_size).toBe(50)

    const box = within(r).getByLabelText('Send to'), send = within(r).getByRole('button', { name: 'Send report' })
    await userEvent.type(box, 'not an address')
    expect(send).toBeDisabled(); expect(box).toHaveAttribute('aria-invalid', 'true')
    await userEvent.clear(box); await userEvent.type(box, 'boss@company.com')
    expect(box).toHaveAttribute('aria-invalid', 'false'); expect(send).toBeEnabled()
    await userEvent.click(send)
    expect(await within(r).findByRole('status')).toHaveTextContent('Report sent to b***@company.com.')
    expect((api.calls.find((c) => c.path === '/report/email')!.body as { to: string }).to).toBe('boss@company.com')
  })

  it('says so plainly when the server has no email set up, and still offers the download', async () => {
    mockApi({ ...OK, '/report/status': () => ({ body: { email_enabled: false } }) }); renderApp('/optimise')
    const r = await openReport()
    expect(await within(r).findByText(/Email is not set up on this server/)).toBeInTheDocument()
    expect(within(r).queryByLabelText('Send to')).not.toBeInTheDocument()
    expect(within(r).getByRole('button', { name: 'Download PDF' })).toBeInTheDocument()
  })

  it('shows the server\'s own message when sending fails', async () => {
    mockApi({ ...OK, '/report/email': () => ({ status: 429, body: { error: { code: 'too_many_reports', message: 'Too many reports sent in the last hour.', fields: [] } } }) }); renderApp('/optimise')
    await changeB()
    const r = await openReport()
    await userEvent.type(await within(r).findByLabelText('Send to'), 'boss@company.com')
    await userEvent.click(within(r).getByRole('button', { name: 'Send report' }))
    expect(await within(r).findByRole('alert')).toHaveTextContent('Too many reports sent in the last hour.')
  })
})

describe('Lenses and notes', () => {
  it('Overview offers four lenses, swaps the year bar for the day bar in Charge, and keeps warnings out of the scene', async () => {
    mockApi(); renderApp('/')
    const lens = await screen.findByRole('group', { name: 'What the 3D view shows' })
    for (const n of ['Ageing', 'Charge', 'Heat', 'Range']) expect(within(lens).getByRole('button', { name: n })).toBeInTheDocument()
    expect(screen.getByLabelText('Years in service')).toBeInTheDocument()
    await userEvent.click(within(lens).getByRole('button', { name: 'Charge' }))
    expect(await screen.findByLabelText('Hour of the day')).toBeInTheDocument()
    expect(screen.queryByLabelText('Years in service')).not.toBeInTheDocument()
    await userEvent.click(within(lens).getByRole('button', { name: 'Heat' }))
    expect(screen.queryByLabelText('Hour of the day')).not.toBeInTheDocument()
    expect(document.querySelector('.errbox')).toBeNull()
  })
  it('keeps import, reset and copy link in one toolbar at the top of the scenario drawer, with the CSV panel folded away until asked for', async () => {
    mockApi(); renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Bus A' }))
    const bar = await screen.findByRole('toolbar', { name: 'Scenario actions' })
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Import CSV', 'Reset', 'Copy link'])
    expect(screen.queryByText(/never uploaded/)).not.toBeInTheDocument()
    await userEvent.click(within(bar).getByRole('button', { name: 'Import CSV' }))
    expect(within(bar).getByRole('button', { name: 'Import CSV' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/never uploaded/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download a sample' })).toHaveAttribute('href', '/samples/sample-fleet-duty-ILLUSTRATIVE.csv')
    expect(screen.getAllByRole('button', { name: 'Reset to defaults' })).toHaveLength(1)
  })
  it('Notes drawer groups the warnings', async () => {
    mockApi(); renderApp('/optimise')
    const btn = await screen.findByRole('button', { name: /^Notes/ })
    await userEvent.click(btn)
    expect(await screen.findByText('Good to know')).toBeInTheDocument()
  })
})
