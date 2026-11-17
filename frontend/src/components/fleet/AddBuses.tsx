import { useId, useRef, useState } from 'react'
import { hhmm, validateScenario } from '../../lib/scenario'
import { download } from '../../lib/download'
import { intakeFromRead, type Intake } from '../../lib/fleet/intake'
import { parseFleet } from '../../lib/fleet/io'
import { readAsync } from '../../lib/fleet/readAsync'
import { logTemplate, makeBatch, MAX_CHARS, rosterTemplate, scenarioForType, type Context } from '../../lib/fleet/roster'
import { sampleFleet } from '../../lib/fleet/sample'
import type { Scenario } from '../../api/types'
import type { Fleet, Source } from '../../lib/fleet/types'

export type Method = 'upload' | 'paste' | 'form'


const empty = (label: string, detail: string, extra: Partial<Intake>): Intake => ({ label, detail, source: 'entered', drafts: [], rejected: [], header: [], notes: [], ignoredColumns: [], ...extra })

export const sampleIntake = (ctx: Context): Intake => empty('Sample fleet', 'Synthetic, for demonstration: 60 buses, 3 depots', { fleet: sampleFleet(ctx.presets, new Date(ctx.nowMs)), name: 'Sample fleet' })

/** The doors into the fleet. Each one ends in the same call, onIntake, which opens the gate; none of them changes the fleet itself. */
export function AddBuses({ ctx, fleet, method, onMethod, onIntake }: { ctx: Context | null; fleet: Fleet | null; method: Method | null; onMethod: (m: Method | null) => void; onIntake: (i: Intake) => void }) {
  const methods: { id: Method; t: string }[] = [
    { id: 'upload', t: 'Upload a file' },
    { id: 'paste', t: 'Paste from a spreadsheet' },
    { id: 'form', t: 'Add buses by hand' },
  ]
  const m = method ?? 'upload'
  return (
    <div>
      <div className="seg tabs" role="group" aria-label="How to add buses">
        {methods.map((x) => <button key={x.id} aria-pressed={m === x.id} onClick={() => onMethod(x.id)}>{x.t}</button>)}
      </div>
      {m === 'upload' && <UploadPanel ctx={ctx} onIntake={onIntake} />}
      {m === 'paste' && <PastePanel ctx={ctx} onIntake={onIntake} />}
      {m === 'form' && <BatchForm ctx={ctx} fleet={fleet} onIntake={onIntake} />}
    </div>
  )
}

function Templates() {
  return (
    <p className="note">
      Templates: <button className="lnk" onClick={() => download('roster-template.csv', rosterTemplate())}>roster CSV</button> · <button className="lnk" onClick={() => download('duty-log-template.csv', logTemplate())}>duty-log CSV</button>.
      Only <code>bus_id</code> is required; what is missing is shown to you before anything is added.
    </p>
  )
}

function Problems({ errors }: { errors: string[] }) {
  return errors.length ? <div className="errbox" role="alert" style={{ marginTop: 12 }}>{errors.map((e) => <p key={e} style={{ margin: 0 }}>{e}</p>)}</div> : null
}

