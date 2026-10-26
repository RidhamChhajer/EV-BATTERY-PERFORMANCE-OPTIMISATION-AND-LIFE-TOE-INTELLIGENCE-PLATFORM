# Cellwise workbench frontend

Frontend code, design context and UI tests live here. The frontend server serves example requests from the project-level `examples/` folder; duplicate copies are not needed. Delete this folder to remove the UI; the prediction backend is unchanged. No npm installation is needed to run the frontend.

From the main project folder, start the existing backend in one PowerShell terminal:

```powershell
.\.venv\Scripts\python.exe backend\server.py
```

In another terminal, start the frontend (Python 3.10):

```powershell
.\.venv\Scripts\python.exe frontend\serve.py
```

Open **http://127.0.0.1:5173/**. Port 8000 is the prediction API; port 5173 is the UI. Opening index.html directly as a file is unsupported because browsers block its module/example requests.

The homepage is a Project guide for presenting the system. Choose a study, follow Source data / Useful features / Model and output / Evaluation, then select Open recorded example. This loads real input without inference; select Run analysis when ready. Analysis pages show the results and charts directly. Settings remain below the results. Run example loads and runs a matching example immediately. A direct #vehicle visit retains the automatic demonstration. JSON files must follow the existing API request schema. CSV is supported for vehicle/SOC observations with numeric, documented column names; health analysis needs full JSON including calibration/history. Imported CSV clears the old SOC seed: enter the correct value for the new recording when using initialised tracking. Check capacity and SOC-window settings for uploaded vehicle data.

No measurements are stored in browser storage. Domain boundaries and nullable results are shown explicitly. Example capacity/window settings are demonstration scenarios, not measured depletion-range labels. API base URL is defined in src/app.js; default is http://127.0.0.1:8000. If changing the frontend port, update the backend allowed origin as documented in ../BACKEND.md.

Optional development checks require Node.js:

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd test
npm.cmd run test:e2e
```

Browser tests require both servers running and use installed Chrome on Windows. On other platforms, install Playwright Chromium with `npx playwright install chromium`. Unit tests check CSV/JSON boundaries, formatting, source traces and design tokens. Browser tests verify actual backend results, navigation, cancellation, failures, upload, mobile layout and accessibility. Evidence is stored in verification/. The original API/model tests remain in the main project's tests/ folder.


## Demonstration workflow

1. Open a study from the Project guide, or choose an analysis tab and Run example.
2. Review its predictions and recorded telemetry charts.
3. Change vehicle reserve in the settings and Run analysis to compare range.
4. Switch health or SOC modes and Run example for each mode.
5. Compare charging policies, set a 4 C limit and Run analysis to see the unavailable result; restore 6 C and rerun.
6. Review Model evidence or export the current analysis.

Analysis pages place predictions directly below the heading. The guide and scientific limitations remain available.
