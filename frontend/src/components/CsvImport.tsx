import { useRef, useState } from 'react'
import { deriveFromCsv, MAX_BYTES, type CsvResult } from '../lib/csv'
import { useScenario } from '../state/ScenarioContext'
import { toast } from './Toast'
import { hhmm } from '../lib/scenario'

export function CsvImport() {
  const s = useScenario()
  const input = useRef<HTMLInputElement>(null)
  const [res, setRes] = useState<(CsvResult & { name: string }) | null>(null)

  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (f.size > MAX_BYTES) { setRes({ derived: [], skipped: [], rows: 0, errors: ['File is larger than 1 MB.'], name: f.name }); return }
    setRes({ ...deriveFromCsv(await f.text(), s.scenario), name: f.name })
    if (input.current) input.current.value = ''
  }
  const apply = () => {
    if (!res) return
    const next = { ...s.scenario } as Record<string, unknown>
    for (const d of res.derived) next[d.key] = d.value
    s.replace(next as unknown as typeof s.scenario)
    setRes(null)
    toast(`Applied ${res.derived.length} values from your file`)
  }
  const fmt = (k: string, v: number) => (k.endsWith('_hour') ? hhmm(v) : String(v))
  return (
    <div className="csvp" id="csv-panel">
      <p>Fills in daily distance and charging times from your own CSV. It is read in your browser and never uploaded.</p>
      <div className="csvp-act">
        <button className="btn sm" onClick={() => input.current?.click()}>Choose CSV file</button>
        <a className="lnk" href="/samples/sample-fleet-duty-ILLUSTRATIVE.csv" download>Download a sample</a>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} aria-label="Duty CSV file" />
      </div>
      {res && (
        <div className="tip" style={{ margin: "12px 0 0" }} role="status">
          <b>{res.name}</b> · {res.rows} rows
          {res.errors.map((e) => <div className="err" key={e}>{e}</div>)}
          {res.derived.length > 0 && <table className="tbl" style={{ marginTop: 8 }}><tbody>
            {res.derived.map((d) => <tr key={d.key}><td title={d.how}>{d.label}</td><td>{fmt(d.key, d.value)}</td></tr>)}
          </tbody></table>}
          {res.skipped.map((x) => <div className="src" key={x}>Skipped. {x}</div>)}
          {res.derived.length > 0 && <div className="row2"><button className="btn primary sm" onClick={apply}>Apply to Bus A</button><button className="btn sm" onClick={() => setRes(null)}>Discard</button></div>}
          {res.derived.length === 0 && !res.errors.length && <div className="src">Nothing usable was found in this file.</div>}
        </div>
      )}
    </div>
  )
}
