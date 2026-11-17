import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ApiClientError } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const { user, login } = useAuth()
  const loc = useLocation()
  const [u, setU] = useState(''), [p, setP] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  if (user) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/'} replace />
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { await login(u.trim(), p) } catch (x) {
      setErr(x instanceof ApiClientError ? x.message : 'Sign-in failed. Please try again.')
    } finally { setBusy(false) }
  }
  return (
    <div className="login">
      <form className="lcard" onSubmit={submit} aria-labelledby="lt">
        <div className="brand">
          <svg width="38" height="38" viewBox="0 0 34 34" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="10" fill="#18181B" stroke="#3F3F46" /><path d="M19 6L9 19h7l-2 9 11-14h-7z" fill="#FACC15" /></svg>
          <span>Pack Horizon</span>
        </div>
        <h1 id="lt">Sign in</h1>
        <p className="lead">Battery health, replacement timing and usage insights for city e-buses.</p>
        <div className="fld"><div className="l"><label htmlFor="u">Username</label></div><div className="inp"><input id="u" autoComplete="username" autoFocus value={u} onChange={(e) => setU(e.target.value)} required /></div></div>
        <div className="fld"><div className="l"><label htmlFor="p">Password</label></div><div className="inp"><input id="p" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required /></div></div>
        {err && <div className="err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
        <button className="btn primary" type="submit" disabled={busy || !u || !p}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="hint"><b>Demo access.</b> Username <code>demo</code> · password <code>PackHorizon-2026</code>. These are set in the server's config file.</div>
      </form>
    </div>
  )
}
