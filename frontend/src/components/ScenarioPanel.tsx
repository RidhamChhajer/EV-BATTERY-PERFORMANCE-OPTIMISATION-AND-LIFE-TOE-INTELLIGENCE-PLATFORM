import { useRef, useState } from 'react'
import { ApiClientError } from '../api/client'
import { usePredict, useZones } from '../api/hooks'
import { FIELDS, GROUPS, TARIFF_OPTIONS, ZONE_LABELS, ZONE_SUB, type FieldKey } from '../lib/scenario'
import { useScenario } from '../state/ScenarioContext'
import { FieldWithBadge } from './FieldWithBadge'
import { toast } from './Toast'
import { CsvImport } from './CsvImport'
import { useThumb } from '../lib/useThumb'
import { IconLink, IconReset, IconUpload } from './Icons'

export function ScenarioPanel({ drawer }: { drawer?: boolean }) {
  const s = useScenario()
  const zones = useZones()
  const p = usePredict(s.valid ? s.scenario : null)
  const serverFields: Record<string, string> = {}
  if (p.error instanceof ApiClientError) for (const f of p.error.fields) serverFields[f.field.replace(/^scenario\./, '')] = f.message
  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const segRef = useRef<HTMLDivElement>(null)
  const thumb = useThumb(segRef, '[aria-pressed=true]', s.scenario.archetype)

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast('Link copied') } catch { toast('Copy the address bar to share this scenario') }
  }
  return (
    <>
      {!drawer && <button className="scen-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}><span>Scenario</span><span style={{ fontSize: 13, color: 'var(--t2)', fontFamily: 'var(--body)' }}>{s.scenario.archetype} · {ZONE_LABELS[s.scenario.zone]} · {s.scenario.km_per_day} km</span></button>}
      <aside className={`scen${open ? ' open' : ''}${drawer ? ' in-drawer' : ''}`} aria-label="Scenario inputs">
        {!drawer && <header><h2>Scenario</h2></header>}
        <div className="scen-tools" role="toolbar" aria-label="Scenario actions">
          <button className="sbt" aria-expanded={importOpen} aria-controls="csv-panel" onClick={() => setImportOpen((o) => !o)}><IconUpload />Import CSV</button>
          <span className="sp" />
          <button className="sbt" aria-label="Reset to defaults" title="Reset every input to its default" onClick={s.reset}><IconReset />Reset</button>
          <button className="sbt" title="Copy a link that opens this scenario" onClick={copyLink}><IconLink />Copy link</button>
        </div>
        {importOpen && <CsvImport />}
        {s.notice && <div className="notice" role="status" style={{ margin: '10px 0' }}><span>{s.notice}</span><button className="btn sm" onClick={s.dismissNotice}>OK</button></div>}
        <div className="grp"><h3>Bus</h3>
          <div className="fld"><div className="l"><span id="bt">Bus type</span></div>
            <div className="seg" ref={segRef} role="group" aria-labelledby="bt"><span className="thumb" style={thumb} />
              {(['12m', '9m'] as const).map((a) => <button key={a} aria-pressed={s.scenario.archetype === a} onClick={() => s.setArchetype(a)}>{a === '12m' ? '12 m' : '9 m'}</button>)}
            </div>
            <div className="src">Changing bus type refreshes size, energy use, distance, charger and days; your other choices stay.</div>
          </div>
          {FIELDS.filter((f) => f.group === 'Bus').map((f) => <Field key={f.key} k={f.key} serverFields={serverFields} />)}
        </div>
        <div className="grp"><h3>Duty</h3>{FIELDS.filter((f) => f.group === 'Duty').map((f) => <Field key={f.key} k={f.key} serverFields={serverFields} />)}</div>
        <div className="grp"><h3>Charging</h3>{FIELDS.filter((f) => f.group === 'Charging').map((f) => <Field key={f.key} k={f.key} serverFields={serverFields} />)}</div>
        <div className="grp"><h3>Climate and heat</h3>
          <div className="fld"><div className="l"><label htmlFor="zone">Climate zone</label><span className="tag lab" title="Real NASA POWER air temperatures, 2015 to 2024">real weather</span></div>
            <select id="zone" className="sel" value={s.scenario.zone} onChange={(e) => s.setZone(e.target.value as typeof s.scenario.zone)}>
              {(zones.data?.zones.map((z) => z.id) ?? Object.keys(ZONE_LABELS)).map((z) => <option key={z} value={z}>{ZONE_LABELS[z]} · {ZONE_SUB[z]}</option>)}
            </select></div>
          {FIELDS.filter((f) => f.group === 'Climate and heat').map((f) => <Field key={f.key} k={f.key} serverFields={serverFields} />)}
        </div>
        {GROUPS.slice(4).map((g) => g === 'Electricity'
          ? <ElectricityGroup key={g} serverFields={serverFields} cost={p.data?.cost.electricity ?? null} />
          : <div className="grp" key={g}><h3>{g}</h3>{FIELDS.filter((f) => f.group === g).map((f) => <Field key={f.key} k={f.key} serverFields={serverFields} />)}</div>)}
        <p className="note">Every input here is a labelled assumption about the bus. The model re-runs automatically when they are valid.</p>
      </aside>
    </>
  )
}

function Field({ k, serverFields }: { k: FieldKey; serverFields: Record<string, string> }) {
  const s = useScenario()
  const meta = FIELDS.find((f) => f.key === k)!
  const v = s.scenario[k] as number | null
  return <FieldWithBadge meta={meta} value={v} error={s.errors[k]} serverError={serverFields[k]} onChange={(x) => s.setField(k, x)} />
}

type Elec = NonNullable<NonNullable<ReturnType<typeof usePredict>['data']>['cost']['electricity']>

/** Electricity the operator pays for. Off by default; the two Pune presets use the regulator's published rates, which the server holds with their sources. */
function ElectricityGroup({ serverFields, cost }: { serverFields: Record<string, string>; cost: Elec | null }) {
  const s = useScenario()
  const t = s.scenario.electricity_tariff
  const price = cost ? cost.price_inr_per_kwh.value as number : null, tod = cost ? cost.tod_change_pct.value as number : null
  return (
    <div className="grp"><h3>Electricity</h3>
      <div className="fld"><div className="l"><label htmlFor="tariff">Who you buy power from</label><span className="tag lab" title="Rates read from the regulator's published order">published rates</span></div>
        <select id="tariff" className="sel" value={t} onChange={(e) => s.setTariff(e.target.value as typeof t)}>
          {TARIFF_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div className="src">{t === 'none' ? 'Adds the cost of charging to cost per km. Maharashtra rates only for now.' : t === 'custom' ? 'Flat price all day, set below.' : 'MERC order, Case 75 of 2025 (25 March 2026), FY 2026-27. Energy plus wheeling charge; the time of day you charge shifts the energy charge (the evening-peak rate for EV is taken from MERC’s press note: check your first bill).'}</div>
        {cost && t !== 'custom' && price != null && tod != null && <div className="src" aria-live="polite">Effective price <b>₹{price.toFixed(2)} / kWh</b> for charging {cost.charge_window}{Math.abs(tod) >= 0.05 ? ` (${tod > 0 ? '+' : ''}${tod.toFixed(0)} % on the energy charge)` : ''}</div>}
      </div>
      {t === 'custom' && <Field k="electricity_custom_inr_per_kwh" serverFields={serverFields} />}
      {t === 'custom' && s.scenario.electricity_custom_inr_per_kwh == null && <div className="src">Enter your price to include electricity.</div>}
      {t !== 'none' && <Field k="charger_efficiency" serverFields={serverFields} />}
    </div>
  )
}
