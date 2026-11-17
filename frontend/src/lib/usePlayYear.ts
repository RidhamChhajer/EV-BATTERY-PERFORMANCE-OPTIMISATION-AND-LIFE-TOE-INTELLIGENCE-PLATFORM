import { useEffect, useRef, useState } from 'react'
import { useYear } from '../state/YearContext'

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion:reduce)').matches

/** Play the shared year forward and loop. With reduced motion, "play" steps one year instead of animating. */
export function usePlayYear(xMax: number) {
  const { year, setYear } = useYear()
  const [playing, setPlaying] = useState(false)
  const yr = useRef(year)
  yr.current = year
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now()
    const tick = (t: number) => { const n = yr.current + ((t - last) / 1000) * (xMax / 8); last = t; setYear(n > xMax ? 0 : n); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, xMax, setYear])
  const toggle = () => { if (reduced() && !playing) { setYear(Math.min(xMax, year + 1)); return } setPlaying((p) => !p) }
  return { playing, toggle, stop: () => setPlaying(false) }
}
