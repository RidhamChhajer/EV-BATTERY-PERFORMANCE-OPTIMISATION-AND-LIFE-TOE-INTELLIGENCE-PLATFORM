import { useSyncExternalStore } from 'react'

/** One 24-hour clock shared by every bus on the page. It lives outside React state so the scene can read it each frame
 *  without re-rendering the page; only the scrubber subscribes. Playback is off when the user prefers reduced motion. */
type S = { hour: number; playing: boolean }
let state: S = { hour: 0, playing: false }
let raf = 0, last = 0
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion:reduce)').matches
/** Hours of the day that pass each real second. 24 h in about 24 s. */
export const HOURS_PER_SECOND = 1

function loop(now: number) {
  if (!state.playing) return
  const dt = Math.min(0.1, (now - last) / 1000); last = now
  state = { ...state, hour: (state.hour + dt * HOURS_PER_SECOND) % 24 }
  emit(); raf = requestAnimationFrame(loop)
}
export const dayClock = {
  get: () => state,
  set(hour: number) { state = { ...state, hour: ((hour % 24) + 24) % 24 }; emit() },
  play() { if (reduced() || state.playing) return; state = { ...state, playing: true }; last = performance.now(); raf = requestAnimationFrame(loop); emit() },
  pause() { cancelAnimationFrame(raf); state = { ...state, playing: false }; emit() },
  toggle() { if (state.playing) dayClock.pause(); else dayClock.play() },
}
export const useDayClock = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => state)
