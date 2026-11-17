import { Fragment, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useThumb } from '../lib/useThumb'

/** Three zones: the fleet, one bus's analysis pages, and the evidence behind them. A thin divider separates the zones. */
export const ROUTES = [
  { to: '/fleet', label: 'Fleet', zone: 0 },
  { to: '/', label: 'Overview', zone: 1 }, { to: '/health', label: 'Health', zone: 1 }, { to: '/replacement', label: 'Replacement', zone: 1 },
  { to: '/range', label: 'Range', zone: 1 }, { to: '/cost', label: 'Cost', zone: 1 }, { to: '/optimise', label: 'Optimise', zone: 1 },
  { to: '/evidence', label: 'Evidence', zone: 2 },
]

export function TopNav() {
  const { user, logout } = useAuth()
  const loc = useLocation()
  const box = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false)
  const search = window.location.search

  const thumb = useThumb(box, 'a.active', loc.pathname)

  return (
    <header className="nav" role="banner">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); const m = document.getElementById('main'); m?.setAttribute('tabindex', '-1'); m?.focus() }}>Skip to content</a>
      <NavLink to={`/${search}`} className="brand" aria-label="Pack Horizon home">
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="10" fill="#18181B" stroke="#3F3F46" /><path d="M19 6L9 19h7l-2 9 11-14h-7z" fill="#FACC15" /></svg>
        <span>Pack Horizon</span>
      </NavLink>
      <nav className="links" ref={box} aria-label="Sections">
        <span className="thumb" style={thumb} aria-hidden="true" />
        {ROUTES.map((r, i) => (
          <Fragment key={r.to}>
            {i > 0 && ROUTES[i - 1].zone !== r.zone && <span className="zsep" aria-hidden="true" />}
            <NavLink to={`${r.to}${search}`} end={r.to === '/'} className={() => (loc.pathname === r.to ? 'active' : '')}>{r.label}</NavLink>
          </Fragment>
        ))}
      </nav>
      <div className="umenu">
        <button className="avatar" aria-label={`${(user ?? '?').slice(0, 1).toUpperCase()}, account menu`} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{(user ?? '?').slice(0, 1).toUpperCase()}</button>
        {menu && (
          <div className="pop">
            <b>{user}</b><small>Demo account</small>
            <button className="btn sm" style={{ marginTop: 12, width: '100%' }} onClick={logout}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  )
}
