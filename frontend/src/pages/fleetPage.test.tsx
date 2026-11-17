import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setToken } from '../api/client'
import { mockApi, renderApp } from '../test/utils'

beforeEach(() => localStorage.clear())
afterEach(() => { vi.unstubAllGlobals(); setToken(null) })

const open = async () => { mockApi(); renderApp('/fleet'); await screen.findByRole('heading', { level: 1, name: 'Fleet' }) }
const toClasses = async () => { await userEvent.click(await screen.findByRole('button', { name: 'By duty class' })); return screen.findByRole('region', { name: 'When each duty class reaches the line' }) }
const gate = () => screen.getByRole('region', { name: /check this before|can’t be added/i })
const paste = async (text: string) => {
  await userEvent.click(await screen.findByRole('button', { name: /Paste from a spreadsheet/ }))
  const box = await screen.findByRole('textbox', { name: /Paste the cells/ })
  await userEvent.click(box)
  await userEvent.paste(text)
  await userEvent.click(screen.getByRole('button', { name: 'Check pasted cells' }))
}
const ROSTER = ['bus_id,in_service,depot,route,bus_type,km_per_day', 'B-1,2023-07,Depot A,Route 1,12m,210', 'B-2,2023-09,Depot A,Route 1,12m,210', 'B-3,,Depot B,Route 2,9m,160', 'B-4,2023-13,Depot B,Route 2,9m,160'].join('\n')

describe('Fleet page: ways in and the gate', () => {
  it('starts empty with every way in listed, and the app still works without a fleet', async () => {
    await open()
    expect(screen.getByRole('heading', { name: 'Where do you want to start?' })).toBeInTheDocument()
    for (const n of [/Upload a file/, /Paste from a spreadsheet/, /Add buses by hand/, /Try the sample fleet/]) expect(await screen.findByRole('button', { name: n })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Just one bus/ })).toHaveAttribute('href', expect.stringContaining('/health'))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('the sample fleet goes through the gate, is labelled synthetic, and only then joins', async () => {
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /Try the sample fleet/ }))
    expect(within(gate()).getByText(/60 buses in \d+ duty classes/)).toBeInTheDocument()
    expect(localStorage.getItem('ph.fleet.v1')).toBeNull()
    await userEvent.click(within(gate()).getByRole('button', { name: 'Use this fleet' }))
    expect(await screen.findByText('Synthetic, for demonstration')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(5)
    await waitFor(() => expect(localStorage.getItem('ph.fleet.v1')).not.toBeNull())
  })

  it('pasted cells show a preview with what was assumed and what was rejected, and add nothing until confirmed', async () => {
    await open()
    await paste(ROSTER)
    const g = within(await screen.findByRole('region', { name: /check this before/i }))
    expect(g.getByText(/3 buses in 2 duty classes/)).toBeInTheDocument()
    expect(g.getByText(/no in-service month/)).toBeInTheDocument()
    expect(g.getByText(/1 row not imported/)).toBeInTheDocument()
    await userEvent.click(g.getByRole('button', { name: 'Show reasons' }))
    expect(g.getByText(/not a month/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await userEvent.click(g.getByRole('button', { name: 'Create fleet' }))
    expect(await screen.findByRole('heading', { name: 'My fleet' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'B-1' })).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: 'B-4' })).not.toBeInTheDocument()
    expect(screen.getByText('age unknown')).toBeInTheDocument()
  })

  it('names the bus type and the battery price it assumed when the file says nothing about them', async () => {
    await open()
    await paste(['bus_id,route', 'B-1,R1', 'B-2,R1'].join('\n'))
    const g = within(await screen.findByRole('region', { name: /check this before/i }))
    expect(g.getByText(/2 buses have no bus type, so they are taken as 12 m, like the bus on screen/)).toBeInTheDocument()
    expect(g.getByText(/the bus on screen's price \(₹12,000 per kWh\)/)).toBeInTheDocument()
  })

  it('a file with no bus id column is refused with the reason and nothing is added', async () => {
    await open()
    await paste('depot\nA')
    expect(await screen.findByRole('alert')).toHaveTextContent(/bus_id column is required/)
    expect(screen.queryByRole('region', { name: /check this before/i })).not.toBeInTheDocument()
  })

  it('the add-buses form makes a batch, catches a bad count, and one undo removes it', async () => {
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /Add buses by hand/ }))
    const count = await screen.findByLabelText('How many buses')
    await userEvent.clear(count); await userEvent.type(count, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Check these buses' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/1 to 500/)
    await userEvent.clear(count); await userEvent.type(count, '3')
    await userEvent.type(screen.getByLabelText('Depot'), 'Depot Z')
    await userEvent.click(screen.getByRole('button', { name: 'Check these buses' }))
    const g = within(await screen.findByRole('region', { name: /check this before/i }))
    expect(g.getByText(/B-101 to B-103/)).toBeInTheDocument()
    expect(g.getByText(/duty of the bus on screen/)).toBeInTheDocument()
    await userEvent.click(g.getByRole('button', { name: 'Create fleet' }))
    expect(await screen.findByRole('rowheader', { name: 'B-103' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('heading', { name: 'Where do you want to start?' })).toBeInTheDocument()
  })
})

