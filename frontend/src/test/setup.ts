import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// Lazy page chunks and the 3D bundle load slowly when the machine is busy, so give async queries more room than the 1 s default.
configure({ asyncUtilTimeout: 5000 })

// jsdom lacks these browser APIs; the app only needs them to exist.
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver   // plain assignment: tests call vi.unstubAllGlobals()
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/') })
