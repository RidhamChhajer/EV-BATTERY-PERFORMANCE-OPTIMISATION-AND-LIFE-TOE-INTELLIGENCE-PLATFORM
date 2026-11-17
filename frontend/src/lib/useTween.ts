import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion:reduce)').matches

/** Smoothly morphs a set of number arrays toward new targets (used so charts glide when the scenario changes). */
export function useTween(target: number[][]): number[][] {
  const [cur, setCur] = useState(target)
  const ref = useRef(target)
  const raf = useRef(0)
  useEffect(() => {
    ref.current = cur
  }, [cur])
  useEffect(() => {
    cancelAnimationFrame(raf.current)
    const same = ref.current.length === target.length && ref.current.every((a, i) => a.length === target[i].length)
    if (reduced() || !same) { setCur(target); return }
    const step = () => {
      let mx = 0
      const next = ref.current.map((a, i) => a.map((v, j) => { const d = target[i][j] - v; mx = Math.max(mx, Math.abs(d)); return v + d * 0.22 }))
      ref.current = next
      if (mx > 0.05) { setCur(next); raf.current = requestAnimationFrame(step) } else setCur(target)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target])
  return cur
}
