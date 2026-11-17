import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export type ExportItem = { label: string; hint: string; onClick: () => void; disabled?: boolean; busy?: string }

/** A button that opens a small panel and closes on Escape, on a click outside, or on choosing something. A disclosure, not an ARIA menu, so it is read as ordinary buttons. */
function Disclosure({ label, aria, children, align = 'right' }: { label: ReactNode; aria: string; children: (close: () => void) => ReactNode; align?: 'right' | 'left' }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector<HTMLButtonElement>('button')?.focus() } }
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', key); document.addEventListener('mousedown', away)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', away) }
  }, [open])
  return (
    <div className="disc" ref={box}>
      <button className="btn sm" aria-expanded={open} aria-controls={id} aria-label={aria} onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && <div id={id} className={`disc-p ${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

/** The fleet header's actions: one primary button, one Export panel, one overflow with the destructive choice behind a confirm. */
export function FleetActions({ adding, onAdd, exports, saveFile, buses, onRemove }: { adding: boolean; onAdd: () => void; exports: ExportItem[]; saveFile: ExportItem; buses: number; onRemove: () => void }) {
  const [sure, setSure] = useState(false)
  return (
    <div className="fh-r">
      <button className="btn sm primary" aria-expanded={adding} onClick={onAdd}>Add buses</button>
      <Disclosure label={<>Export <span aria-hidden="true">▾</span></>} aria="Export">
        {(close) => (
          <>
            <p className="disc-h">Reports and tables</p>
            {exports.map((x) => <Item key={x.label} x={x} close={close} />)}
            <p className="disc-h">Keep your fleet</p>
            <Item x={saveFile} close={close} />
          </>
        )}
      </Disclosure>
      <Disclosure label={<span aria-hidden="true">⋯</span>} aria="More fleet actions">
        {(close) => sure ? (
          <div className="disc-c">
            <p><b>Remove all {buses.toLocaleString('en-IN')} {buses === 1 ? 'bus' : 'buses'}?</b> You can undo this straight after.</p>
            <div className="row2"><button className="btn sm danger" onClick={() => { setSure(false); close(); onRemove() }}>Remove fleet</button><button className="btn sm" onClick={() => setSure(false)}>Keep it</button></div>
          </div>
        ) : <button className="disc-i danger" onClick={() => setSure(true)}><b>Remove fleet</b></button>}
      </Disclosure>
    </div>
  )
}

function Item({ x, close }: { x: ExportItem; close: () => void }) {
  const hint = useId()
  return (
    <button className="disc-i" disabled={x.disabled} aria-label={x.label} aria-describedby={hint} onClick={() => { close(); x.onClick() }}>
      <b>{x.busy ?? x.label}</b><span id={hint}>{x.disabled && !x.busy ? 'Waiting for the forecast' : x.hint}</span>
    </button>
  )
}
