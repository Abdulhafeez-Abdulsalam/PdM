# Scope decisions (changes from the master prompt)

The original specification is `Predictive_Maintenance_Platform_Master_Prompt.docx`. Where this file and the spec disagree, **this file wins**.

All decisions below were made on 2026-10-10.

| # | Area | Spec said | We decided | Why |
|---|---|---|---|---|
| 1 | Framework | Next.js App Router (or Vite SPA) | **Vite single-page app** | No public pages, so server rendering adds complexity for no benefit. See [ADR-0001](adr/0001-vite-spa.md). |
| 2 | Live data | 5,000 tag updates/second | **≤ 300 tags streaming at once, ≤ 1 update per second each, screen redraws once per second** | The fastest a person can read a changing number. Keeps any office laptop smooth. See [ADR-0005](adr/0005-live-data-budget.md). |
| 3 | Charts | 1M+ points via downsampling, WebGL, workers | **≤ 2,000 points per line, ≤ 5 lines per chart. No downsampling in the browser.** The data service returns averages over larger intervals for long time ranges. | A screen is ~2,000 pixels wide, so more points can't be seen. See [ADR-0006](adr/0006-chart-point-budget.md). |
| 4 | Offline mode | Offline-first app with background sync and conflict resolution | **Removed. The app needs an internet connection.** Kept one small safety net: a "No connection" banner, and typed form input is kept until it can be sent. | Offline sync is one of the hardest problems in software. See [ADR-0007](adr/0007-online-only.md). |
| 5 | Permissions | RBAC + ABAC at route, component and field level | **Simple role-based views only:** each role gets its own home page and menu, and pages or buttons a role doesn't need are hidden. No attribute rules, no field-level checks. | Frontend checks can't enforce security; only a backend can. Role views are kept because they make the app easier to use. See [ADR-0008](adr/0008-simple-role-based-views.md). |
| 6 | Languages | English, Arabic (RTL), French, Portuguese, Spanish, Mandarin | **English only.** Text still lives in one translation file, so other languages can be added later. No right-to-left support. | Cuts a large amount of layout and testing work. See [ADR-0009](adr/0009-english-only-text-catalog.md). |
| 7 | AI briefing / copilot | Natural-language assistant | **Scripted answers built from the mock data**, behind a swappable "AI provider" interface | No API keys or backend needed yet. A real AI model can be plugged in later. See [ADR-0010](adr/0010-ai-provider-interface.md). |
| 8 | Maps / charts libraries | ECharts or Highcharts; MapLibre or Mapbox | **ECharts, MapLibre** | Free and open-source; Highcharts and Mapbox need paid licences. See [ADR-0003](adr/0003-open-source-charts-and-maps.md). |
| 9 | Visual regression testing | Chromatic | **Playwright screenshot tests** run locally | Chromatic needs an external account. |
| 10 | Build depth | All phases | **All of Phase 1 built properly first**, later phases in later sessions | Avoids 16 half-working modules. |
| 11 | 3D plant model | 3D plant/site model with orbit and fly controls, section views, measurement (§6.8) | **Left out.** The digital twin is 2D: process diagrams, solar layout, pipeline route, replay | Needs a 3D library (~600 KB) and 3D models of the plants that we don't have; the 2D views cover most of the need. Decided 2026-10-22 while planning Phase 3. |

## Acceptance criteria — updated

| Original criterion | Status |
|---|---|
| A new user can find the top 5 riskiest assets within 10 seconds of login | Kept |
| Any prediction traces to its evidence, explanation, confidence and action within 2 clicks | Kept |
| An alarm can become an assigned work order in under 30 seconds | Kept |
| A technician can complete a job fully offline and sync without loss | **Changed:** a technician who loses connection mid-task does not lose what they typed, and can submit it once reconnected |
| Dashboards stay responsive with 5,000 live tags | **Changed:** dashboards stay responsive with 300 live tags at 1 update/second |
| Every screen passes automated accessibility checks in light, dark and control-room themes | Kept |
| Zero hard-coded strings, units or colours outside the token and text systems | Kept (English text catalog) |
