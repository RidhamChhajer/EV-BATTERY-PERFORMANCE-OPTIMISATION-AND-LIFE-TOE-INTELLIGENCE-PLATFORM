import { lazy, useCallback, useMemo, useState } from 'react'
import type { PresetResult } from '../api/types'
import { useCompare, usePredict, useRecommend } from '../api/hooks'
import { ErrorState, Skeleton } from '../components/Async'
import { BusBControls } from '../components/BusBControls'
import { EvidenceBadge } from '../components/EvidenceBadge'
import { HealthChart } from '../components/charts/HealthChart'
import { WithTable } from '../components/DataTable'
import { BusLetter, IconDetails, IconGoals, IconNotes, IconReport, IconView } from '../components/Icons'
import { ReportPanel } from '../components/ReportPanel'
import { NotesList } from '../components/NotesDrawer'
import { buildNotes, countAttention } from '../lib/notes'
import { Dock, DockButton, Drawer, DOCK_PX, Immersive, StatStrip, WIDE_QUERY, useWide, type Stat } from '../components/Overlay'
import { Fine } from '../components/Fine'
import { PresetCards } from '../components/PresetCards'
import { ScenarioPanel } from '../components/ScenarioPanel'
import { YearScrubber, type CompareLine } from '../components/YearScrubber'
import { DayScrubber } from '../components/DayScrubber'
import { LensSwitch } from '../components/LensSwitch'
import { buildSceneParams } from '../lib/sceneParams'
import { insightLine } from '../lib/insight'
import { lifeValue, valueLine } from '../lib/money'
import { useScopeSize } from '../state/scope'
import { ChangeBar } from '../components/ChangeBar'
import { applyOverrides, diffLevers, hasChanges, lifeChange, sameLevers, signed, sliderSpecs, stageFor, type LeverKey, type Overrides } from '../lib/busB'
import { atYear, fmt, inr, num } from '../lib/format'
import { curves, repYears, xMaxFor } from '../lib/results'
import { validateScenario } from '../lib/scenario'
import { useScenario } from '../state/ScenarioContext'
import { useYear } from '../state/YearContext'
import type { BusSpec } from '../three/BusStage'
import { CompareLegend, LensLegend, type CompareMode } from '../three/Legend'
import { BASELINE_RGB, diffRGB } from '../lib/colors'
import { PackInspector } from '../three/PackInspector'
import { ViewPanel } from '../three/ViewPanel'
import { useViewState } from '../three/viewState'

const BusViewer = lazy(() => import('../three/BusViewer').then((m) => ({ default: m.BusViewer })))
const Z = 3.1
type Panel = 'a' | 'b' | 'goals' | 'details' | 'view' | 'notes' | 'report' | null
const WIDTH: Record<Exclude<Panel, null>, number> = { a: 340, b: 340, goals: 440, details: 460, view: 300, notes: 380, report: 360 }
const tone = (x: number, eps: number): 'up' | 'down' | 'none' => (x > eps ? 'up' : x < -eps ? 'down' : 'none')

