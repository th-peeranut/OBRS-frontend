# MANUAL TEST — OBRS-891: whole-row click on Admin Routes

Branch `ao/obrs-891-routes-row-click` off `origin/dev` @ `56b700c5`.

This file is the written record. **It was executed by the agent, not handed to the
owner** — the automated equivalents are named per step, and the visual evidence on
the card comes from `e2e/scripts/capture-obrs891.js`.

## What changed

`src/app/modules/admin/pages/routes/route-list-table/` only (4 files, +126 lines,
0 deletions). No other table in the app gained a row click. No parent wiring was
touched: `routes-page.component.html` already bound `[selectedRouteSlug]`,
`(view)="selectRoute($event)"` and `[routeSlug]`.

## Setup

`ng serve --configuration sit --port 4300` (SIT CORS reflects any localhost
origin, so no local backend or Postgres is needed). Log in at `/login` as
`admin@system.local`, then open `/admin/routes`.

Note for a fresh worktree: `src/environments/environment.local.ts` is gitignored,
and `environment.sit.ts` now reads `analytics.ga4MeasurementId` /
`analytics.clarityProjectId` from it (OBRS-867/888). A copy taken from an older
clone fails the build with `TS2339`. Blank values are correct — the file's own
comment says blank is a no-op.

## Cases

| # | AC | Steps | Expected | Automated by |
| --- | --- | --- | --- | --- |
| 1 | 1 | On load, note which row is highlighted. Click the **name** cell of the 3rd row. | The 3rd row becomes `is-selected`; "ลำดับจุดจอด" and "ช่วงเส้นทางและค่าโดยสาร" reload with that route's data. | `capture-obrs891.js` (asserts `selectedIndex` moved AND the stop list text changed, then refuses to save the shot otherwise) + spec `emits view with the row when a non-interactive cell is clicked` |
| 2 | 1 | Click the status badge, the slug `<code>`, and the date cell of another row. | Same as case 1 — the whole row is the target, not just one cell. | spec (the guard only exempts `button, a, input, select, textarea`) |
| 3 | 2 | Click the **view** (eye) icon. | Detail loads exactly as before. It must load **once** — no double fetch. | spec `emits view exactly once when the View icon itself is clicked` (mutation-verified: removing the guard makes it red) |
| 4 | 2 | Click the **edit** (pencil) icon, then cancel. Click the **delete** icon, then cancel. | The edit modal / delete confirm opens. The detail panels do **not** switch to that row. | spec `does not emit view when the Edit or Delete glyph inside the button is clicked` (clicks the inner `<span>`, which is the case only `closest('button')` catches) |
| 5 | 3 | Press the mouse down on a route name, drag across it to select the text, release. | The text is selected. The detail panels do **not** change. | spec `does not emit view when the click ends a text selection in the row` (mutation-verified) |
| 6 | 4 | Put focus in the table and `Tab` to a row's view button, then press `Enter`/`Space`. | The button activates. The row itself is deliberately **not** tabbable — it has no `role`/`tabindex`/`keydown`, which is exactly why the button must stay. | spec `keeps the View button as a focusable button with an accessible label` |
| 7 | 1 | Click the row that is **already** selected. | Nothing refetches. | `routes-page.component.ts:182` short-circuits when the slug is unchanged and a route is already loaded (pre-existing behaviour, unmodified) |
| 8 | 5 | While the list is still loading, and again with an empty result. | Skeleton rows and the "no data" row must not look or behave clickable. | spec `puts the clickable row class on data rows only, not the skeleton or empty row` |

## Results

All 8 cases pass. Unit suite for the component: 15/15. Full frontend suite:
**4315 SUCCESS, 0 failed**. There is no `lint` target in this Angular project
(`ng lint` → *Cannot find "lint" target*), so lint is not a gate here.

## Guard mutation runs (the reason the spec is trusted)

The pre-existing spec `emits view/edit/delete with the route row on each action
button click` stayed **green** with the guard deleted — a happy-path assertion
cannot pin a guard. Each branch was therefore removed in turn and the suite re-run:

| Mutation | Result |
| --- | --- |
| remove `if (target?.closest('button, a, input, select, textarea'))` | **2 FAILED** — double-emit on View, and `view` fires on Edit/Delete |
| remove `if (window.getSelection()?.toString())` | **1 FAILED** — selecting text opens the detail |
| none (restored) | 15 SUCCESS |
