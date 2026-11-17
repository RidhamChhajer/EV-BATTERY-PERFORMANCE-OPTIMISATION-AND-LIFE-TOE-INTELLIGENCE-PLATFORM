import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import presets from '../test/fixtures/presets.json'
import { sampleFleet } from '../lib/fleet/sample'
import { loadFleet, saveFleet } from '../lib/fleet/storage'
import { FleetProvider, useFleet } from './FleetContext'

const P = presets.presets as unknown as Parameters<typeof sampleFleet>[0]
const fleet = () => sampleFleet(P, new Date(2026, 10, 11))

let ctx: ReturnType<typeof useFleet>
function Probe() { ctx = useFleet(); return null }
const mount = () => render(<FleetProvider><Probe /></FleetProvider>)

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('fleet storage', () => {
  it('saves and loads a fleet, and a corrupt entry is ignored rather than trusted', () => {
    expect(saveFleet(fleet())).toBe('saved')
    expect(loadFleet()?.buses).toHaveLength(60)
    localStorage.setItem('ph.fleet.v1', '{"format":"pack-horizon-fleet","version":1,"fleet":{"classes":[],"buses":[]}}')
    expect(loadFleet()).toBeNull()
    localStorage.setItem('ph.fleet.v1', 'garbage')
    expect(loadFleet()).toBeNull()
    expect(saveFleet(null)).toBe('saved')
  })
  it('reports blocked storage instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(saveFleet(fleet())).toBe('blocked')
  })
  it('refuses to store something larger than the budget and says so', () => {
    const big = fleet()
    big.name = 'x'.repeat(3_600_000)
    expect(saveFleet(big)).toBe('too_big')
  })
})

describe('FleetProvider', () => {
  it('starts with no fleet, so the app behaves as it did before fleets existed', () => {
    mount()
    expect(ctx.fleet).toBeNull()
    expect(ctx.canUndo).toBe(false)
    expect(ctx.groupBy).toBe('depot')
  })
  it('keeps a loaded fleet across a reload, and undo restores the one before', () => {
    const { unmount } = mount()
    act(() => ctx.setFleet(fleet()))
    expect(loadFleet()?.id).toBe('sample')
    unmount()
    mount()
    expect(ctx.fleet?.buses).toHaveLength(60)
    act(() => ctx.setFleet(null))
    expect(ctx.fleet).toBeNull()
    expect(ctx.canUndo).toBe(true)
    act(() => ctx.undo())
    expect(ctx.fleet?.buses).toHaveLength(60)
    expect(ctx.canUndo).toBe(false)
  })
  it('drops a selection that is no longer in the fleet', () => {
    mount()
    act(() => ctx.setFleet(fleet()))
    act(() => ctx.select('B-100'))
    expect(ctx.selectedId).toBe('B-100')
    act(() => ctx.select('B-nope'))
    expect(ctx.selectedId).toBeNull()
  })
  it('keeps working in memory when the browser will not store it, and says so', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    mount()
    act(() => ctx.setFleet(fleet()))
    expect(ctx.fleet?.buses).toHaveLength(60)
    expect(ctx.saveStatus).toBe('blocked')
  })
  it('remembers the grouping', () => {
    const { unmount } = mount()
    act(() => ctx.setGroupBy('route'))
    unmount()
    mount()
    expect(ctx.groupBy).toBe('route')
  })
})
