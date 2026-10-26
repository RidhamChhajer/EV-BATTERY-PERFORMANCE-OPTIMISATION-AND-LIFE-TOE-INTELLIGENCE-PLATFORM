export const STUDIES = {
  vehicle: {
    code: 'i3', label: 'Vehicle energy', source: 'BMW i3 driving records', domain: 'TUM_BMW_I3',
    scale: 'One vehicle · 70 trips', question: 'How does a recorded drive become a range estimate?',
    input: 'Voltage, current, temperatures, speed, heating power and elevation.',
    features: 'Recent 30/60-second driving behaviour, power, stopping and elevation change. Only past observations are used.',
    method: 'Ridge estimates sensor-only SOC. A calibrated current observer tracks SOC if a correct starting value is supplied. Random forest predicts next-minute Wh; Extra Trees predicts next-km Wh/km.',
    output: 'SOC, two energy forecasts, and conditional range',
    evaluation: '48 training, 7 validation and 15 test trips. Complete recording days stay in one split. Final fitting uses training plus validation.',
    limit: 'One source vehicle. Range assumes the configured usable capacity is correct and recent driving conditions continue. There is no independently measured full-depletion range MAE.',
    demo: 'Open TripA01, run it, then increase the usable-energy reserve from 10% to 20%. SOC and consumption should stay the same; available energy and range should decrease.',
    talk: 'The model forecasts consumption from the recent drive. We combine that forecast with estimated SOC and explicitly supplied usable energy to calculate conditional range.'
  },
  health: {
    code: 'LCO', label: 'Health & remaining life', source: 'CALCE CS2 ageing cells', domain: 'CALCE_CS2',
    scale: 'Six laboratory ageing cells', question: 'How can charging behaviour describe battery ageing?',
    input: 'A completed charge, an earlier charge reference from the same cell, age, and past health history.',
    features: 'Charge increments over 4.00–4.05 V and 4.05–4.10 V, normalised by the initial charge. Session statistics and age support SOH. Recent health slope and variability support RUL.',
    method: 'Two separate Ridge regressions with alpha 10: one estimates reference SOH, the other estimates remaining recorded cycles. Current discharge capacity is excluded from SOH predictors.',
    output: 'Reference SOH and remaining recorded cycle groups',
    evaluation: 'Nested battery-grouped development cross-validation. Whole cells are held out within folds. The six available cells have already been inspected; this is not a fresh independent test.',
    limit: 'SOH is relative to the first recorded valid capacity. RUL counts recorded groups until three valid observations confirm SOH at or below 80%; it does not predict EV years or kilometres.',
    demo: 'Open CS2_35 at recorded cycle 200. Run health and life together. Show the earlier calibration, the past health observations and the predicted current health.',
    talk: 'Health describes retained capacity, not how charged the battery is. We estimate it from a supported completed charge, then use its trajectory to estimate remaining recorded life.'
  },
  soc: {
    code: 'NMC', label: 'State of charge', source: 'CALCE NMC and BMW SOC references', domain: 'Separate SOC methods',
    scale: 'One lab cell · one source vehicle', question: 'Can we estimate charge without reading the answer?',
    input: 'Recent voltage, current and temperature; an optional known initial SOC selects vehicle current tracking.',
    features: 'Present voltage/current/temperature, 5/30-second averages, 30-second current variability and voltage change. Tracking instead integrates observed current from one known starting state.',
    method: 'Lab: histogram gradient boosting. Vehicle without a seed: Ridge. Vehicle with a correct seed: calibrated coulomb tracking. The three modes have different input requirements.',
    output: 'Percentage of the selected SOC reference',
    evaluation: 'Lab: FUDS/DST train, US06 validation, BJDST test at 25°C. Vehicle: complete held recording days. Mean errors are not interchangeable across the three methods.',
    limit: 'Lab SOC uses a coulomb-derived reference; vehicle SOC uses the reported BMS reference. The 0.098 pp tracking MAE requires a correct initial SOC and uninterrupted current history.',
    demo: 'Start with the BMW known-starting-SOC example. Then choose sensors only or CALCE lab, load the matching example, and explain why the model and reference change.',
    talk: 'Tracking starts from a known state and estimates the change. Sensor-only estimation must infer the absolute state from a recent measurement window, so it is a different task.'
  },
  charging: {
    code: 'LFP', label: 'Charging policy', source: 'Attia 2020 measured charging study', domain: 'ATTIA2020_LFP_10MIN',
    scale: '9 policies × 5 replicate cells', question: 'Which tested charge policy fits a current constraint?',
    input: 'A maximum C-rate and a choice of measured-mean or fitted-model ranking.',
    features: 'The four stage C-rates c1, c2, c3 and c4. Each stage covers 20% SOC. The fourth rate follows the fixed ten-minute 0–80% time budget.',
    method: 'A 100-tree random forest estimates study lifetime. The optimiser filters the nine tested policies by their peak rate. It ranks measured replicate means by default; fitted estimates are optional.',
    output: 'A feasible tested policy with lifetime evidence',
    evaluation: 'Nested held-policy development cross-validation. All five replicates of a policy stay together. Surrogate MAE is 112.77 study cycles versus 150.84 for the mean-life baseline.',
    limit: 'Separate A123 LFP study at 30°C. All policies have the same ten-minute 0–80% charge. This does not control hardware, search untested schedules, or personalise an EV lifetime gain.',
    demo: 'Run the default 6C example. Then set the limit to 4C and rerun: no tested policy is feasible. Restore 6C and compare measured ranking with fitted-model ranking.',
    talk: 'Optimisation here means filtering and ranking a finite tested set. The model estimates lifetime; the constraint decides which policies we are allowed to recommend.'
  }
};

