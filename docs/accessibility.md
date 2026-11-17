# Accessibility and responsive review (Phase 8.1)

Scope: all seven pages, the sign-in page, and the Overview and Optimise drawers.

## Method
- **axe-core in a real browser** on every page (and on Overview and Optimise with a drawer open), desktop width, with colour contrast enabled.
- **axe-core in the test suite** (`frontend/src/a11y.test.tsx`) on every route, plus keyboard checks: skip link, drawer focus in, Escape out, focus back on the opening button, named and pressed dock buttons. Colour contrast needs real layout, so the suite switches that one rule off and the browser run covers it.
- **Contrast ratios computed from the design tokens** (axe could not decide contrast over the glass panels and the 3D scene, and reports those as "needs review"): body text 19.9:1, secondary text 9.7:1, tertiary text 5.2 to 6.1:1 on every surface, yellow 11 to 13:1, orange 8.1 to 8.8:1, red 7.2:1, dark text on yellow 13:1. All are above the 4.5:1 AA minimum.
- **Phone width (375 px)** on every page: no horizontal page scroll.
- **Web Interface Guidelines review** of the new and changed UI files.

## Found and fixed
| Finding | Fix |
|---|---|
| Card titles jumped from h1 to h3 on Health, Replacement, Range, Cost, Evidence | Card titles are now h2 |
| Status chips and the full-screen scene sat outside any landmark | Status bar is a labelled region; the full-screen page is the `main` element |
| No way to skip the top bar | "Skip to content" link, first in the tab order |
| Drawers did not give focus back | Focus returns to the button that opened them |
| Account button's name did not contain its visible letter | Name is now "D, account menu" |
| Evidence page overflowed at 375 px | Grids collapse to one column; the new table scrolls inside its card |
| `transition: all` on buttons, chips and toast | Explicit property lists |
| No scroll containment in drawers and pop-ups; double-tap zoom delay on controls | `overscroll-behavior: contain`, `touch-action: manipulation` |
| Numbers jittered as they changed | Tabular figures on key numbers and tables |
| Bottom sheets could sit under a phone's home indicator | Safe-area padding |
| No theme colour for the browser chrome | `theme-color` meta tag |

Result after fixes: **0 axe violations** on all pages in the browser and in the test suite.

## Reduced motion
A global `prefers-reduced-motion` rule switches off CSS animation and transitions. The year scrubber's play button steps one year instead of animating, and the 3D camera snaps to its target instead of gliding. Idle motion is gentle (light pulses on the charger cable, faint heat motes in the Heat lens, a short entrance fade), and with reduced motion all of it stops. The 24-hour day animation in the Charge lens does not play with reduced motion; its play button steps one hour and the bar can still be scrubbed. This was verified in code and by test setup; emulating the media query in the browser pane is not available, so it was not checked visually.

## Analysis pages
Each hero picture has a text equivalent: the cell field, dot plot, road meter, reach chart and temperature ring carry an `aria-label` that states the numbers, and the same figures sit in a "Show as table" or in the card beside them. Draggable things have a keyboard control: the route flag has a labelled range input (km per day), the price marker has a range input, and the fleet size is a number field. Hover cursors on charts only add detail; clicking sets the shared year as before. Play steps one year under reduced motion. Checked at 375 px: no horizontal scrolling on Health, Replacement, Range or Cost. The ranked levers on Health are an ordered list of buttons, each named with its change and the months it adds, with a "List as table" alternative; the cost-against-line chart carries an `aria-label` that states the numbers and has the usual "Show as table"; budget whiskers on the fleet plan are repeated as 10th and 90th columns in its table. Axe passes on all four pages (colour contrast is only checked in a browser, as before).

The Cost page's "Cost to run the bus, per km" card draws the battery and electricity split as a bar with an `aria-label` that states both rupee figures, and the same figures sit in the rows beneath it. The scenario panel's tariff choice is a labelled native select; its effective price line is `aria-live=polite`.

## Not done, and why
- **Playwright end-to-end tests with `@axe-core/playwright`** (the playbook's wording) were not added. Playwright needs a roughly 150 MB browser download, and the same coverage was obtained with axe-core in the test suite plus real-browser scans. They can be added later without changing the app.
- **Screen-reader listening tests** (VoiceOver, NVDA) were not run. Names, roles and landmarks are checked by axe and by tests, which is not the same as hearing the page.
- **The 3D scene itself** is a picture. It has a text description, every number in it is also in the key-number strip, the Details chart table and the pack buttons, and packs can be selected from the View panel by keyboard. Orbiting the camera with the keyboard is not supported.
- **200 % zoom** was not tested separately. At 200 % zoom a 1500 px window behaves like a 750 px one, and the 375 px layout (the narrowest) was checked.

## The PDF report
- The comparison PDF is dark like the app. Text colours are the app's tokens, so the contrast figures above apply (smallest text, 7 pt notes, is the tertiary grey on near-black, about 5.8:1). Gains, losses and warnings are never colour alone: each tile carries a GAIN, LOSS, WATCH or SAME word and every number carries its sign.
- It is not a tagged PDF, so a screen reader reads it in page order without structure. The same figures are in the app and in the email body as plain text.

