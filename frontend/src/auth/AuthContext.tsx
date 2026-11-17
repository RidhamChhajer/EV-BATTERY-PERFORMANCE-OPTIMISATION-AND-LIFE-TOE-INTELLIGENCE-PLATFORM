import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, AUTH_EXPIRED, getToken, setToken, request } from '../api/client'

type Ctx = { user: string | null; checking: boolean; login: (u: string, p: string) => Promise<void>; logout: () => void }
const C = createContext<Ctx | null>(null)
export const useAuth = () => {
  const c = useContext(C)
  if (!c) throw new Error('useAuth must be used inside AuthProvider')
  return c
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null)
  const [checking, setChecking] = useState(!!getToken())

  // A token kept in sessionStorage is only trusted after the server accepts it.
  useEffect(() => {
    if (!getToken()) return
    request<{ username: string }>('/auth/me').then((r) => setUser(r.username)).catch(() => setToken(null)).finally(() => setChecking(false))
  }, [])
  useEffect(() => {
    const out = () => setUser(null)
    window.addEventListener(AUTH_EXPIRED, out)
    return () => window.removeEventListener(AUTH_EXPIRED, out)
  }, [])

  const login = useCallback(async (u: string, p: string) => {
    const r = await api.login(u, p)
    setToken(r.access_token)
    setUser(r.username)
  }, [])
  const logout = useCallback(() => { setToken(null); setUser(null) }, [])
  return <C.Provider value={{ user, checking, login, logout }}>{children}</C.Provider>
}
