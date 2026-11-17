import type { ReactNode } from 'react'
import { ApiClientError } from '../api/client'

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiClientError ? error : null
  const message = error instanceof Error ? error.message : undefined
  return (
    <div className="errbox" role="alert">
      <b>{e?.status === 0 ? 'Cannot reach the service' : e?.status === 422 ? 'Some inputs are not valid' : e ? 'Something went wrong' : 'Check your inputs'}</b>
      <p>{message ?? 'The request failed. Please try again.'}</p>
      {e?.fields?.length ? <ul>{e.fields.map((f) => <li key={f.field}>{f.field}: {f.message}</li>)}</ul> : null}
      {onRetry && <button className="btn sm" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function Skeleton({ h = 220 }: { h?: number }) {
  return <div className="skel" style={{ height: h }} aria-busy="true" aria-label="Loading…" />
}

/** Renders children once data exists. While the first load runs it shows a skeleton; a refetch keeps the old numbers on screen. */
export function Async<T>({ q, h, children }: { q: { data?: T; error: unknown; isPending: boolean; refetch: () => unknown }; h?: number; children: (d: T) => ReactNode }) {
  if (q.data !== undefined) return <>{children(q.data)}</>
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return <Skeleton h={h} />
}
