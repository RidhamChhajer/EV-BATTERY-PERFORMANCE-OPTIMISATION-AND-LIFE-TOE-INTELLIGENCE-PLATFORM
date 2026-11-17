import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiClientError, AUTH_EXPIRED, getToken, request, setToken } from './client'

const res = (b: unknown, status: number) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => { vi.unstubAllGlobals(); setToken(null) })

describe('api client', () => {
  it('sends the bearer token and a JSON body', async () => {
    setToken('abc')
    const f = vi.fn(async () => res({ ok: 1 }, 200)); vi.stubGlobal('fetch', f)
    await api.post('/predict', { a: 1 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/predict')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer abc')
    expect(init.body).toBe('{"a":1}')
  })
  it('turns a 422 into field messages (T5.2-3)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({ error: { code: 'validation_error', message: 'Invalid request', fields: [{ field: 'scenario.km_per_day', message: 'bad' }] } }, 422)))
    const e = await request('/predict').catch((x) => x) as ApiClientError
    expect(e).toBeInstanceOf(ApiClientError); expect(e.status).toBe(422); expect(e.fields[0]).toEqual({ field: 'scenario.km_per_day', message: 'bad' })
  })
  it('signs the user out when a token is rejected', async () => {
    setToken('old'); const seen = vi.fn(); window.addEventListener(AUTH_EXPIRED, seen)
    vi.stubGlobal('fetch', vi.fn(async () => res({ error: { code: 'not_authenticated', message: 'Please sign in', fields: [] } }, 401)))
    await request('/presets').catch(() => null)
    expect(getToken()).toBeNull(); expect(seen).toHaveBeenCalled()
    window.removeEventListener(AUTH_EXPIRED, seen)
  })
  it('does not treat a wrong password as an expired session', async () => {
    setToken('keep'); const seen = vi.fn(); window.addEventListener(AUTH_EXPIRED, seen)
    vi.stubGlobal('fetch', vi.fn(async () => res({ error: { code: 'invalid_credentials', message: 'no', fields: [] } }, 401)))
    await api.login('a', 'b').catch(() => null)
    expect(seen).not.toHaveBeenCalled()
    window.removeEventListener(AUTH_EXPIRED, seen)
  })
  it('gives a friendly message when the service is down (T5.1-3)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const e = await request('/health').catch((x) => x) as ApiClientError
    expect(e.status).toBe(0); expect(e.message).toMatch(/could not be reached/)
  })
  it('survives a non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>oops</html>', { status: 502 })))
    const e = await request('/health').catch((x) => x) as ApiClientError
    expect(e.status).toBe(502); expect(e.message).toMatch(/502/)
  })
})
