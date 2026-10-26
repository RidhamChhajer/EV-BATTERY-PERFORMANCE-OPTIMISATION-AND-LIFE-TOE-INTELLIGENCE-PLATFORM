# Cellwise interaction contract

Authoritative domain behaviour: ../BACKEND.md and the existing prediction API. One local read-only research tool; no accounts, public deployment or hardware controls. All UI code lives in this removable frontend project.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native HTML select rendered in src/app.js | DESIGN.md | native | tests/browser.mjs keyboard and method change |
| Form | inputs, numericField and fieldErrors in src/app.js | API contract and this file | vehicle, health, SOC, charging | tests/browser.mjs invalid reserve and missing seed |
| Scrollbar | Global styles.css | DESIGN.md | document vertical, table horizontal | tests/browser.mjs narrow viewport |
| Toast | Persistent feedback and announcement region in src/app.js | This contract | loading, error, complete, cancelled | tests/browser.mjs network and cancellation |

Navigation uses hash links, aria-current and honest document titles. Route changes cancel pending prediction work, retain per-route inputs/results in memory, and focus the main landmark. No edit is lost on navigation; method changes explicitly clear incompatible data. The default route and invalid routes return to Project guide. Direct #vehicle visits retain a labelled automatic example. No persistent measurement storage.

Run analysis: validate, focus the first invalid field, reserve button geometry, prevent duplicate submit, show indeterminate progress, then display actual API results. Expected nullable API statuses are meaningful unavailable results. Errors preserve inputs and offer retry. A revision counter prevents older responses and file reads from overwriting newer inputs. Cancel aborts client waiting; the API may already have computed the read-only prediction.

Example loading is explicit except the initial vehicle demonstration. The dataset source is always labelled. JSON accepts complete request objects; CSV replaces observations only, preserves visible scenario settings and discards any previous example SOC seed. Uploaded files are checked for size/type/JSON validity and domain, with server validation remaining authoritative. No file paths or untrusted HTML are displayed. Unsupported health CSV is rejected because calibration/history must be supplied explicitly.

Export includes analysis name, source, protocol, visible scenario settings, ISO timestamp and exact response, without copying full raw measurements. Export is disabled until a matching result exists. Changing inputs invalidates results. Example templates are downloadable and all tools have actual actions.

Fixed-size lists (eight model evidence entries and up to nine charging policies) render all. No selection, search, CRUD, date picker, modal or pagination capability is applicable. Native popup controls and browser file picker are intentional and keyboard-accessible. Product forms use novalidate, with inline errors, aria-invalid and first-error focus. Focus, reduced motion and a narrow viewport are verified.

## Guided demonstration

Project guide is a read-only introduction with four dataset/method choices. Its development-stage controls change the explanation without making API calls. Open recorded example clears the destination example state, chooses its matching default mode, and loads the request without inference. Run analysis then validates and predicts. Run example on an analysis page explicitly loads and predicts. Examples are demonstrations, not unseen test results.

Analysis routes show results immediately after heading/status feedback. No teaching panel or presenter shortcut is rendered. Source references and scientific limits remain beside outputs and in Model evidence.

Users change reserve, peak current and analysis mode through the existing parameter form, then Run analysis. Changing a parameter clears the old output and disables export until a matching response arrives. Expected no-feasible charging results remain successful unavailable responses. Tests cover reserve changes, constraint rejection, modes, keyboard, mobile and offline recovery.

Example request ownership: the project-level examples/ folder is canonical. FrontendHandler maps only flat *_request.json requests under /examples/ to that folder. Static assets stay within frontend/. Browser tests and backend checks use the same example inputs.
