import { useEffect, useId, useRef, useState } from 'react'

export type Chip = { key: string; text: string }

/** One small pill: "Bus B · 5 changes". The headline sentence and the full list open above it on demand, and hovering a row highlights that part of Bus B. */
export function ChangeBar({ chips, insight, onHover }: { chips: Chip[]; insight?: string | null; onHover: (key: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); onHover(null) } }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); onHover(null) } }
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [open, onHover])
  return (
    <div className="chg-bar" ref={box} role="group" aria-label="What you changed on Bus B">
      <ul id={id} className="chg-pop" hidden={!open}>
        {insight && <li className="chg-sum">{insight}</li>}
        {chips.map((c) => (
          <li key={c.key} tabIndex={open ? 0 : -1} onMouseEnter={() => onHover(c.key)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(c.key)} onBlur={() => onHover(null)}>{c.text}</li>
        ))}
      </ul>
      <div className="chg-line">
        <button className="chg-btn" aria-expanded={open} aria-controls={id} onClick={() => { setOpen((o) => !o); if (open) onHover(null) }}>
          <span>Bus B</span><b>{chips.length} {chips.length === 1 ? 'change' : 'changes'}</b>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }}><path d="M2 6.5 5 3.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  )
}
