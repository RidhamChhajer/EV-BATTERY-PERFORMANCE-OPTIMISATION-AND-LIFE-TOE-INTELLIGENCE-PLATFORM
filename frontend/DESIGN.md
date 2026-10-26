---
version: alpha
name: Cellwise
description: An automotive battery analysis workbench with an isometric charge instrument.
colors:
  primary: "#a04420"
  ink: "#233746"
  rail: "#253c50"
  background: "#e6e9ec"
  surface: "#f8f9fa"
  mint: "#d9e1e8"
  accent: "#efad7d"
  muted: "#52616d"
  border: "#bdc8d0"
  danger: "#a52d35"
  warning: "#77521e"
  focus: "#236fa0"
typography:
  body:
    fontFamily: "Segoe UI, Arial, sans-serif"
  display:
    fontFamily: "Bahnschrift, Arial Narrow, sans-serif"
  mono:
    fontFamily: "Consolas, Cascadia Mono, monospace"
rounded:
  DEFAULT: "4px"
  control: "3px"
spacing:
  section-gap: "22px"
  page-max: "1440px"
components:
  button: {}
  field: {}
  notice: {}
  telemetry-chart: {}
---

# Cellwise design context

## Overview

A local battery research workbench for recorded telemetry and model evaluation. English with en-GB numbers. The job is to open a recorded example, inspect its inputs, explain causal features and methods, run the real backend and interpret outputs with their scientific limits.

The interface takes its proportions from benchtop equipment: horizontal navigation, a blue instrument face, a silver chassis and copper electrical contacts. The signature is an isometric battery charge scale, integrated with the recording label and estimates. The diagram represents returned aggregate SOC; it does not claim individual-cell telemetry or the physical layout of a BMW pack. No slogans, ornamental numbering, stock imagery, generic marketing hero or simulated live activity.

The charge instrument and four output channels share one bordered assembly. Measured traces, references and parameters follow in reading order.

Frontend is its own removable project root. Canonical runtime values live in `tokens.css`; this file mirrors them and `tests/core.test.mjs` checks their exact color mapping. `styles.css` consumes tokens. No backend changes, external fonts or new runtime dependencies.

## Colors

Copper primary (#a04420) marks run actions, active navigation and measured chart traces. Ink (#233746) carries text. Rail (#253c50), retained as a stable token name, now owns the instrument face rather than navigation. Silver background (#e6e9ec) and surface (#f8f9fa) define the equipment chassis. Accent (#efad7d) illuminates the charge scale on blue. The legacy mint token now means cool panel trim (#d9e1e8), not a green surface. Danger and warning always accompany text; an estimated result is never labelled healthy without supporting evidence.

## Typography

Bahnschrift display gives headings and readouts the condensed proportions of equipment labels, at restrained weights. Segoe UI is the body and control family. Consolas carries units, identifiers and raw responses. Families are available locally with fallbacks, so no font-loading layout shift occurs. Tabular numeric formatting is en-GB. SVG charts expose time boundaries and min/max readings in accessible text.

## Layout

The Project guide is the default entry. Its source selector and connected four-stage development sequence form one workbench; numbered stages encode actual process order rather than decoration. A full-width masthead and horizontal navigation frame six routes. Max content width 1440px, document-owned vertical scrolling. The vehicle instrument and two-by-two output matrix share one board at desktop width. Below 800px the board stacks; below 560px its outputs return to two columns and chart/reference regions stack. The masthead remains compact while navigation owns horizontal overflow. Parameters use a natural-height form. At most nine charging policies appear in a native table with its own horizontal scrolling. Section gap 22px. No viewport-height clipping.

## Elevation & Depth

The blue instrument is inset visually within the silver workspace. Depth comes only from the isometric diagram; surfaces use borders and spacing without floating shadows. Error, loading and empty feedback stay near the analysis action. No ambient animation or artificial real-time indicators. The guide has four source choices and an interactive development sequence. Analysis pages place the instrument board immediately after the heading and status feedback.

## Shapes

4px panel corners and 3px controls echo equipment panels. The brand mark is the only circle of emphasis. Shared output channels use contiguous dividers rather than separate floating cards. The charge scale uses 24 illustrative segments rounded to the nearest segment, with the exact API percentage shown beside it. Its linear scale is clamped to 0–100 for geometry. Unavailable results show no lit segments and a dash.

## Components

Shared renderers and handlers in `src/app.js`: numericField, feedback, upload, metric, chargeGraphic, telemetryChart, request and download. Vehicle and SOC share one instrument. Health, policy and model evidence reuse type, fields, feedback and channel treatments. Native selects intentionally retain platform-owned popup geometry and keyboard behaviour.

The Project guide in src/explain.js owns source choices and development stages. Analysis pages show actual outputs, charts and native parameter controls directly; teaching panels and presenter shortcuts are not rendered.

The primary action remains Run analysis. Loading prevents duplicates and uses a stable-width button; cancellation and revision checks reject stale responses. Field validation preserves values and focuses the first invalid field. Route state remains in memory only. Failure preserves inputs and offers retry. Export and raw responses carry actual API values. Reduced motion disables animation; global scrollbars have hover/active and forced-color fallbacks.

## Do's and Don'ts

- Do label example recordings and distinguish measured input from forecasts.
- Do show source domains and SOC/health references beside estimates.
- Do retain unavailable values as dashes with the actual status explanation.
- Do keep all frontend implementation and verification inside this folder.
- Don't suggest the diagram is individual-cell telemetry or an accurate pack blueprint.
- Don't invent confidence intervals, range accuracy or universal charging advice.

Analysis layout: Heading and feedback precede results, followed by parameters and export. Retain Project guide and Model evidence. Open recorded example loads input without inference; Run example loads and predicts. Direct #vehicle visits retain the labelled automatic demonstration. Parameter changes invalidate previous results; Run analysis computes the new result.