function UploadPanel({ ctx, onIntake }: { ctx: Context | null; onIntake: (i: Intake) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const onFile = async (f: File | undefined) => {
    if (!f || !ctx) return
    if (input.current) input.current.value = ''
    setErrors([])
    if (f.size > MAX_CHARS) { setErrors(['The file is larger than 20 MB.']); return }
    setBusy(true)
    try {
      const text = await f.text()
      if (/\.json$/i.test(f.name) || text.trimStart().startsWith('{')) {
        const p = parseFleet(text)
        if (!p.fleet) { setErrors(p.errors); return }
        onIntake(empty(f.name, `Fleet file, ${p.fleet.buses.length.toLocaleString('en-IN')} buses`, { fleet: p.fleet, name: p.fleet.name }))
        return
      }
      const r = await readAsync(text, ctx)
      if (!r.ok) { setErrors(r.errors); return }
      onIntake(intakeFromRead(f.name, r, ctx.screen))
    } catch { setErrors(['That file could not be read.']) } finally { setBusy(false) }
  }
  return (
    <div className="csvp meth-p">
      <div className={`drop${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]) }}>
        <b>Drop a file here</b>
        <button className="btn sm primary" disabled={!ctx || busy} onClick={() => input.current?.click()}>{busy ? 'Reading…' : 'Choose a file'}</button>
        <input ref={input} type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json" hidden aria-label="Fleet file" onChange={(e) => onFile(e.target.files?.[0])} />
        <span className="src">A roster or duty-log CSV, or a fleet file saved from this page. Read in this browser, never uploaded.</span>
      </div>
      <Templates />
      <Problems errors={errors} />
    </div>
  )
}

function PastePanel({ ctx, onIntake }: { ctx: Context | null; onIntake: (i: Intake) => void }) {
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const id = useId()
  const check = async () => {
    if (!ctx) return
    setErrors([])
    const r = await readAsync(text, ctx)
    if (!r.ok) { setErrors(r.errors); return }
    onIntake(intakeFromRead('Pasted cells', r, ctx.screen))
  }
  return (
    <div className="csvp meth-p">
      <label htmlFor={id} className="src" style={{ display: 'block', marginBottom: 6 }}>Paste the cells, header row first (tab, comma or semicolon separated)</label>
      <textarea id={id} className="paste" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'bus_id\tin_service\tdepot\troute\tbus_type\tkm_per_day\nB-101\t2023-07\tDepot A\tRoute 1\t12m\t210'} spellCheck={false} />
      <div className="row2" style={{ marginTop: 10 }}><button className="btn sm primary" disabled={!ctx || !text.trim()} onClick={check}>Check pasted cells</button></div>
      <Templates />
      <Problems errors={errors} />
    </div>
  )
}

type DutyFrom = 'screen' | 'class' | 'enter'
const dutyLabel = (s: Scenario) => `${s.archetype === '12m' ? '12 m' : '9 m'} · ${s.km_per_day} km/day · charge ${hhmm(s.charge_start_hour)}`

function Num({ label, value, onChange, unit, wide }: { label: string; value: string; onChange: (v: string) => void; unit?: string; wide?: boolean }) {
  const id = useId()
  return (
    <div className="fld" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label className="l" htmlFor={id}>{label}</label>
      <div className="inp"><input id={id} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" />{unit && <span className="u">{unit}</span>}</div>
    </div>
  )
}

const timeOf = (t: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] + +m[2] / 60 : null }

function BatchForm({ ctx, fleet, onIntake }: { ctx: Context | null; fleet: Fleet | null; onIntake: (i: Intake) => void }) {
  const [v, setV] = useState({ count: '20', prefix: 'B-', start: '101', depot: '', route: '', inService: '', from: 'screen' as DutyFrom, classId: '', type: '12m',
    km: '', charge: '', depart: '', cap: '', min: '' })
  const [errors, setErrors] = useState<string[]>([])
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }))
  const classes = fleet?.classes ?? []
  const typeBase = ctx ? scenarioForType(ctx.screen, ctx.presets, v.type) : null

  const go = () => {
    if (!ctx) return
    const errs: string[] = []
    let scenario: Scenario = ctx.screen
    let source: Source = 'entered'
    if (v.from === 'class') {
      const c = classes.find((x) => x.id === (v.classId || classes[0]?.id))
      if (!c) errs.push('Pick a duty class.'); else scenario = c.scenario
    } else if (v.from === 'enter' && typeBase) {
      const o: Record<string, number> = {}
      const take = (raw: string, key: string, label: string, parse: (s: string) => number | null = (s) => (s.trim() === '' ? null : Number(s))) => {
        if (raw.trim() === '') return
        const n = parse(raw)
        if (n == null || !Number.isFinite(n)) errs.push(`${label} is not a number${key.endsWith('_hour') ? ' or a time like 22:30' : ''}.`); else o[key] = n
      }
      take(v.km, 'km_per_day', 'Distance per day'); take(v.charge, 'charge_start_hour', 'Charging starts', timeOf); take(v.depart, 'departure_hour', 'Bus departs', timeOf)
      take(v.cap, 'soc_max_pct', 'Charge cap'); take(v.min, 'soc_min_pct', 'Minimum charge')
      scenario = { ...typeBase, ...o } as Scenario
    } else { source = 'assumed' }
    if (errs.length) { setErrors(errs); return }
    if (Object.keys(validateScenario(scenario)).length && v.from !== 'enter') { setErrors(['Fix the bus on screen first: its inputs are not valid.']); return }
    const count = Number(v.count), start = Number(v.start)
    const { drafts, errors: e } = makeBatch({ count, prefix: v.prefix, start, depot: v.depot, route: v.route, inService: v.inService, scenario, source }, fleet?.buses.map((b) => b.id) ?? [], ctx.nowMs)
    if (e.length) { setErrors(e); return }
    setErrors([])
    const first = drafts[0].id, last = drafts[drafts.length - 1].id
    onIntake(empty('Add buses form', `${drafts.length} ${drafts.length === 1 ? 'bus' : 'buses'}, ${first}${drafts.length > 1 ? ` to ${last}` : ''}`, {
      drafts, source: v.from === 'screen' ? 'assumed' : 'entered',
      missing: { age: v.inService.trim() ? 0 : drafts.length, dutyAssumed: v.from === 'screen' ? drafts.length : 0, dutyInherited: 0, type: 0, depot: v.depot.trim() ? 0 : drafts.length, route: v.route.trim() ? 0 : drafts.length, price: drafts.length },
    }))
  }

  return (
    <div className="csvp meth-p">
      <div className="bform">
        <Num label="How many buses" value={v.count} onChange={set('count')} />
        <Num label="Id prefix" value={v.prefix} onChange={set('prefix')} />
        <Num label="Start number" value={v.start} onChange={set('start')} />
        <Num label="Depot" value={v.depot} onChange={set('depot')} />
        <Num label="Route" value={v.route} onChange={set('route')} />
        <Num label="In service since" value={v.inService} onChange={set('inService')} unit="YYYY-MM" />
      </div>
      <div className="fld">
        <label className="l" htmlFor="duty-from">Duty (how they are driven and charged)</label>
        <select id="duty-from" className="sel" value={v.from} onChange={(e) => setV((s) => ({ ...s, from: e.target.value as DutyFrom }))}>
          <option value="screen">The bus on screen{ctx ? ` (${dutyLabel(ctx.screen)})` : ''}</option>
          {classes.length > 0 && <option value="class">The same as an existing duty class</option>}
          <option value="enter">Enter it now</option>
        </select>
      </div>
      {v.from === 'class' && (
        <div className="fld"><label className="l" htmlFor="duty-class">Duty class</label>
          <select id="duty-class" className="sel" value={v.classId || classes[0]?.id} onChange={(e) => set('classId')(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      )}
      {v.from === 'enter' && (
        <>
          <div className="fld"><div className="l" id="bt-l">Bus type</div>
            <div className="seg" role="group" aria-labelledby="bt-l" style={{ maxWidth: 220 }}>{['12m', '9m'].map((t) => <button key={t} aria-pressed={v.type === t} onClick={() => set('type')(t)} style={v.type === t ? { background: 'var(--volt)', color: 'var(--volt-ink)' } : undefined}>{t === '12m' ? '12 m' : '9 m'}</button>)}</div></div>
          <div className="bform">
            <Num label="Distance per day" value={v.km} onChange={set('km')} unit="km" />
            <Num label="Charging starts" value={v.charge} onChange={set('charge')} unit="hh:mm" />
            <Num label="Bus departs" value={v.depart} onChange={set('depart')} unit="hh:mm" />
            <Num label="Charge cap" value={v.cap} onChange={set('cap')} unit="%" />
            <Num label="Minimum charge" value={v.min} onChange={set('min')} unit="%" />
          </div>
          <p className="note" style={{ marginTop: 0 }}>Anything you leave empty is taken from the bus on screen. Other settings (battery size, charger power, climate zone) come from it too.</p>
        </>
      )}
      <Problems errors={errors} />
      <div className="row2"><button className="btn sm primary" disabled={!ctx} onClick={go}>Check these buses</button></div>
    </div>
  )
}
