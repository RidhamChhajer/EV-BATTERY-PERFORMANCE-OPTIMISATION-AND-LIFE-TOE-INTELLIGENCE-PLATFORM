import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PackId } from './bus'

export type LayerKey = 'shell' | 'chassis' | 'packs' | 'labels' | 'dims' | 'flow' | 'scan'
export type CamId = 'iso' | 'side' | 'top' | 'pack' | 'cmp'
export type Layers = Record<LayerKey, boolean>
/** One lens at a time keeps the scene clear: health (capacity in the cells), charge (the day at the depot), heat, or range against the route. */
export type Lens = 'health' | 'charge' | 'heat' | 'range'
export const LENSES: { id: Lens; label: string; hotkey: string }[] = [
  { id: 'health', label: 'Ageing', hotkey: 'A' }, { id: 'charge', label: 'Charge', hotkey: 'G' }, { id: 'heat', label: 'Heat', hotkey: 'T' }, { id: 'range', label: 'Range', hotkey: 'R' },
]

export const LAYER_LABELS: { key: LayerKey; label: string; hotkey: string }[] = [
  { key: 'shell', label: 'Body', hotkey: 'S' }, { key: 'chassis', label: 'Wheels and lights', hotkey: 'C' }, { key: 'packs', label: 'Battery packs', hotkey: 'P' },
  { key: 'labels', label: 'Labels', hotkey: 'L' }, { key: 'dims', label: 'Length', hotkey: 'D' }, { key: 'flow', label: 'Charging flow', hotkey: 'F' }, { key: 'scan', label: 'Scan', hotkey: 'X' },
]
export const CAMS: Record<CamId, { label: string; pos: [number, number, number]; target: [number, number, number] }> = {
  iso: { label: 'Angle', pos: [12.4, 8, 13.8], target: [0, 2.1, 0] },
  side: { label: 'Side', pos: [0, 4.6, 16], target: [0, 1.8, 0] },
  top: { label: 'Top', pos: [0.01, 17, 0.01], target: [0, 0, 0] },
  pack: { label: 'Packs', pos: [5.2, 5.4, 6.4], target: [0.5, 1.8, 0] },
  cmp: { label: 'Compare', pos: [2.5, 25, 20.6], target: [0, 0, -0.8] },
}
export const CAM_ORDER: CamId[] = ['iso', 'side', 'top', 'pack', 'cmp']

export type ViewState = { layers: Layers; explode: number; shell: number; cam: CamId; camNonce: number; selected: PackId | null; isolate: boolean; lens: Lens; hoverLever: string | null }

export function useViewState(initialCam: CamId = 'iso', initialLens: Lens = 'health') {
  const [v, setV] = useState<ViewState>({
    layers: { shell: true, chassis: true, packs: true, labels: true, dims: false, flow: false, scan: false },
    explode: 0, shell: 1, cam: initialCam, camNonce: 0, selected: null, isolate: false, lens: initialLens, hoverLever: null,
  })
  const toggle = useCallback((k: LayerKey) => setV((s) => ({ ...s, layers: { ...s.layers, [k]: !s.layers[k] } })), [])
  const setExplode = useCallback((explode: number) => setV((s) => ({ ...s, explode })), [])
  const setShell = useCallback((shell: number) => setV((s) => ({ ...s, shell })), [])
  const setCam = useCallback((cam: CamId) => setV((s) => ({ ...s, cam, camNonce: s.camNonce + 1 })), [])
  const select = useCallback((selected: PackId | null) => setV((s) => ({ ...s, selected, isolate: selected ? s.isolate : false })), [])
  const toggleIsolate = useCallback(() => setV((s) => ({ ...s, isolate: s.selected ? !s.isolate : false })), [])
  const setLens = useCallback((lens: Lens) => setV((s) => ({ ...s, lens })), [])
  const hoverLever = useCallback((hoverLever: string | null) => setV((s) => (s.hoverLever === hoverLever ? s : { ...s, hoverLever })), [])
  const api = useMemo(() => ({ toggle, setExplode, setShell, setCam, select, toggleIsolate, setLens, hoverLever }), [toggle, setExplode, setShell, setCam, select, toggleIsolate, setLens, hoverLever])
  return [v, api] as const
}
export type ViewApi = ReturnType<typeof useViewState>[1]

/** Keyboard shortcuts for the 3D view. Ignored while typing in a field. */
export function useViewShortcuts(api: ViewApi, getExplode: () => number, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const keys: Record<string, LayerKey> = { s: 'shell', c: 'chassis', p: 'packs', l: 'labels', d: 'dims', f: 'flow', x: 'scan' }
    const lensKeys: Record<string, Lens> = { a: 'health', g: 'charge', t: 'heat', r: 'range' }
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))) return
      const k = e.key.toLowerCase()
      if (keys[k]) api.toggle(keys[k])
      else if (k === 'e') api.setExplode(getExplode() > 0.05 ? 0 : 1)
      else if (k === 'i') api.toggleIsolate()
      else if (k === 'escape') api.select(null)
      else if (lensKeys[k]) api.setLens(lensKeys[k])
      else if (/^[1-5]$/.test(k)) api.setCam(CAM_ORDER[+k - 1])
      else return
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [api, getExplode, enabled])
}