export function guideView(selected = 'vehicle', stage = 0) {
  const s = STUDIES[selected];
  const names = ['Source data', 'Useful features', 'Model & output', 'Evaluation'];
  const copy = [s.input, s.features, s.method, s.evaluation];
  return `<section class="guide-board" aria-labelledby="guide-question">
    <div class="study-selector"><span class="eyebrow">CHOOSE A STUDY</span>${Object.entries(STUDIES).map(([key, item]) => `<button class="study-choice" data-study="${key}" aria-pressed="${selected === key}" disabled><span class="study-code">${item.code}</span><span><strong>${item.label}</strong><small>${item.scale}</small></span><span aria-hidden="true">↗</span></button>`).join('')}<p class="study-footnote">Separate datasets.<br>Separate scientific claims.</p></div>
    <div class="study-sheet"><div class="study-sheet-top"><span class="eyebrow">${s.source}</span><span class="domain-tag">${s.domain}</span></div><h2 id="guide-question">${s.question}</h2>
    <div class="pipeline-controls" role="group" aria-label="Project development stages">${names.map((name, i) => `<button class="pipeline-step" data-guide-step="${i}" aria-pressed="${stage === i}" disabled><span>${i + 1}</span>${name}</button>`).join('')}</div>
    <div class="pipeline-explanation" id="guide-stage"><span class="eyebrow">${names[stage]}</span><p>${copy[stage]}</p><div class="output-strip"><span>OUTPUT</span><strong>${s.output}</strong></div></div>
    <div class="guide-example"><div><span class="eyebrow">DEMONSTRATE IT</span><p>${s.demo}</p></div><button id="open-study" class="button primary" disabled>Open recorded example <span aria-hidden="true">→</span></button></div></div>
  </section>
  <section class="presentation-plan" aria-labelledby="presentation-title"><div><span class="eyebrow">YOUR PRESENTATION</span><h2 id="presentation-title">One recording. Four questions.</h2><p>Use the same explanation order in each analysis. The numbered stages describe the actual prediction workflow.</p></div><ol><li><strong>What are we measuring?</strong><span>Identify the source, units and reference.</span></li><li><strong>What does the model see?</strong><span>Separate past inputs from future labels.</span></li><li><strong>How is the estimate made?</strong><span>Name the method and run the real backend.</span></li><li><strong>What can we conclude?</strong><span>Read the result with its limits and evidence.</span></li></ol></section>
  <section class="glossary" aria-label="Battery terminology"><dl><div><dt>SOC</dt><dd>How charged the battery is now.</dd></div><div><dt>SOH</dt><dd>Retained capacity relative to a reference.</dd></div><div><dt>RUL</dt><dd>Recorded cycles to the defined health event.</dd></div><div><dt>C-rate</dt><dd>Current normalised by cell capacity.</dd></div></dl></section>
  <details class="presentation-notes"><summary>A short explanation you can use</summary><p>${s.talk}</p><p>${s.limit}</p><p>PL11 and other CALCE PL experiments are retained for comparison. They are not part of the active CS2 health model. Seven artifacts contain eight fitted estimators; range is a calculation.</p><a href="#models">View the measured errors and evaluation scope →</a></details>`;
}
