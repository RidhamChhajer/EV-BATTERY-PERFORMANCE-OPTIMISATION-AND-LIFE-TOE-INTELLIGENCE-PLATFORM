"""Python-only end-to-end demo of the engine (no web code): both presets x all zones. Checks every number is labelled."""
import sys

from engine.bus.scenario import Scenario
from engine.cell.uncertainty import load_models, make_draws
from engine.decide.compare import compare
from engine.decide.cost import cost_per_km
from engine.decide.range import monthly_range
from engine.decide.replacement import replacement_window, simulate_scenario
from engine.labels import Labelled, walk_numbers

M = load_models()
D = make_draws(2000, M, seed=0)
bad = 0
for arch in ("12m", "9m"):
    for zone in ("hot_dry", "hot_humid", "composite", "cool"):
        s = Scenario.from_preset(arch, zone=zone, battery_cost_per_kwh_inr=12000)
        r = replacement_window(s, models=M, draws=D)
        sim = simulate_scenario(s, M, D)
        c, g = cost_per_km(sim, M, D), monthly_range(sim)
        nums = list(walk_numbers(r)) + list(walk_numbers(c)) + list(walk_numbers(g))
        bad += sum(not (isinstance(n, Labelled) and n.validated_on_buses is False and n.evidence_level != "lab") for n in nums)
        y = lambda x: "beyond horizon" if x is None else f"{x.value / 12:.1f}"
        print(f"{arch:>3} {zone:<10} replace p10/p50/p90 yrs: {y(r.months_p10)}/{y(r.months_p50)}/{y(r.months_p90)}  "
              f"cost/km p50: {c.cost_per_km_p50.value:.1f} INR  labelled numbers: {len(nums)}")
cmp_ = compare([Scenario.from_preset("12m"), Scenario.from_preset("12m", soc_max_pct=90)], models=M)
print("100%% vs 90%% charge cap: replacement delta p50 = %.1f months, P(later) = %.2f" % (cmp_.deltas[0].months_p50.value, cmp_.deltas[0].prob_variant_later.value))
print("unlabelled numbers:", bad)
sys.exit(1 if bad else 0)
