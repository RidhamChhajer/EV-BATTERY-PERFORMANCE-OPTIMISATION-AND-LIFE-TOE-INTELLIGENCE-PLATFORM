import { useLayoutEffect, useRef, useState } from 'react'

/** Lets a chart be as tall as the window allows and as wide as its card without stretching. The drawing's own width follows the box's shape
 *  (box width / box height x the drawing's height), so dots, lines and text keep one scale. Without ResizeObserver (tests) the base width is used. */
export function useFit(baseW: number, baseH: number) {
  const ref = useRef<SVGSVGElement>(null)
  const [aspect, setAspect] = useState(baseW / baseH)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => { const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) setAspect(b.width / b.height) }
    measure()
    const ro = new ResizeObserver(measure); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, W: Math.max(520, Math.min(2400, Math.round(baseH * aspect))) }
}
