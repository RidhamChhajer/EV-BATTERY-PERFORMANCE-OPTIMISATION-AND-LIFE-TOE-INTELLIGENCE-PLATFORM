import { useId } from 'react'
import { timelineOf } from '../../lib/fleet/forecast'
import { EvidenceBadge } from '../EvidenceBadge'
import type { Part } from './useFleetBlocks'

/** When each duty class reaches the line: one row per class, one column per financial year, each cell the expected number of buses. The grid is a real table, so the
 *  numbers are the accessible version and the fill only helps the eye. It replaces drawing a curve per bus, which at fleet size is unreadable. */
export function TimelineBlock({ classes, labels, done, total, stale, bare }: { classes: Part[]; labels: string[]; done: number; total: number; stale: boolean; bare?: boolean }) {
  const id = useId()
  const t = timelineOf(classes.filter((c) => c.series).map((c) => ({ id: c.id, name: c.name, n: c.buses, series: c.series! })), labels)
  const pending = classes.filter((c) => !c.series)
  const Wrap = bare ? 'div' : 'section'
  return (
    <Wrap className={bare ? undefined : 'card c12'} aria-labelledby={bare ? undefined : `${id}-h`} aria-busy={done < total || stale}>
      {!bare && <div className="hd"><div><h2 id={`${id}-h`}>When each duty class reaches the line</h2><div className="sub">Expected buses per financial year. Darker is more buses.</div></div><EvidenceBadge level="derived" /></div>}
      {done < total && <p className="tnote" role="status">{done} of {total} duty classes done{classes.some((c) => c.failed) ? '; some could not be worked out' : ''}.</p>}
      <div className="scrollx">
        <table className="tbl ftl">
          <caption className="sr">Expected buses reaching the replacement line, by duty class and financial year</caption>
          <thead><tr><th scope="col">Duty class</th><th scope="col">Buses</th>{labels.map((l, i) => <th key={l} scope="col" title={l}>{i === 0 ? `${l.replace(/^FY/, '')}*` : l.replace(/^FY\d\d/, '')}</th>)}<th scope="col" title="Expected buses that do not reach the line inside the forecast">Later</th></tr></thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}</th><td data-label="Buses">{r.n}</td>
                {r.cells.map((v, i) => <td key={labels[i]} data-label={labels[i]} className="ftl-c" style={{ background: v < 0.05 || t.max <= 0 ? undefined : `rgba(250,204,21,${(0.08 + 0.37 * (v / t.max)).toFixed(2)})` }}>{v < 0.05 ? <span className="dim">·</span> : v.toFixed(1)}</td>)}
                <td data-label="Later" className="ftl-c">{r.beyond < 0.05 ? <span className="dim">·</span> : r.beyond.toFixed(1)}</td>
              </tr>
            ))}
            {pending.map((c) => <tr key={c.id}><th scope="row">{c.name}</th><td>{c.buses}</td><td colSpan={labels.length + 1}>{c.failed ? <span className="dim">Could not be worked out</span> : <span className="skel" style={{ display: 'block', height: 14 }} />}</td></tr>)}
          </tbody>
        </table>
      </div>
      {bare
        ? <p className="note">* Only the rest of this financial year. “Later” is beyond the forecast. Darker means more buses.</p>
        : <p className="note">* The first column is only the rest of the current financial year. “Later” is expected buses that do not reach the line inside the forecast. Each class is worked out on its own, so the columns add up to the fleet’s expected total; the 10th to 90th percentile band belongs to the fleet total in the budget chart and does not split by class. Not yet validated on buses.</p>}
    </Wrap>
  )
}