describe('Fleet page: the roster', () => {
  const withFleet = async () => { await open(); await paste(ROSTER); await userEvent.click(await screen.findByRole('button', { name: 'Create fleet' })); await screen.findByRole('table') }

  it('edits a depot where it sits and rejects a bad month with the reason', async () => {
    await withFleet()
    await userEvent.click(screen.getByRole('button', { name: /Depot of B-1: Depot A/ }))
    const box = screen.getByRole('textbox', { name: 'Depot of B-1' })
    await userEvent.clear(box); await userEvent.type(box, 'Depot Q{Enter}')
    expect(await screen.findByRole('button', { name: /Depot of B-1: Depot Q/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /In-service month of B-2/ }))
    const m = screen.getByRole('textbox', { name: 'In-service month of B-2' })
    await userEvent.clear(m); await userEvent.type(m, '2031-01{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/future/)
  })

  it('changes several selected buses at once', async () => {
    await withFleet()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select B-1' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select B-2' }))
    const bar = within(screen.getByRole('group', { name: /Change 2 selected buses/ }))
    await userEvent.type(bar.getByLabelText('Route'), 'Route 9')
    await userEvent.click(bar.getByRole('button', { name: 'Apply to 2' }))
    expect(await screen.findAllByRole('button', { name: /Route of B-[12]: Route 9/ })).toHaveLength(2)
    expect(screen.queryByRole('group', { name: /selected buses/ })).not.toBeInTheDocument()
  })

  it('filters by text', async () => {
    await withFleet()
    await userEvent.type(screen.getByRole('textbox', { name: 'Find a bus, depot or route' }), 'Depot B')
    expect(screen.queryByRole('rowheader', { name: 'B-1' })).not.toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'B-3' })).toBeInTheDocument()
  })

  it('adding to an existing fleet matches on id and offers replace as the alternative', async () => {
    await withFleet()
    await userEvent.click(screen.getByRole('button', { name: 'Add buses' }))
    await paste(['bus_id,in_service', 'B-1,2022-01', 'B-9,2022-02'].join('\n'))
    const g = within(await screen.findByRole('region', { name: /check this before/i }))
    expect(g.getByText(/kept as they are/)).toBeInTheDocument()
    expect(g.getByRole('radio', { name: /Replace my fleet/ })).toBeInTheDocument()
    await userEvent.click(g.getByRole('button', { name: /Add 2 buses/ }))
    expect(await screen.findByRole('rowheader', { name: 'B-9' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'B-3' })).toBeInTheDocument()
  })
})

