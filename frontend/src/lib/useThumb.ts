import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

/** Position/size of the active item inside a segmented control or nav, kept right through font loading and resizes. */
export function useThumb(box: RefObject<HTMLElement | null>, activeSelector: string, dep: unknown) {
  const [t, setT] = useState({ left: 0, width: 0, ready: false })
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const a = el.querySelector<HTMLElement>(activeSelector)
      if (a) setT((o) => (o.left === a.offsetLeft && o.width === a.offsetWidth ? o : { left: a.offsetLeft, width: a.offsetWidth, ready: o.ready }))
    }
    measure()
    const raf = requestAnimationFrame(() => setT((o) => ({ ...o, ready: true })))   // first placement is instant, later moves spring
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    el.querySelectorAll('a,button').forEach((c) => ro.observe(c))
    document.fonts?.ready.then(measure)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [box, activeSelector, dep])
  return { left: t.left, width: t.width, transition: t.ready ? undefined : 'none' } as CSSProperties
}
