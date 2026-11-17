import { Fine } from '../components/Fine'
import { useState } from 'react'
import { Async } from '../components/Async'
import { EvidenceBadge } from '../components/EvidenceBadge'
import { Insight } from '../components/Insight'
import { WhatIfBar } from '../components/WhatIfBar'
import { PriceCurve } from '../components/charts/PriceCurve'
import { ThresholdCurve, type LinePoint } from '../components/charts/ThresholdCurve'
import { WithTable } from '../components/DataTable'
import { Page } from '../components/Workspace'
import type { Scenario } from '../api/types'
import { fmt, inr, num } from '../lib/format'
import { anchorCost, breakEvenPrice, costAtThreshold, perThousand, scaleCost } from '../lib/costcalc'
import { costInsight, thresholdInsight } from '../lib/insights'
import { shareSentence, totalCost } from '../lib/totalcost'
import { routeNeedKm } from '../lib/routefit'
import { curves } from '../lib/results'
import type { WKey } from '../lib/whatif'
import { useScenario } from '../state/ScenarioContext'
import { useCurrent } from '../state/useCurrent'
import { useWhatIf } from '../state/WhatIfContext'

const NAMES: Record<string, [string, string]> = {
  'replacement threshold': ['Replacement line', 'moved ±0.05'], 'battery price per kWh': ['Battery price', 'moved ±20 %'], 'km per day': ['Distance per day', 'moved ±20 %'],
}
/** How each of the model's three tornado inputs maps to a scenario field and to the two values it tested (low = lowered). */
const LEVER: Record<string, (s: Scenario) => { key: WKey; low: number; high: number } | null> = {
  'battery price per kWh': (s) => (s.battery_cost_per_kwh_inr == null ? null : { key: 'battery_cost_per_kwh_inr', low: s.battery_cost_per_kwh_inr * 0.8, high: s.battery_cost_per_kwh_inr * 1.2 }),
  'replacement threshold': (s) => ({ key: 'threshold', low: Math.max(s.threshold - 0.05, 0.51), high: Math.min(s.threshold + 0.05, 0.94) }),
  'km per day': (s) => ({ key: 'km_per_day', low: s.km_per_day * 0.8, high: s.km_per_day * 1.2 }),
}
const DEFAULT_PRICE = 12000
const NOT_IN = 'electricity duty, the fuel adjustment charge, taxes and power-factor penalties.'
const tariffNote = (t: string, tod: number | null) => t === 'custom' ? 'Your price is applied flat, with no time-of-day change.' : tod == null || Math.abs(tod) < 0.05 ? 'The charging hours fall in the no-change time slot.' : `The hours you charge move the energy charge by ${tod > 0 ? '+' : ''}${tod.toFixed(0)} % (evening peak 17:00 to 24:00 is +20 %, solar hours 09:00 to 17:00 about −20 %, the rest 0 %; the peak rate for EV charging is taken from MERC’s press note, so check your first bill); charging later in the night avoids the peak.`

