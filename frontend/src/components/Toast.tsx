import { useEffect, useState } from 'react'

const EV = 'ph:toast'
export const toast = (message: string) => window.dispatchEvent(new CustomEvent(EV, { detail: message }))

export function Toaster() {
  const [msg, setMsg] = useState('')
  const [on, setOn] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const h = (e: Event) => { setMsg((e as CustomEvent<string>).detail); setOn(true); clearTimeout(t); t = setTimeout(() => setOn(false), 2000) }
    window.addEventListener(EV, h)
    return () => { window.removeEventListener(EV, h); clearTimeout(t) }
  }, [])
  return <div className={`toast${on ? ' show' : ''}`} role="status" aria-live="polite">{msg}</div>
}
