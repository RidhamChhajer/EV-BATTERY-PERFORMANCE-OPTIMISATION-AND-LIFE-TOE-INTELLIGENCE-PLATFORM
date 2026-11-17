import { useEffect, useId, useState } from 'react'
import { boundsText, hhmm, type FieldMeta } from '../lib/scenario'

type Props = { meta: FieldMeta; value: number | null; error?: string; serverError?: string; onChange: (v: number | null) => void }

/** One scenario input: label, plain-words help, unit, inline error. Keeps its own text so partial typing is allowed. */
export function FieldWithBadge({ meta, value, error, serverError, onChange }: Props) {
  const id = useId()
  const scale = meta.scale ?? 1
  const show = (v: number | null) => (v == null || !Number.isFinite(v) ? '' : String(+(v * scale).toFixed(meta.decimals + 2)))
  const [text, setText] = useState(show(value))
  const [open, setOpen] = useState(false)
  // Re-sync the text only to a real number from outside (Reset, CSV import). While the stored value is NaN or empty the user is mid-typing: leave their text alone.
  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return
    setText((t) => (Number(t) === +(value * scale).toFixed(8) ? t : show(value)))
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const msg = error ?? serverError
  return (
    <div className="fld">
      <div className="l">
        <label htmlFor={id}>{meta.label}</label>
        <span className="r">
          <button type="button" className="help" aria-expanded={open} aria-label={`About ${meta.label}`} onClick={() => setOpen((o) => !o)}>?</button>
        </span>
      </div>
      {open && <div className="tip">{meta.help}<br /><b>Allowed:</b> {boundsText(meta.key) || 'any number'} {meta.unit !== 'hh:mm' ? meta.unit : ''}</div>}
      <div className={`inp${msg ? ' bad' : ''}`}>
        <input id={id} inputMode="decimal" value={text} aria-invalid={!!msg} aria-describedby={msg ? `${id}-e` : undefined}
          onChange={(e) => { setText(e.target.value); const t = e.target.value.trim(); onChange(t === '' ? null : Number(t) / scale) }} />
        <span className="u">{meta.hour && value != null && Number.isFinite(value) ? `${hhmm(value)} · ` : ''}{meta.unit === 'hh:mm' ? 'hour' : meta.unit}</span>
      </div>
      {msg && <div className="err" id={`${id}-e`} role="alert">{msg}</div>}
      <div className="src">{meta.source}</div>
    </div>
  )
}
