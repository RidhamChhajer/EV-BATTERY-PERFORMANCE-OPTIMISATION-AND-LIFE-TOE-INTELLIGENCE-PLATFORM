import { useState, type ReactNode } from 'react'

/** Text alternative for a chart: the same numbers as a table. */
export function WithTable({ chart, head, rows }: { chart: ReactNode; head: string[]; rows: (string | number)[][] }) {
  const [on, setOn] = useState(false)
  return (
    <>
      {on ? (
        <div style={{ maxHeight: 330, overflow: 'auto' }}>
          <table className="tbl"><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
        </div>
      ) : chart}
      <div style={{ marginTop: 10 }}><button className="btn sm" aria-pressed={on} onClick={() => setOn((o) => !o)}>{on ? 'Show chart' : 'Show as table'}</button></div>
    </>
  )
}
