import type { PackId } from './bus'

export type InspectRow = { label: string; p10: number; p50: number; p90: number }
const INFO: Record<PackId, { name: string; modules: number; where: string }> = {
  roof: { name: 'Roof packs', modules: 4, where: 'On the roof, behind the air-conditioning unit' },
  under: { name: 'Underfloor packs', modules: 2, where: 'Between the axles, under the floor' },
  rear: { name: 'Rear pack', modules: 1, where: 'In the rear compartment' },
}

export function PackInspector({ selected, rows, year, isolate, onIsolate, onClose }: { selected: PackId | null; rows: InspectRow[]; year: number; isolate: boolean; onIsolate: () => void; onClose: () => void }) {
  if (!selected) return <div className="sr" aria-live="polite" />
  const i = INFO[selected]
  return (
    <aside className="insp glass" aria-live="polite">
      <div className="ih"><b>{i.name}</b><button className="x" onClick={onClose} aria-label="Close pack details">×</button></div>
      <span className="where">{i.where} · {i.modules} module{i.modules > 1 ? 's' : ''} shown</span>
      <table className="tbl"><thead><tr><th>At year {year.toFixed(1)}</th><th>Low</th><th>Median</th><th>High</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.p10.toFixed(1)}%</td><td><b>{r.p50.toFixed(1)}%</b></td><td>{r.p90.toFixed(1)}%</td></tr>)}</tbody></table>
      <button className="btn sm" aria-pressed={isolate} onClick={onIsolate}>{isolate ? 'Show all packs' : 'Isolate this pack'}</button>
      <p className="note">The model predicts one health figure for the whole pack, so every module shows the same number. Module layout and cell grid are a schematic, not a real design. Not yet validated on buses.</p>
    </aside>
  )
}
