import { useId, useState } from 'react'
import { api, ApiClientError, postFile } from '../api/client'
import { useReportStatus } from '../api/hooks'
import type { Scenario } from '../api/types'
import { useScopeSize } from '../state/scope'

type Status = { kind: 'idle' } | { kind: 'busy'; what: 'pdf' | 'email' } | { kind: 'done'; text: string } | { kind: 'error'; text: string }
const EMAIL = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]+$/

/** Contents of the "Send report" drawer: the Bus A vs Bus B comparison as a PDF, to download or to email to one person. The server builds the file
 *  from the two buses' settings, so what is emailed is exactly what is downloaded. Nothing is stored: the address is used for this one send. */
export function ReportPanel({ a, b, changes, ready }: { a: Scenario; b: Scenario; changes: string[]; ready: boolean }) {
  const uid = useId()
  const [fleet] = useScopeSize()
  const mail = useReportStatus()
  const [to, setTo] = useState('')
  const [st, setSt] = useState<Status>({ kind: 'idle' })
  const body = { scenario_a: a, scenario_b: b, fleet_size: fleet }
  const busy = st.kind === 'busy'
  const addr = to.trim()
  const addrOk = EMAIL.test(addr)
  const fail = (e: unknown) => setSt({ kind: 'error', text: e instanceof ApiClientError ? e.message : 'Something went wrong. Try again.' })

  const download = async () => {
    setSt({ kind: 'busy', what: 'pdf' })
    try {
      const { blob, filename } = await postFile('/report/pdf', body)
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setSt({ kind: 'done', text: 'The PDF was downloaded.' })
    } catch (e) { fail(e) }
  }
  const send = async () => {
    setSt({ kind: 'busy', what: 'email' })
    try {
      const r = await api.post<{ sent: true; to: string }>('/report/email', { ...body, to: addr })
      setSt({ kind: 'done', text: `Report sent to ${r.to}.` })
    } catch (e) { fail(e) }
  }

  return (
    <div className="rp">
      <p>A short PDF of this comparison: what changed on Bus B, battery life, cost per km, range against your route, a health chart and the limits of the forecast.</p>
      {!ready && <p className="note" role="note">Change Bus B first. The report compares the two buses, and right now they are the same.</p>}
      {ready && changes.length > 0 && (
        <div className="rp-ch"><small>Bus B changes in this report</small><ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul></div>
      )}

      <section className="rp-s" aria-labelledby={`${uid}d`}>
        <h3 id={`${uid}d`}>Download</h3>
        <button className="btn primary" onClick={download} disabled={!ready || busy}>{st.kind === 'busy' && st.what === 'pdf' ? 'Preparing the PDF…' : 'Download PDF'}</button>
      </section>

      <section className="rp-s" aria-labelledby={`${uid}e`}>
        <h3 id={`${uid}e`}>Email it</h3>
        {mail.data && !mail.data.email_enabled
          ? <p className="note">Email is not set up on this server. Download the PDF and send it yourself.</p>
          : (
            <form onSubmit={(e) => { e.preventDefault(); if (ready && addrOk && !busy) send() }} noValidate>
              <label htmlFor={`${uid}t`}>Send to</label>
              <input id={`${uid}t`} type="email" inputMode="email" autoComplete="off" spellCheck={false} placeholder="name@company.com" value={to} onChange={(e) => { setTo(e.target.value); if (st.kind !== 'busy') setSt({ kind: 'idle' }) }}
                aria-invalid={addr !== '' && !addrOk} aria-describedby={`${uid}h`} />
              <div className="note" id={`${uid}h`}>{addr !== '' && !addrOk ? 'Enter one address, like name@company.com.' : 'One person. The address is used for this send only and is not stored.'}</div>
              <button className="btn primary" type="submit" disabled={!ready || !addrOk || busy}>{st.kind === 'busy' && st.what === 'email' ? 'Sending…' : 'Send report'}</button>
            </form>
          )}
      </section>

      <div aria-live="polite" className="rp-st">
        {st.kind === 'done' && <p className="rp-ok" role="status">{st.text}</p>}
        {st.kind === 'error' && <p className="rp-err" role="alert">{st.text}</p>}
      </div>
      <p className="note">Every number is a forecast from published laboratory cell models with assumed inputs. Not yet validated on buses, and the report says so on every page.</p>
    </div>
  )
}
