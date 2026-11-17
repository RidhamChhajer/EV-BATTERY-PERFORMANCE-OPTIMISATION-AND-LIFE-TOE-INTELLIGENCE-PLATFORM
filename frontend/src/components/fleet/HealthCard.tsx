import { BAND_LABEL, BAND_ORDER, type Band, type Row } from '../../lib/fleet/segments'
import type { Fleet } from '../../lib/fleet/types'
import { BAND_COLOR } from './bands'

/** How the roster splits by how soon the median pack reaches the line. The legend rows are the controls: one click filters the roster below to that band. */
export function HealthCard({ fleet, rows, band, onBand, loading }: { fleet: Fleet; rows: Row[]; band: Band | null; onBand: (b: Band | null) => void; loading: boolean }) {
  const counts = new Map<Band, number>()
  for (const r of rows) if (r.band) counts.set(r.band, (counts.get(r.band) ?? 0) + 1)
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  const per = new Map<string, number>()
  for (const b of fleet.buses) per.set(b.classId, (per.get(b.classId) ?? 0) + 1)
  const classes = fleet.classes.map((c) => ({ c, n: per.get(c.id) ?? 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)
  return (
    <section className="card c4" aria-labelledby="health-h">
      <div className="hd"><div><h2 id="health-h">How soon buses reach the line</h2><div className="sub">Click a row to filter the buses below.</div></div></div>
      {total === 0 ? (loading ? <span className="skel" style={{ display: 'block', height: 120 }} /> : <p className="tnote">Waiting for the forecast.</p>) : (
        <>
          <div className="hbar" aria-hidden="true">{BAND_ORDER.filter((b) => counts.has(b)).map((b) => <i key={b} className={b === 'unknown' ? 'hatch' : undefined} style={{ flexGrow: counts.get(b), background: b === 'unknown' ? undefined : BAND_COLOR[b], opacity: band && band !== b ? 0.3 : 1 }} />)}</div>
          <div className="hl" role="group" aria-label="Filter by how soon the median pack reaches the line">
            {BAND_ORDER.filter((b) => counts.has(b)).map((b) => (
              <button key={b} aria-pressed={band === b} onClick={() => onBand(band === b ? null : b)}>
                <i className={b === 'unknown' ? 'hatch' : undefined} style={b === 'unknown' ? undefined : { background: BAND_COLOR[b] }} />
                <span>{BAND_LABEL[b]}</span><b>{counts.get(b)}</b>
              </button>
            ))}
          </div>
        </>
      )}
      <h3 className="hl-h">Duty classes</h3>
      <ul className="hcls">{classes.slice(0, 5).map(({ c, n }) => <li key={c.id}><span>{c.name}</span><b>{n}</b></li>)}{classes.length > 5 && <li className="dim">and {classes.length - 5} more</li>}</ul>
    </section>
  )
}