describe('Fleet page: the forecast blocks', () => {
  const withSample = async () => {
    const m = mockApi(); renderApp('/fleet'); await screen.findByRole('heading', { level: 1, name: 'Fleet' })
    await userEvent.click(await screen.findByRole('button', { name: /Try the sample fleet/ }))
    await userEvent.click(within(gate()).getByRole('button', { name: 'Use this fleet' }))
    await screen.findByRole('table')
    return m
  }
  const fleetCalls = (m: ReturnType<typeof mockApi>) => m.calls.filter((c) => c.path === '/fleet').map((c) => c.body as { as_of: string; forecast_years: number; classes: { id: string }[]; buses: { id: string }[] })

  it('offers the report and both CSVs once there is a forecast, and a CSV click downloads a file named for the fleet', async () => {
    await withSample()
    await userEvent.click(await screen.findByRole('button', { name: 'Export' }))
    const pdf = await screen.findByRole('button', { name: 'Fleet report (PDF)' })
    await waitFor(() => expect(pdf).toBeEnabled())
    const names: string[] = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download) })
    await userEvent.click(screen.getByRole('button', { name: 'Forecast CSV' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    await userEvent.click(screen.getByRole('button', { name: 'Budget CSV' }))
    click.mockRestore()
    expect(screen.queryByRole('button', { name: 'Budget CSV' })).not.toBeInTheDocument()
    expect(names).toEqual(['sample-fleet-synthetic-for-demonstration-forecast.csv', 'sample-fleet-synthetic-for-demonstration-budget.csv'])
  })

  it('says which buses fall short of their route and when, with the classes, a roster column and a filter', async () => {
    await withSample()
    const sec = await screen.findByRole('region', { name: 'Will each bus still cover its route?' })
    await waitFor(() => expect(within(sec).queryByRole('status')).not.toBeInTheDocument(), { timeout: 4000 })
    expect(within(within(sec).getByRole('list', { name: 'Range against the route, by duty class' })).getAllByRole('listitem').length).toBeGreaterThan(1)
    const bars = within(within(sec).getByRole('list', { name: 'Range against the route, by duty class' })).getAllByRole('button', { name: /^.+: \d+ / })
    const total = bars.reduce((n, b) => n + Number(/: (\d+) /.exec(b.getAttribute('aria-label')!)![1]), 0)
    expect(total).toBe(60)                                           // every bus lands in exactly one segment
    await userEvent.click(within(sec).getByRole('button', { name: /Show the curves behind this/ }))
    expect(await within(sec).findByRole('img', { name: /Buses short of range over the next 10 years/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Range short from/ })).toBeInTheDocument()
    await userEvent.click(bars[0])
    expect(await screen.findByText(/^Showing buses whose range is|^Showing buses/)).toBeInTheDocument()
  })

  it('the Export panel closes on Escape, and removing the fleet asks first', async () => {
    await withSample()
    await userEvent.click(await screen.findByRole('button', { name: 'Export' }))
    expect(screen.getByRole('button', { name: 'Roster CSV' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Roster CSV' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'More fleet actions' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove fleet' }))
    expect(screen.getByText(/Remove all 60 buses\?/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByText(/Remove all/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove fleet' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove fleet' }))
    expect(await screen.findByRole('heading', { name: 'Where do you want to start?' })).toBeInTheDocument()
  })

  it('writes the budget sentence for the next full financial year, from the whole fleet, with the model assumptions stated', async () => {
    await withSample()
    const sec = await screen.findByRole('region', { name: 'Battery budget by financial year' })
    const tiles = within(await screen.findByRole('group', { name: 'The fleet in four numbers' }))
    expect(await tiles.findByText(/^Budget for FY\d{4}-\d\d$/)).toBeInTheDocument()
    expect(tiles.getByText(/^₹[\d.]+ (crore|lakh)/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /About this forecast/ }))
    expect(screen.getByText(/mixed 50\/50, which is an assumption/)).toBeInTheDocument()
    expect(screen.getByText(/A running total has no band/)).toBeInTheDocument()
    await userEvent.click(within(sec).getByRole('button', { name: 'Show as table' }))
    expect(within(sec).getByRole('columnheader', { name: 'Cumulative (no band)' })).toBeInTheDocument()
  })

  it('asks for the whole fleet first, then each class and depot, all for the same day, and the depot stack adds up to the total', async () => {
    const m = await withSample()
    const tl = await toClasses()
    const rows = async () => (await within(tl).findAllByRole('row')).length
    await waitFor(async () => expect(await rows()).toBeGreaterThan(2))
    await waitFor(() => expect(within(tl).queryByRole('status')).not.toBeInTheDocument())
    const calls = fleetCalls(m)
    expect(new Set(calls.map((c) => c.as_of)).size).toBe(1)
    expect(new Set(calls.map((c) => c.forecast_years))).toEqual(new Set([10]))
    expect(calls[0].buses).toHaveLength(60)                       // the whole fleet goes first
    expect(calls.slice(1).every((c) => c.buses.length < 60)).toBe(true)
    const nClasses = within(tl).getAllByRole('row').length - 1     // minus the header
    expect(calls.filter((c) => c.classes.length === 1).length).toBeGreaterThanOrEqual(nClasses)
    await userEvent.click(screen.getByRole('button', { name: 'By year' }))
    const sec = screen.getByRole('region', { name: 'Battery budget by financial year' })
    await waitFor(() => expect(within(sec).getByRole('list', { name: 'Depots in the stack' }).children.length).toBeGreaterThan(2))
    await userEvent.click(within(sec).getByRole('button', { name: 'Show as table' }))
    const cells = (r: HTMLElement) => within(r).getAllByRole('cell').map((c) => c.textContent ?? '')
    const head = within(sec).getAllByRole('columnheader').map((h) => h.textContent ?? '')
    const row = cells(within(sec).getAllByRole('row')[2])
    const money = (t: string) => { const x = /₹([\d.]+) (crore|lakh)/.exec(t); return x ? Number(x[1]) * (x[2] === 'crore' ? 100 : 1) : 0 }
    const total = money(row[head.indexOf('Expected spend')]), parts = head.map((h, i) => (/ spend$/.test(h) && h !== 'Expected spend' && h !== 'Spend, 10th pct' && h !== 'Spend, 90th pct' ? money(row[i]) : 0)).reduce((a, b) => a + b, 0)
    expect(Math.abs(parts - total)).toBeLessThan(0.2 + total * 0.01)    // each figure is rounded to 0.1 lakh
  })

  it('draws buses with no in-service month hatched and apart, and says why', async () => {
    mockApi(); renderApp('/fleet'); await screen.findByRole('heading', { level: 1, name: 'Fleet' })
    await paste(ROSTER)
    await userEvent.click(await screen.findByRole('button', { name: 'Create fleet' }))
    const sec = await screen.findByRole('region', { name: 'Battery budget by financial year' })
    const legend = await within(sec).findByRole('list', { name: 'Depots in the stack' })
    await waitFor(() => expect(within(legend).getByText('Age unknown')).toBeInTheDocument())
    expect(within(legend).getByText('Depot A')).toBeInTheDocument()
    expect(within(sec).getByText(/Hatched: buses with no in-service month, counted as new/)).toBeInTheDocument()
  })

  it('shows the class by year grid as a table with one row per class and a header of financial years', async () => {
    await withSample()
    const tl = await toClasses()
    await waitFor(() => expect(within(tl).queryByRole('status')).not.toBeInTheDocument())
    expect(within(tl).getByRole('columnheader', { name: 'Later' })).toBeInTheDocument()
    expect(within(tl).getAllByRole('rowheader').length).toBeGreaterThan(1)
    expect(within(tl).getByText(/Only the rest of this financial year/)).toBeInTheDocument()
  })

  it('the roster shows months to the line and the year it lands in, and sorting by months puts the nearest first, with unknowns last either way', async () => {
    await withSample()
    const months = () => screen.getAllByRole('row').slice(1).map((r) => within(r).queryAllByRole('cell')[6]?.textContent ?? '').filter((t) => /^\d+$/.test(t)).map(Number)
    await waitFor(() => expect(months().length).toBeGreaterThan(5))
    const th = screen.getByRole('columnheader', { name: /Months to the line/ })
    expect(th).toHaveAttribute('aria-sort', 'ascending')           // nearest to the line first by default
    const asc = months()
    expect(asc).toEqual([...asc].sort((a, b) => a - b))
    await userEvent.click(within(th).getByRole('button'))
    expect(th).toHaveAttribute('aria-sort', 'descending')
    const desc = months()
    expect(desc).toEqual([...desc].sort((a, b) => b - a))
    expect((await screen.findAllByText(/^FY \d{4}-\d\d$/)).length).toBeGreaterThan(0)
  })

  it('risk-band chips filter the roster and say how many buses are in each band', async () => {
    await withSample()
    const chips = await screen.findByRole('group', { name: /Filter by how soon/ })
    const btns = within(chips).getAllByRole('button')
    expect(btns.length).toBeGreaterThan(0)
    const total = btns.reduce((s, b) => s + Number(b.querySelector('b')!.textContent), 0)
    expect(total).toBe(60)                                        // bands partition the fleet
    const first = btns[0], n = Number(first.querySelector('b')!.textContent)
    await userEvent.click(first)
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('checkbox').length).toBe(Math.min(n, 10) + 1)    // the first ten of the band plus select-all
    expect(screen.getByText(/^Showing buses/)).toHaveTextContent(new RegExp(`: ${n}\\.`))
    await userEvent.click(first)
    expect(screen.getAllByRole('checkbox').length).toBe(11)
  })

  it('groups by depot as collapsed rows with counts that add up to the fleet, and opens a group on request', async () => {
    await withSample()
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Group by' }), 'depot')
    const heads = screen.getAllByRole('button', { expanded: false }).filter((b) => b.classList.contains('grp-b'))
    expect(heads.length).toBeGreaterThan(1)
    const n = heads.reduce((s, h) => s + Number(/(\d+) buses?/.exec(h.textContent ?? '')?.[1] ?? 0), 0)
    expect(n).toBe(60)
    expect(screen.queryAllByRole('checkbox').length).toBe(1)      // only select-all until a group is open
    await userEvent.click(heads[0])
    expect(heads[0]).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(1)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group by' }), '')
    expect(screen.getAllByRole('checkbox').length).toBe(11)
  })

  it('ranks where the battery money goes by depot, route or class and says it is a cost, not a margin', async () => {
    await withSample()
    const sec = await screen.findByRole('region', { name: 'Where the battery money goes' })
    expect(await within(sec).findAllByText(/a year$/)).not.toHaveLength(0)
    expect(within(sec).getByText(/not a margin/)).toBeInTheDocument()
    await userEvent.click(within(within(sec).getByRole('group', { name: 'Rank by' })).getByRole('button', { name: 'Duty class' }))
    expect(within(sec).getAllByText(/per km$/).length).toBeGreaterThan(0)
  })

  it('measures the levers for each class in rupees, and says how many buses that covers', async () => {
    await withSample()
    const sec = await screen.findByRole('region', { name: 'What to do first, in rupees' })
    expect(await within(sec).findByText(/All 60 buses are covered/, undefined, { timeout: 4000 })).toBeInTheDocument()
    expect(within(sec).queryByText(/not measured/)).not.toBeInTheDocument()
  })

  it('a failed forecast leaves the roster working and says so', async () => {
    mockApi({ '/fleet': () => ({ status: 500, body: { error: { code: 'x', message: 'down', fields: [] } } }) })
    renderApp('/fleet'); await screen.findByRole('heading', { level: 1, name: 'Fleet' })
    await userEvent.click(await screen.findByRole('button', { name: /Try the sample fleet/ }))
    await userEvent.click(within(gate()).getByRole('button', { name: 'Use this fleet' }))
    expect(await screen.findByText(/The forecast could not be worked out/)).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(5)
    expect(screen.queryByRole('region', { name: 'Battery budget by financial year' })).not.toBeInTheDocument()
  })
})