export default function Optimise() {
  const { scenario, valid, errors } = useScenario()
  const { year } = useYear()
  const wide = useWide()
  const [over, setOver] = useState<Overrides>({})
  const [confirm, setConfirm] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [view, api] = useViewState('cmp')
  // On a wide screen the Bus B sliders start open beside the scene; on a phone the scene starts clear.
  const [panel, setPanel] = useState<Panel>(() => (typeof matchMedia === 'function' && matchMedia(WIDE_QUERY).matches ? 'b' : null))
  const [cmpMode, setCmpMode] = useState<CompareMode>('diff')
  const shown: Panel = valid ? panel : 'a'
  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p))
  const close = useCallback(() => setPanel(null), [])

  // Bus B = Bus A plus the levers that really differ
  const eff = useMemo(() => diffLevers(scenario, applyOverrides(scenario, over)), [scenario, over])
  const changed = hasChanges(eff)
  const busB = useMemo(() => applyOverrides(scenario, eff), [scenario, eff])
  const bOk = valid && Object.keys(validateScenario(busB)).length === 0
  const run = changed && bOk

  const [fleet] = useScopeSize()
  const predA = usePredict(valid ? scenario : null)
  const predB = usePredict(run ? busB : null)
  const cmp = useCompare(run ? scenario : null, run ? busB : null)
  const rec = useRecommend(valid ? scenario : null)

  const setLever = useCallback((k: LeverKey, v: number) => setOver((o) => ({ ...o, [k]: v })), [])
  const reset = useCallback(() => { setOver({}); setPickedId(null) }, [])
  // the goal the user chose stays highlighted for as long as Bus B still matches it (several goals can give identical advice)
  const appliedId = useMemo(() => {
    const p = rec.data?.presets.find((x) => x.id === pickedId)
    return p && hasChanges(eff) && sameLevers(eff, diffLevers(scenario, stageFor(p, confirm).scenario)) ? p.id : null
  }, [rec.data, pickedId, eff, scenario, confirm])
  const pick = useCallback((p: PresetResult) => {
    setPickedId(p.id)
    setOver(diffLevers(scenario, stageFor(p, confirm).scenario))
    setPanel(null)   // clear the way so the change on Bus B is visible straight away
  }, [scenario, confirm])

  // Allowing cooling and energy-use changes while a goal is on Bus B re-applies that goal with the matching stage, so Bus B never silently lags the toggle.
  const toggleConfirm = useCallback((on: boolean) => {
    setConfirm(on)
    const p = rec.data?.presets.find((x) => x.id === appliedId)
    if (p) setOver(diffLevers(scenario, stageFor(p, on).scenario))
  }, [rec.data, appliedId, scenario])

  const lengthM = scenario.archetype === '9m' ? 9 : 12
  const pa = valid ? predA.data : undefined
  const f = rec.data?.feasibility
  const goalLabel = rec.data?.presets.find((x) => x.id === appliedId)?.title ?? null

  // everything derived from the model, only once Bus A has results
  let stats: Stat[] = [], busy = false
  let notes: ReturnType<typeof buildNotes> = []
  let buses: BusSpec[] = [], cA = null as ReturnType<typeof curves> | null, cB = cA, xMax = 8, y = 0, r: ReturnType<typeof repYears> = [null, null, null]
  let other: CompareLine | undefined
  let hA = 0, hB = 0, d: NonNullable<typeof cmp.data>['deltas'][number] | null = null
  const line = scenario.threshold * 100
  if (pa) {
    const usingB = run && !!cmp.data && !!predB.data
    busy = run && !usingB
    const rA = usingB ? cmp.data!.replacements[0] : pa.replacement, rB = usingB ? cmp.data!.replacements[1] : pa.replacement
    const pb = usingB ? predB.data! : pa
    cA = curves(rA); cB = curves(rB); xMax = xMaxFor(pa); y = Math.min(year, xMax)
    hA = atYear(cA.p50, y); hB = atYear(cB.p50, y)
    const mB = num(rB.months_p50)
    d = usingB ? cmp.data!.deltas[0] : null
    const hasElec = pa.cost.electricity != null, totalOf = (x: typeof pa) => num(x.cost.total_cost_per_km_p50) ?? num(x.cost.cost_per_km_p50)
    const costA = hasElec ? totalOf(pa) : num(pa.cost.cost_per_km_p50), costB = hasElec ? totalOf(pb) : num(pb.cost.cost_per_km_p50)
    const rngA = (num(pa.range.new_pack_range_km) ?? 0) * scenario.threshold, rngB = (num(pb.range.new_pack_range_km) ?? 0) * scenario.threshold
    const need = f ? (f.base_passes ? num(f.required_range_km) : num(f.base_range_at_replacement_km)) : null
    const tight = usingB && need != null && rngB < need - 0.5
    const life = d ? lifeChange(num(d.months_p50) ?? 0, num(d.months_p10) ?? 0, num(d.months_p90) ?? 0, d.p90_beyond_horizon) : null
    r = repYears(rA)
    const tightText = f?.base_passes
      ? `When the pack is due for replacement Bus B could drive about ${fmt(rngB)} km on a charge, but your route needs ${fmt(need)} km (route plus a 20 % reserve). Raise the charge cap or shorten the route before using this setting.`
      : `Bus A is already below the reserve on this route, so presets are held to Bus A's own range (${fmt(need)} km). Bus B drops below that, at about ${fmt(rngB)} km.`
    notes = buildNotes({ a: pa, b: usingB ? pb : null, routeTight: f && !f.base_passes ? f.plain : null, bGivesUpRange: tight ? tightText : null })
    const dPts = hB - hA, same = 'Same as Bus A', none = undefined
    // Difference view: Bus A is the grey baseline and Bus B is coloured by how far it is from A. Until Bus B differs there is nothing to show, so health colours stay.
    const diff = cmpMode === 'diff' && changed
    const mDelta = d ? num(d.months_p50) ?? 0 : 0
    const badges: BusSpec['badges'] = usingB ? [
      ...(Math.abs(mDelta) >= 0.5 ? [{ text: Math.abs(mDelta) >= 24 ? `${signed(mDelta / 12, 1)} years` : `${signed(mDelta, Math.abs(mDelta) < 10 ? 1 : 0)} ${Math.abs(Number(mDelta.toFixed(1))) === 1 ? 'month' : 'months'}`, tone: tone(mDelta, 0.5) }] : []),
      ...(Math.abs(dPts) >= 0.05 ? [{ text: `${signed(dPts, 1)} pts`, tone: tone(dPts, 0.05) }] : []),
    ] : []
    buses = [
      { key: 'a', label: 'Bus A', healthPct: hA, offsetZ: -Z, rgb: diff ? BASELINE_RGB : undefined, clock: r[1] == null ? null : { years: r[1], frac: Math.min(1, r[1] / xMax) }, scene: buildSceneParams(scenario, pa, y, null, rA), attention: countAttention(notes) > 0 },
      { key: 'b', label: 'Bus B', healthPct: hB, offsetZ: Z, packLabels: false, rgb: diff ? diffRGB(dPts) : undefined, badges, pulseKey: usingB ? String(cmp.dataUpdatedAt) : 'same', scene: buildSceneParams(busB, pb, y, null, rB), changed: Object.keys(eff), clock: usingB && repYears(rB)[1] != null ? { years: repYears(rB)[1]!, frac: Math.min(1, repYears(rB)[1]! / xMax) } : null },
    ]
    if (usingB) other = { p50: cB.p50, aYear: r[1], bYear: repYears(rB)[1] }
    stats = [
      { label: `Health, year ${y.toFixed(1)}`, value: fmt(hB, 1), unit: '%', sub: changed ? (Math.abs(dPts) < 0.05 ? same : `${signed(dPts, 1)} points`) : none, tone: changed ? tone(dPts, 0.05) : 'none' },
      { label: 'Replace around', value: mB == null ? '–' : fmt(mB / 12, 1), unit: 'years', sub: life ? life.headline : (changed ? same : none), tone: d ? tone(num(d.months_p50) ?? 0, 0.05) : 'none' },
      { label: hasElec ? 'Cost per km, with electricity' : 'Cost per km', value: costB == null ? '–' : inr(costB, 2), sub: costA == null || costB == null ? 'Enter a battery price' : !changed ? none : Math.abs(costB - costA) < 0.005 ? same : `${costB < costA ? '−' : '+'}₹${Math.abs(costB - costA).toFixed(2)} per km`, tone: costA != null && costB != null ? tone(costA - costB, 0.005) : 'none' },
      { label: 'Range at replacement', value: fmt(rngB), unit: 'km', sub: !changed ? none : tight ? 'Below the reserve' : Math.abs(rngB - rngA) < 0.5 ? same : signed(rngB - rngA, 0, ' km'), tone: tight ? 'down' : tone(rngB - rngA, 0.5) },
    ]
  }
  const chips = changed ? sliderSpecs(scenario).filter((sp) => eff[sp.key] != null).map((sp) => ({ key: sp.key as string, text: `${sp.label} ${sp.fmt(scenario[sp.key] as number)} → ${sp.fmt(eff[sp.key] as number)}` })) : []
  const rows = cA && cB ? [{ label: 'Bus A', p10: atYear(cA.p10, y), p50: hA, p90: atYear(cA.p90, y) }, { label: 'Bus B', p10: atYear(cB.p10, y), p50: hB, p90: atYear(cB.p90, y) }] : []
  // rupees only when both buses have a measurable median and the same battery price: first pack only, undiscounted
  const packA = pa ? num(pa.cost.battery_cost) : null, packB = predB.data ? num(predB.data.cost.battery_cost) : null
  const money = pa && predB.data && cmp.data && packA != null && packB != null && Math.abs(packA - packB) < 1 ? valueLine(lifeValue(packA, num(cmp.data.replacements[0].months_p50), num(cmp.data.replacements[1].months_p50)), fleet) : null
  const insight = buses.length === 2 && buses[0].scene && buses[1].scene && changed ? insightLine({ lifeHeadline: d ? lifeChange(num(d.months_p50) ?? 0, num(d.months_p10) ?? 0, num(d.months_p90) ?? 0, d.p90_beyond_horizon).headline : null, a: buses[0].scene.day, b: buses[1].scene.day, unfinishedB: buses[1].scene.unfinishedCharge, money: money }) : null
  const inset = wide && shown ? DOCK_PX + WIDTH[shown] : 0

  const stage = pa
    ? <BusViewer buses={buses} lengthM={lengthM} linePct={line} view={view} api={api} insetLeft={inset}
        ariaLabel={`3D comparison of two ${lengthM} metre electric buses. Bus A battery health ${fmt(hA, 0)} percent, Bus B ${fmt(hB, 0)} percent at year ${y.toFixed(1)}`} />
    : <div className="skel full" aria-busy="true" aria-label="Loading…" />

  const routeSentence = f && (
    <div className={`route${f.base_passes ? '' : ' warn'}`} role="note">
      <p className="route-h"><i aria-hidden="true" />{f.base_passes ? 'Your route fits' : 'Range is already tight'}
        <span>{fmt(num(f.base_range_at_replacement_km))} km at replacement · route needs {fmt(num(f.required_range_km))} km</span></p>
      <Fine label="What this means">
        <p className="note">{f.plain}</p>
        <p className="note">{f.rule_applied}</p>
      </Fine>
    </div>
  )

  return (
    <Immersive stage={stage}>
      <div className="imm-top">
        <div className="imm-tl">
          <Dock>
            <DockButton label="Bus A" active={shown === 'a'} onClick={() => toggle('a')}><BusLetter l="A" /></DockButton>
            <DockButton label="Bus B" active={shown === 'b'} onClick={() => toggle('b')}><BusLetter l="B" /></DockButton>
            <DockButton label="Goals" active={shown === 'goals'} onClick={() => toggle('goals')}><IconGoals /></DockButton>
            <DockButton label="Details" active={shown === 'details'} onClick={() => toggle('details')}><IconDetails /></DockButton>
            <DockButton label="View" active={shown === 'view'} onClick={() => toggle('view')}><IconView /></DockButton>
 <DockButton label="Report" active={shown === 'report'} onClick={() => toggle('report')}><IconReport /></DockButton>
            <DockButton label="Notes" active={shown === 'notes'} onClick={() => toggle('notes')} badge={countAttention(notes)}><IconNotes /></DockButton>
          </Dock>
        </div>
        <div className="imm-tr">
          {pa && <StatStrip title="Bus B" hint={changed ? undefined : 'Change Bus B to compare'} stats={stats} busy={busy} />}
          <PackInspector selected={view.selected} rows={rows} year={y} isolate={view.isolate} onIsolate={api.toggleIsolate} onClose={() => api.select(null)} />
        </div>
      </div>

      <Drawer open={shown === 'a'} title="Bus A · your scenario" width={WIDTH.a} onClose={close}>
        {!valid && <p className="note" role="alert">Fix {Object.keys(errors).length} input{Object.keys(errors).length > 1 ? 's' : ''} to run the model: {Object.keys(errors).join(', ')}.</p>}
        <ScenarioPanel drawer />
      </Drawer>
      <Drawer open={shown === 'b'} title="Bus B · your changes" width={WIDTH.b} onClose={close}>
        <BusBControls a={scenario} over={eff} setLever={setLever} reset={reset} goalLabel={goalLabel} onOpenGoals={() => setPanel('goals')} />
      </Drawer>
      <Drawer open={shown === 'goals'} title="Pick a goal" width={WIDTH.goals} onClose={close}>
        {routeSentence}
        <label className="switch"><input type="checkbox" checked={confirm} onChange={(e) => toggleConfirm(e.target.checked)} /><span>Include changes that need your confirmation (cooling, energy use)</span></label>
        {rec.data
          ? <>
              <PresetCards rec={rec.data} includeConfirm={confirm} appliedId={appliedId} onTry={pick} />
              {rec.data.notes.length + rec.data.warnings.length > 0 && <Fine label="Notes on these suggestions" count={rec.data.notes.length + rec.data.warnings.length}>{[...rec.data.notes, ...rec.data.warnings].map((n) => <p className="note" key={n}>{n}</p>)}</Fine>}
            </>
          : rec.error ? <ErrorState error={rec.error} onRetry={() => rec.refetch()} /> : <Skeleton h={260} />}
      </Drawer>
      <Drawer open={shown === 'details'} title="Details" width={WIDTH.details} onClose={close}>
        {cA && cB ? (
          <div className="dd">
            <section>
              <h3>Health over time</h3>
              <p className="sub">{d ? `Bus B lasts longer in ${fmt((num(d.prob_variant_later) ?? 0) * 100)}% of reference runs.` : 'Change Bus B to see how it compares.'} Yellow line and band: Bus A. White dashed line: Bus B.</p>
              <EvidenceBadge level="derived" />
              <WithTable chart={<HealthChart {...cA} thresholdPct={line} medianYear={r[1]} xMax={xMax} other={changed ? cB.p50 : undefined} label="Battery health of Bus A with its range, and the median health of Bus B" />}
                head={['Year', 'Bus A median %', 'Bus B median %']}
                rows={Array.from({ length: Math.round(xMax) + 1 }, (_, i) => [i, fmt(cA!.p50[i * 12]), fmt(cB!.p50[i * 12])])} />
            </section>
            <section>
              <h3>What we did not change, and why</h3>
              <p className="sub">Levers the search left alone</p>
              {rec.data ? <ul className="notused">{rec.data.not_used.map((n) => <li key={n.lever}><b>{n.lever}</b><span>{n.reason}</span></li>)}</ul> : <Skeleton h={120} />}
            </section>
          </div>
        ) : <Skeleton h={200} />}
      </Drawer>
      <Drawer open={shown === 'report'} title="Send report" width={WIDTH.report} onClose={close}>
        <ReportPanel a={scenario} b={busB} ready={valid && changed} changes={chips.map((c) => c.text)} />
      </Drawer>
      <Drawer open={shown === 'notes'} title="Notes" width={WIDTH.notes} onClose={close}>
        <NotesList notes={notes} />
      </Drawer>
      <Drawer open={shown === 'view'} title="View" width={WIDTH.view} onClose={close}>
        <ViewPanel view={view} api={api} compare />
      </Drawer>

      {valid && !pa && predA.error != null && <div className="imm-center"><ErrorState error={predA.error} onRetry={() => predA.refetch()} /></div>}

      {pa && cA && (
        <div className="imm-bottom">
          {chips.length > 0
            ? <ChangeBar chips={chips} insight={insight} onHover={api.hoverLever} />
            : !view.selected && <p className="imm-hint">Click a battery pack for its health · drag to turn · scroll to zoom</p>}
          <LensSwitch lens={view.lens} api={api} />
          <div className="imm-row">
            {view.lens === 'charge' && buses[0].scene
              ? <DayScrubber day={buses[0].scene.day} other={changed ? buses[1].scene?.day : undefined} />
              : view.lens === 'heat' ? null : <YearScrubber p10={cA.p10} p50={cA.p50} p90={cA.p90} thresholdPct={line} xMax={xMax} win={[r[0], r[2]]} other={other} />}
            {view.lens === 'health'
              ? <CompareLegend mode={cmpMode} onMode={setCmpMode} linePct={line} idle={!changed} />
              : <LensLegend lens={view.lens} linePct={line} tempRange={buses[1].scene ? [Math.min(...buses[1].scene.cellTempC), Math.max(...buses[1].scene.cellTempC)] : undefined} />}
          </div>
        </div>
      )}
    </Immersive>
  )
}
