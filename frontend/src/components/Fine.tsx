import type { ReactNode } from 'react'

/** The small print behind a card: one quiet line that opens to the full notes, so the numbers stay the main thing on the page. */
export function Fine({ label = 'About these numbers', count, children }: { label?: string; count?: number; children: ReactNode }) {
  return (
    <details className="fine">
      <summary>{label}{count != null && <em>{count}</em>}</summary>
      <div className="fine-b">{children}</div>
    </details>
  )
}