// Colour contrast needs real layout, so it is checked in a browser; everything else is scanned here.
const scan = async () => (await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)

describe('Fleet page: accessibility', () => {
  it('has no violations empty, with a method open, at the gate, and with a roster and the bulk bar', async () => {
    await open()
    expect(await scan()).toEqual([])
    await userEvent.click(await screen.findByRole('button', { name: /Add buses by hand/ }))
    await screen.findByLabelText('How many buses')
    expect(await scan()).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: /Paste from a spreadsheet/ }))
    const box = await screen.findByRole('textbox', { name: /Paste the cells/ })
    await userEvent.click(box); await userEvent.paste(ROSTER)
    await userEvent.click(screen.getByRole('button', { name: 'Check pasted cells' }))
    await screen.findByRole('region', { name: /check this before/i })
    await userEvent.click(screen.getByRole('button', { name: 'Show reasons' }))
    expect(await scan()).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Create fleet' }))
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select B-1' }))
    await screen.findByRole('group', { name: /selected buses/ })
    expect(await scan()).toEqual([])
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('has no violations with the forecast blocks, a group open, and the lever block loaded', async () => {
    mockApi(); renderApp('/fleet'); await screen.findByRole('heading', { level: 1, name: 'Fleet' })
    await userEvent.click(await screen.findByRole('button', { name: /Try the sample fleet/ }))
    await userEvent.click(within(gate()).getByRole('button', { name: 'Use this fleet' }))
    await screen.findByRole('group', { name: 'The fleet in four numbers' })
    const tl = await toClasses()
    await waitFor(() => expect(within(tl).queryByRole('status')).not.toBeInTheDocument())
    expect(await scan()).toEqual([])
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group by' }), 'risk')
    await userEvent.click(screen.getAllByRole('button', { expanded: false }).filter((b) => b.classList.contains('grp-b'))[0])
    expect(await scan()).toEqual([])
  })
})

