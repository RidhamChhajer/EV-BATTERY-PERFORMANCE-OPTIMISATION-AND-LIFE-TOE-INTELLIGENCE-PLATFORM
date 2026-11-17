import { useEffect, useId, useRef, useState } from 'react'

export const OPEN_ABOUT = 'ph:about'
/** Opens the About panel from anywhere on the page and brings it into view. */
export const openAbout = () => window.dispatchEvent(new Event(OPEN_ABOUT))

/** The one place the caveats live. The cards say only what changes how to read them. */
export function AboutForecast() {
  const [open, setOpen] = useState(false)
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = () => { setOpen(true); setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50) }
    window.addEventListener(OPEN_ABOUT, h)
    return () => window.removeEventListener(OPEN_ABOUT, h)
  }, [])
  return (
    <div className="c12 about" ref={box}>
      <button className="chip w" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}><i />{open ? 'Hide' : 'About this forecast'} · prior mode, not yet validated on buses</button>
      {open && (
        <ul id={id} className="about-p">
          <li>The ageing curves are two published LFP models mixed 50/50, which is an assumption. It is the main reason the band is wide: each model puts the whole fleet on its own curve, so the spread comes mostly from the models disagreeing.</li>
          <li>The band is for the whole fleet’s total and does not split by depot or class. A running total has no band.</li>
          <li>“Reaching the line” means 80 % of a new pack’s capacity. Money is undiscounted and counts the first pack of each bus only.</li>
          <li>A bus with no in-service month is counted as new, which pushes its replacement later than it may be. Those buses are hatched.</li>
          <li>Months to the line is the model’s median for a bus of that duty class and age, given it is still in service. It is not how the bus is used or what its battery reports. Cost per km is the class’s figure. Risk bands are product choices to make a list usable.</li>
          <li>Depots, routes and reported health stay in this browser. Only duty classes, bus ids and ages go to the server.</li>
        </ul>
      )}
    </div>
  )
}
