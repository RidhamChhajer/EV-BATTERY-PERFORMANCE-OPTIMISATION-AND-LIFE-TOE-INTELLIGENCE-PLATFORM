import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import health from './fixtures/health.json'
import presets from './fixtures/presets.json'
import zones from './fixtures/zones.json'
import evidence from './fixtures/evidence.json'
import predict from './fixtures/predict.json'
import compare from './fixtures/compare.json'
import recommend from './fixtures/recommend.json'
import fleetFix from './fixtures/fleet.json'
import { setToken } from '../api/client'
import { AuthProvider } from '../auth/AuthContext'
import App from '../App'

export const FIX = { health, presets, zones, evidence, predict, compare, recommend, fleet: fleetFix }

type L = { value: number | number[] } & Record<string, unknown>
const scaleL = (l: L | null, k: number): L | null => (l == null ? null : { ...l, value: Array.isArray(l.value) ? l.value.map((v) => v * k) : l.value * k })
/** A /fleet response for any request, built from the real captured one: totals scale with the number of buses, so a subset's figures add up to the whole's, as the real
 *  server's expected counts and spend do. The shapes, labels and flags are the real ones; the numbers are only as realistic as that scaling. */
export function fleetResponse(req: { as_of?: string; classes: { id: string }[]; buses: { class_id: string; in_service?: string }[] }) {
  const r = structuredClone(fleetFix.response) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const k = req.buses.length / 12
  for (const f of ['buses_expected', 'buses_p10', 'buses_p90', 'spend_expected', 'spend_p10', 'spend_p90', 'beyond_forecast_buses']) r[f] = scaleL(r[f], k)
  const asOf = req.as_of ?? r.as_of, mi = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1
  const groups = new Map<string, { class_id: string; age: number | null; n: number }>()
  for (const b of req.buses) {
    const age = b.in_service ? mi(asOf.slice(0, 7)) - mi(b.in_service) : null, key = `${b.class_id}|${age}`
    const g = groups.get(key) ?? groups.set(key, { class_id: b.class_id, age, n: 0 }).get(key)!
    g.n += 1
  }
  const n = new Map<string, number>()
  for (const b of req.buses) n.set(b.class_id, (n.get(b.class_id) ?? 0) + 1)
  r.as_of = asOf
  r.classes = req.classes.filter((c) => n.has(c.id)).map((c) => ({ ...r.classes[0], id: c.id, n_buses: { ...r.classes[0].n_buses, value: n.get(c.id) } }))
  const at = (v: number) => ({ ...r.cohorts[0].months_to_line_p50, value: v })
  // older buses are nearer the line, so sorting and the risk bands have something to separate
  r.cohorts = [...groups.values()].map((g) => { const m = Math.max(1, 150 - (g.age ?? 0)); return { ...r.cohorts[0], class_id: g.class_id, age_months: g.age == null ? null : { ...r.cohorts[0].n_buses, value: g.age, unit: 'months' }, flags: g.age == null ? ['age_unknown'] : [], n_buses: { ...r.cohorts[0].n_buses, value: g.n }, months_to_line_p10: at(Math.max(1, m - 20)), months_to_line_p50: at(m), months_to_line_p90: at(m + 30) } })
  return r
}
export const DEMO = { username: 'demo', password: 'PackHorizon-2026' }

type Routes = Record<string, (body: unknown) => { status?: number; body: unknown }>
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

/** Replaces fetch with the real captured API responses. `over` lets a test change or break one endpoint. */
export function mockApi(over: Routes = {}) {
  const calls: { path: string; body: unknown }[] = []
  const routes: Routes = {
    '/health': () => ({ body: FIX.health }), '/presets': () => ({ body: FIX.presets }), '/zones': () => ({ body: FIX.zones }), '/evidence': () => ({ body: FIX.evidence }),
    '/fleet': (b) => ({ body: fleetResponse(b as Parameters<typeof fleetResponse>[0]) }), '/predict': () => ({ body: FIX.predict }), '/compare': () => ({ body: FIX.compare }), '/recommend': () => ({ body: FIX.recommend }),
    '/auth/me': () => ({ body: { username: 'demo' } }),
    '/auth/login': (b) => {
      const x = b as typeof DEMO
      return x.username === DEMO.username && x.password === DEMO.password ? { body: { access_token: 'tok', token_type: 'bearer', expires_in: 3600, username: 'demo' } }
        : { status: 401, body: { error: { code: 'invalid_credentials', message: 'Username or password is not correct.', fields: [] } } }
    },
    ...over,
  }
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/api\/v1/, '')
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ path, body })
    const r = routes[path]
    if (!r) return json({ error: { code: 'http_error', message: 'Not Found', fields: [] } }, 404)
    const out = r(body)
    return json(out.body, out.status ?? 200)
  })
  vi.stubGlobal('fetch', f)
  return { fetch: f, calls }
}

export function renderApp(path = '/', signedIn = true) {
  setToken(signedIn ? 'tok' : null)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  window.history.replaceState(null, '', path)
  const wrap = (c: ReactNode) => <QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}><AuthProvider>{c}</AuthProvider></MemoryRouter></QueryClientProvider>
  return render(wrap(<App />))
}