export default function Cost() {
  const { q, scenario } = useCurrent()
  const { setField, setTariff } = useScenario()
  const { set, reset, over, changed, busB, predB } = useWhatIf()
  const [target, setTarget] = useState<number | null>(null)
  return (
    <Page title="Battery cost per kilometre" intro="The pack price divided by the kilometres driven until it reaches the replacement line. No interest, inflation or resale value.">
      <Async q={q} h={300}>{(p) => {
        const c = p.cost, med = num(c.cost_per_km_p50), tor = c.tornado
        const basePrice = p.scenario.battery_cost_per_kwh_inr ?? null
        const price = scenario.battery_cost_per_kwh_inr ?? null
        const band = med != null && basePrice != null ? { p10: num(c.cost_per_km_p10) ?? med, p50: med, p90: num(c.cost_per_km_p90) ?? med } : null
        const now = band && basePrice != null && price != null ? scaleCost(band, price, basePrice) : null
        const be = now && price != null && target != null ? breakEvenPrice(price, now.p50, target) : null
        const top = tor[0] ? (NAMES[tor[0].input]?.[0] ?? tor[0].input).toLowerCase() : null
        const pack = num(c.battery_cost), lifeKm = num(c.lifetime_km_p50)
        const packNow = pack != null && price != null && basePrice != null && basePrice > 0 ? pack * (price / basePrice) : pack
        // cost against the replacement line: exact from the health curves, pinned to the engine's own answer at the line in use
        const newKm = num(p.range.new_pack_range_km), need = routeNeedKm(p.scenario.km_per_day), curPct = p.scenario.threshold * 100
        let line: { pts: LinePoint[]; optPct: number | null; needPct: number | null } | null = null
        if (now && packNow != null && packNow > 0 && newKm != null && newKm > 0) {
          const cv = curves(p.replacement), days = p.scenario.operating_days_per_year, kmDay = p.scenario.km_per_day
          const needPct = (need / newKm) * 100, optPct = needPct <= 90 ? Math.max(51, Math.ceil(needPct)) : null
          const lo = Math.min(60, Math.floor(curPct), optPct ?? 60), hi = Math.max(90, Math.ceil(curPct))
          const est = (pct: number) => costAtThreshold(cv, pct, packNow, kmDay, days), e0 = est(curPct)
          line = { needPct, optPct, pts: Array.from({ length: hi - lo + 1 }, (_, i) => { const pct = lo + i, e = est(pct); return { pct, ...anchorCost({ p10: e.p10, p50: e.p50, p90: e.p90 }, e0, now) } }) }
        }
        const elec = p.cost.electricity ?? null, elecKm = elec ? num(elec.cost_per_km) : null
        const tot = now ? totalCost(now, elecKm) : null
        const at = (pct: number) => line?.pts.find((q) => q.pct === pct) ?? null
        const tIns = line && newKm != null ? thresholdInsight({ curPct, optPct: line.optPct, hiPct: 90, needKm: need, newKm, curCost: now!.p50, optCost: line.optPct != null ? at(line.optPct)?.p50 ?? null : null }) : null
        const mx = Math.max(...tor.flatMap((t) => [num(t.low_case) ?? 0, num(t.high_case) ?? 0]), 0.0001), mn = Math.min(...tor.flatMap((t) => [num(t.low_case) ?? mx, num(t.high_case) ?? mx]), mx)
        const pos = (v: number) => `${((v - mn) / (mx - mn || 1)) * 100}%`
        return (
          <>
            {now && price != null && <Insight insight={costInsight({ perThousand: perThousand(price, now.p50), topInput: top, breakEven: be, target })} />}
            <section className="hero" aria-labelledby="cl-h">
              <div className="hh">
                <div><h2 id="cl-h">Cost against battery price</h2><div className="sub">Drag the dot, or use the slider, to set the price for the whole app</div></div>
                <EvidenceBadge level="derived" />
              </div>
              {!band || price == null ? (
                <div><p className="note">Enter a battery price to see cost per km.</p><button className="btn sm primary" onClick={() => setField('battery_cost_per_kwh_inr', DEFAULT_PRICE)}>Use ₹12,000 per kWh</button></div>
              ) : (
                <>
                  <div className="hero-row">
                    <div><div className="big"><span style={{ color: 'var(--volt)' }}>₹</span>{fmt(now!.p50, 2)}<small>/ km</small></div><div className="sub">median at ₹{Math.round(price).toLocaleString('en-IN')} per kWh · {inr(now!.p10, 2)} to {inr(now!.p90, 2)}</div></div>
                    <label className="tgt">Target cost per km
                      <input type="number" inputMode="decimal" min={0} step={0.1} placeholder={fmt(now!.p50 * 0.8, 1)} value={target ?? ''} onChange={(e) => setTarget(e.target.value === '' ? null : +e.target.value)} />
                      <small>{be != null ? `needs ₹${Math.round(be).toLocaleString('en-IN')} per kWh or less` : 'Type a goal to find the price that reaches it'}</small>
                    </label>
                  </div>
                  <PriceCurve band={band} basePrice={basePrice!} price={price} onPrice={(v) => setField('battery_cost_per_kwh_inr', v)} lo={Math.min(4000, Math.round(price * 0.8))} hi={Math.max(24000, Math.round(price * 1.2))} target={target} breakEven={be}
                    ghost={changed && predB.data && num(predB.data.cost.cost_per_km_p50) != null ? { price: busB.battery_cost_per_kwh_inr ?? price, p50: num(predB.data.cost.cost_per_km_p50)! } : null} />
                  <p className="note">The curve is exact: each run's cost is pack price ÷ kilometres driven, so every percentile scales with price. Life is held at the model's result for your other inputs. Not yet validated on buses.</p>
                </>
              )}
            </section>
            <WhatIfBar base={p} keys={['battery_cost_per_kwh_inr', 'threshold', 'km_per_day', 'soc_max_pct', ...(elecKm != null ? ['charge_start_hour' as const] : [])]}
              result={(alt) => { const tt = (x: typeof alt) => num(x.cost.total_cost_per_km_p50) ?? num(x.cost.cost_per_km_p50); const a = tt(alt), was = tt(p); return was != null && a != null ? <>{elecKm != null ? 'Total cost per km' : 'Cost per km'} <strong>{inr(a, 2)}</strong> (was {inr(was, 2)})</> : null }} />
            <div className="bento">
              <div className="card c5">
                <div className="hd"><div><h2>Cost per km</h2><div className="sub">Median, at ₹{scenario.battery_cost_per_kwh_inr?.toLocaleString('en-IN') ?? '–'} per kWh (your input)</div></div><EvidenceBadge level="derived" /></div>
                {med == null ? <p className="note">Enter a battery price in the scenario panel to see cost per km.</p> : <>
                  <div className="kpi"><span style={{ color: 'var(--volt)' }}>₹</span>{fmt(now?.p50 ?? med, 1)}<small>/ km</small></div>
                  <div className="row mt"><span>Range</span><b>{inr(now?.p10 ?? num(c.cost_per_km_p10))} to {inr(now?.p90 ?? num(c.cost_per_km_p90))}</b></div>
                  <div className="row"><span>Pack price</span><b>₹{fmt(((price != null && basePrice != null ? (pack ?? 0) * (price / basePrice) : pack) ?? 0) / 100000, 1)} lakh</b></div>
                  <div className="row"><span>Kilometres until replacement</span><b>{fmt((lifeKm ?? 0) / 1000)} thousand</b></div>
                </>}
                {c.warnings.length > 0 && <Fine count={c.warnings.length}>{c.warnings.map((w) => <p className="note" key={w}>{w}</p>)}</Fine>}
              </div>
              <div className="card c7">
                <div className="hd"><div><h2>Cost against the replacement line</h2><div className="sub">Replace later and each pack goes further, but the range left at replacement shrinks</div></div><EvidenceBadge level="derived" /></div>
                {!line || newKm == null ? <p className="note">Enter a battery price to see how cost changes with the replacement line.</p> : <>
                  <WithTable chart={<ThresholdCurve pts={line.pts} curPct={Math.round(curPct)} optPct={line.optPct} needPct={line.needPct} ghostPct={changed && busB.threshold !== scenario.threshold ? busB.threshold * 100 : null} />}
                    head={['Replace at (health %)', 'Median ₹/km', 'Low (10th pct) ₹/km', 'High (90th pct) ₹/km', 'Range left (km)', 'Covers route']}
                    rows={line.pts.filter((q) => q.pct % 5 === 0 || Math.round(curPct) === q.pct || q.pct === line!.optPct).map((q) => [q.pct, q.p50.toFixed(2), q.p10.toFixed(2), q.p90.toFixed(2), fmt((newKm * q.pct) / 100), (newKm * q.pct) / 100 >= need ? 'yes' : 'no'])} />
                  {tIns && <p className="tnote">{tIns.text}{tIns.action && <> <button className="btn sm" onClick={() => set(tIns.action!.key, tIns.action!.value)}>{tIns.action.label}</button></>}</p>}
                  <p className="note">The curve comes from the model's health curves, matched to the engine's own figure at your current line. The ring is the lowest line that still leaves enough range for your route. Not yet validated on buses.</p>
                </>}
              </div>
              <div className="card c12 runcost">
                <div className="hd"><div><h2>Cost to run the bus, per km</h2><div className="sub">Battery plus the electricity you pay for</div></div><EvidenceBadge level={elec ? 'assumption' : 'derived'} /></div>
                {!elec || !elecKm ? (
                  <div><p className="note">{scenario.electricity_tariff === 'custom' ? 'Enter your price per kWh in the scenario panel to include electricity.' : 'Charging has a bill too. Add Maharashtra electricity to see the total cost per km. Rates are the regulator’s published ones.'}</p>
                    {scenario.electricity_tariff === 'none' && <button className="btn sm primary" onClick={() => setTariff('msedcl_ht_ix')}>Add Pune electricity (MSEDCL HT IX)</button>}</div>
                ) : <>
                  {tot ? (
                    <>
                      <div className="rc-top"><div className="kpi"><span style={{ color: 'var(--volt)' }}>₹</span>{fmt(tot.total.p50, 1)}<small>/ km</small></div><div className="sub">Median total · {inr(tot.total.p10, 1)} to {inr(tot.total.p90, 1)} across the battery runs; electricity is one tariff, not a range</div></div>
                      <div className="rc-bar" role="img" aria-label={`Of ₹${tot.total.p50.toFixed(2)} per km, battery ₹${tot.battery.p50.toFixed(2)} and electricity ₹${tot.electricity.toFixed(2)}`}>
                        <i className="b" style={{ width: `${(1 - tot.electricityShare) * 100}%` }}><span>Battery {inr(tot.battery.p50, 2)}</span></i>
                        <i className="e" style={{ width: `${tot.electricityShare * 100}%` }}><span>Electricity {inr(tot.electricity, 2)}</span></i>
                      </div>
                      <p className="tnote">{shareSentence(tot)}</p>
                      <div className="row mt"><span>Battery per km</span><b>{inr(tot.battery.p50, 2)}</b></div>
                      <div className="row"><span>Electricity per km</span><b>{inr(tot.electricity, 2)}</b></div>
                    </>
                  ) : (
                    <>
                      <div className="rc-top"><div className="kpi"><span style={{ color: 'var(--volt)' }}>₹</span>{fmt(elecKm, 1)}<small>/ km electricity</small></div><div className="sub">Enter a battery price to add the battery and see the total</div></div>
                      <button className="btn sm primary" onClick={() => setField('battery_cost_per_kwh_inr', DEFAULT_PRICE)}>Use ₹12,000 per kWh</button>
                    </>
                  )}
                  <div className="row mt"><span>Energy from the grid</span><b>{fmt(num(elec.grid_kwh_per_km), 2)} kWh / km</b></div>
                  <div className="row"><span>Price per kWh</span><b>{inr(num(elec.price_inr_per_kwh), 2)}</b></div>
                  <div className="row"><span>Charging window</span><b>{elec.charge_window}</b></div>
                  <p className="note">Electricity per km = energy per km ÷ charger efficiency ({fmt(scenario.charger_efficiency * 100)} %) × price per kWh. {tariffNote(scenario.electricity_tariff, num(elec.tod_change_pct))} Left out: {NOT_IN} Held at today’s tariff for the life of the bus, undiscounted. The tariff is an assumption, not yet validated on buses.</p>
                </>}
              </div>
              <div className="card c12">
                <h2>What moves it most</h2><div className="sub">Median ₹ per km when one input is moved by the amount shown. The marker is today's cost.</div>
                {tor.length === 0 ? <p className="note">The sensitivity chart appears once a battery price is entered.</p> :
                  <div className="tor2">{tor.map((t) => {
                    const n = NAMES[t.input] ?? [t.input, ''], lo = num(t.low_case) ?? 0, hi = num(t.high_case) ?? 0, base = num(t.base) ?? med ?? 0
                    const lv = LEVER[t.input]?.(scenario), cheaperLow = lo <= hi
                    const cheap = Math.min(lo, hi), dear = Math.max(lo, hi)
                    return (
                      <div className="r" key={t.input}>
                        <div className="rh"><span>{n[0]} <span className="tag">{n[1]}</span></span><b>{inr(cheap, 2)} to {inr(dear, 2)}</b></div>
                        <div className="track" role="img" aria-label={`${n[0]}: cost per km from ₹${cheap.toFixed(2)} to ₹${dear.toFixed(2)}, today ₹${base.toFixed(2)}`}><i className="span" style={{ left: pos(cheap), width: `calc(${pos(dear)} - ${pos(cheap)})` }} /><i className="base" style={{ left: pos(base) }} /></div>
                        {lv && (() => {
                          const target = cheaperLow ? lv.low : lv.high, on = over[lv.key] != null && Math.abs((over[lv.key] as number) - target) < 1e-6
                          const val = (x: typeof p) => num(x.cost.total_cost_per_km_p50) ?? num(x.cost.cost_per_km_p50), was = val(p), alt = predB.data ? val(predB.data) : null
                          return (
                            <div className="acts">
                              <button className="btn sm" aria-pressed={on} onClick={() => (on ? reset() : set(lv.key, target))}>{on ? 'Undo' : 'Try the cheaper case'}</button>
                              {on && <span className="tried" role="status">{predB.isFetching || alt == null ? 'Working it out…' : was != null ? <>With this change: <b>{inr(alt, 2)}</b> per km (was {inr(was, 2)}). Also shown in Try a change above.</> : null}</span>}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}</div>}
              </div>
            </div>
          </>
        )
      }}</Async>
    </Page>
  )
}
