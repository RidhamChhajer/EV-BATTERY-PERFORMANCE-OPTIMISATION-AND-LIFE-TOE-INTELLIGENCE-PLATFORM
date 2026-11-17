import type { components } from './schema'

type S = components['schemas']
export type Scenario = S['Scenario']
export type Labelled = S['Labelled']
export type PredictionResult = S['PredictionResult']
export type CompareResult = S['CompareResult']
export type RecommendResponse = S['RecommendResponse']
export type PresetResult = S['PresetResult']
export type Stage = S['Stage']
export type Metrics = S['Metrics']
export type LeverChange = S['LeverChange']
export type ReplacementResult = S['ReplacementResult']
export type LoginResponse = S['LoginResponse']

/** Reference endpoints are not typed in OpenAPI (plain dicts), so their shapes live here. */
export type FieldSpec = { value: Labelled; range?: Labelled }
export type ArchetypePreset = { id: string; label: string; fields: Record<string, FieldSpec>; scenario: Scenario }
export type PresetsResponse = { mode: 'prior'; presets: ArchetypePreset[] }
export type ZoneMonth = { month: number; tmean_c: number; tmax_mean_c: number; tmin_mean_c: number; tmax_p95_c: number; diurnal_range_c: number; n_days: number }
export type Zone = { id: string; label: string; elevation_m: number; lat: number; lon: number; monthly: ZoneMonth[] }
export type ZonesResponse = { period: string; note: string; provenance: { source_url: string; licence: string; attribution: string; limitations: string; synthetic: boolean }; zones: Zone[] }
export type Dataset = { id: string; used_for: string; chemistry?: string; licence: string; limitations: string; source_url: string; synthetic: boolean; retrieved_for_project: string }
export type CalibrationRun = { results: { n_labels: number; prior_mape: number; no_pooling_mape: number; partial_pooling_mape: number; vehicles_not_worse_pct: number }[]; tau_ah: number; sigma_ah: number; vehicles_evaluated: number }
export type ReferenceModel = {
  id: string; label: string; package_class: string; nominal_ah: number; n_parameters: number; structure: string; data: string; data_sources: string[]
  tested_range: { cycling_temperature_c: [number, number]; depth_of_discharge: [number, number]; max_charge_c_rate: number; max_discharge_c_rate: number }
}
export type PortCheck = { package_version: string; scenarios_compared: number; bus_duty_max_diff_points: number; fixed_condition_max_diff_points: number; fixed_conditions_compared: number }
export type ReferenceEngine = {
  name: string; version: string; source_url: string; licence: string; models: ReferenceModel[]
  ensemble: { models: number; degradation_scalars: number; pack_penalty_values: number; runs_per_scenario: number; degradation_scalar_std: number; scalar_note: string; pack_penalty_note: string }
  port_check: PortCheck | null
}
export type EvidenceResponse = {
  mode: 'prior'
  engine: 'reference' | 'lab'
  validated_on_buses: false
  model_version: string
  reference_engine: ReferenceEngine
  datasets: Dataset[]
  metrics: {
    calendar_validation: { cross_lab: Record<string, { conditions: number; mae_all: number; mae_within_train_horizon: number }>; overlap: string; passes_threshold: boolean; threshold: number }
    early_life: { candidates: { model: string; mape: number; within15: number }[]; improvement_vs_mean_pct_points: number; improvement_ci95: [number, number]; winner: string }
    evbattery_capacity: { mileage_only: { mape: number; within5: number }; snippet_features: { mape: number; within5: number }; chemistry: string; caveat: string; split: string }
    calibration_demo: { with_snippet_features: CalibrationRun; mileage_only: CalibrationRun; vehicles: number; rows: number; split: string; evaluation: string; chemistry: string; caveat: string }
    uncertainty: { calendar: { coverage_point_weighted: number; coverage_condition_mean: number }; cycle: { coverage_cell_mean: number; coverage_point_weighted: number; n_cells: number } }
  }
  uncertainty: { extrapolation_widening: number; extrapolation_widening_note: string; nominal_band: string }
  training_coverage: { cycling_temperature_c: [number, number]; cycling_c_rate: [number, number]; cycling_efc_max: number }
  limitations: string[]
}