describe('Fleet and the analysis pages: one app', () => {
  const sample = async () => {
    mockApi(); renderApp('/fleet'); await screen.findByRole('heading', { level: 1, name: 'Fleet' })
    await userEvent.click(await screen.findByRole('button', { name: /Try the sample fleet/ }))
    await userEvent.click(within(gate()).getByRole('button', { name: 'Use this fleet' }))
    await screen.findByRole('table')
  }
  const crumb = () => screen.getByRole('region', { name: 'Fleet scope' })

  it('has no scope bar until a bus is opened, and opening one lands on Health with the breadcrumb', async () => {
    await sample()
    expect(screen.queryByRole('region', { name: 'Fleet scope' })).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /^Open B-/ })[0])
    await screen.findByRole('heading', { level: 1, name: 'How much capacity is left' })
    const c = within(crumb())
    expect(c.getByRole('link', { name: /Fleet · 60 buses/ })).toBeInTheDocument()
    expect(within(c.getByRole('navigation', { name: 'Where you are' })).getByText(/Depot A/)).toBeInTheDocument()
    expect(c.queryByRole('button', { name: /Apply to this duty class/ })).not.toBeInTheDocument()   // nothing changed yet
  })

  it('the bus switcher moves to the next bus without going back to the roster, and the scope can be left', async () => {
    await sample()
    await userEvent.click(screen.getAllByRole('button', { name: /^Open B-/ })[0])
    await screen.findByRole('heading', { level: 1, name: 'How much capacity is left' })
    const before = (within(crumb()).getByRole('combobox', { name: 'Bus' }) as HTMLSelectElement).value
    await userEvent.click(within(crumb()).getByRole('button', { name: 'Next bus' }))
    expect((within(crumb()).getByRole('combobox', { name: 'Bus' }) as HTMLSelectElement).value).not.toBe(before)
    expect(screen.getByRole('heading', { level: 1, name: 'How much capacity is left' })).toBeInTheDocument()
    await userEvent.click(within(crumb()).getByRole('button', { name: 'Leave the fleet' }))
    expect(screen.queryByRole('region', { name: 'Fleet scope' })).not.toBeInTheDocument()
  })

  it('a changed scenario can be applied to the duty class: the class takes the change and no bus is lost', async () => {
    await sample()
    const stored = () => JSON.parse(localStorage.getItem('ph.fleet.v1') ?? '{}')
    await userEvent.click(screen.getAllByRole('button', { name: /^Open B-/ })[0])
    await screen.findByRole('heading', { level: 1, name: 'How much capacity is left' })
    const fleet0 = stored().fleet ?? stored()
    const opened = (within(crumb()).getByRole('combobox', { name: 'Bus' }) as HTMLSelectElement).value
    const cls0 = (fleet0.buses as { id: string; classId: string }[]).find((b) => b.id === opened)!.classId
    const n = (fleet0.buses as { classId: string }[]).filter((b) => b.classId === cls0).length
    await userEvent.click(await screen.findByRole('button', { name: /Scenario/ }))
    const km = await screen.findByRole('textbox', { name: 'Distance per day' })
    await userEvent.clear(km); await userEvent.type(km, '123')
    const apply = await within(crumb()).findByRole('button', { name: new RegExp(`Apply to this duty class \\(${n} bus`) })
    await userEvent.click(apply)
    await waitFor(() => expect(within(crumb()).queryByRole('button', { name: /Apply to this duty class/ })).not.toBeInTheDocument())
    const after = stored().fleet ?? stored()
    const kms = new Set((after.classes as { id: string; scenario: { km_per_day: number } }[]).map((c) => c.scenario.km_per_day))
    expect(kms.has(123)).toBe(true)
    expect((after.buses as unknown[]).length).toBe(60)
  })

  it('the money lines and the fleet plan speak for the duty class of the opened bus, read-only', async () => {
    await sample()
    await userEvent.click(screen.getAllByRole('button', { name: /^Open B-/ })[0])
    await screen.findByRole('heading', { level: 1, name: 'How much capacity is left' })
    await userEvent.click(screen.getAllByRole('link', { name: 'Replacement' })[0])
    const box = await screen.findByLabelText('Buses in this duty class')
    expect(box).toHaveAttribute('readonly')
    expect(Number((box as HTMLInputElement).value)).toBeGreaterThan(0)
    expect(Number((box as HTMLInputElement).value)).toBeLessThan(60)
  })

  it('without a fleet the plan keeps its own editable bus count', async () => {
    mockApi(); renderApp('/replacement')
    const box = await screen.findByLabelText('Buses in the fleet')
    expect(box).not.toHaveAttribute('readonly')
    expect(screen.queryByRole('region', { name: 'Fleet scope' })).not.toBeInTheDocument()
  })

  it('has no accessibility violations with the scope bar showing', async () => {
    await sample()
    await userEvent.click(screen.getAllByRole('button', { name: /^Open B-/ })[0])
    await screen.findByRole('heading', { level: 1, name: 'How much capacity is left' })
    await screen.findByRole('region', { name: 'Fleet scope' })
    expect(await scan()).toEqual([])
  })
})
