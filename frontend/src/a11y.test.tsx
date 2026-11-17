import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setToken } from './api/client'
import { mockApi, renderApp } from './test/utils'

afterEach(() => { vi.unstubAllGlobals(); setToken(null) })

// Colour contrast needs real layout, so it is checked in a browser (docs/accessibility.md); everything else is scanned here.
const scan = async () => (await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)

const PAGES: [string, RegExp | string][] = [
  ['/', 'Replace around'], ['/health', 'Health over time'], ['/replacement', 'Planning dates'], ['/range', 'Range on a full charge'],
  ['/cost', 'Cost per km'], ['/optimise', 'Range at replacement'], ['/evidence', 'Model pipeline'],
]

describe('accessibility scan (axe)', () => {
  it.each(PAGES)('%s has no violations and one main landmark', async (path, ready) => {
    mockApi(); renderApp(path)
    await screen.findAllByText(ready)
    expect(await scan()).toEqual([])
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('has a skip link that moves focus to the main content', async () => {
    mockApi(); renderApp('/health')
    await screen.findAllByText('Health over time')
    await userEvent.click(screen.getByRole('link', { name: 'Skip to content' }))
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('opens a drawer into focus, closes it with Escape and gives focus back to its button', async () => {
    mockApi(); renderApp('/optimise')
    const btn = await screen.findByRole('button', { name: 'Goals' })
    await userEvent.click(btn)
    const drawer = await screen.findByRole('complementary', { name: 'Pick a goal' })
    await waitFor(() => expect(drawer).toHaveFocus())
    expect(await scan()).toEqual([])
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument())
    expect(btn).toHaveFocus()
  })

  it('names every dock button and marks the open one as pressed', async () => {
    mockApi(); renderApp('/optimise')
    const dock = await screen.findByRole('navigation', { name: 'Panels' })
    for (const n of ['Bus A', 'Bus B', 'Goals', 'Details', 'View']) expect(within(dock).getByRole('button', { name: n })).toHaveAttribute('aria-pressed')
    await userEvent.click(within(dock).getByRole('button', { name: 'View' }))
    expect(within(dock).getByRole('button', { name: 'View' })).toHaveAttribute('aria-pressed', 'true')
  })
})
