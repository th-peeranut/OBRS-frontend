# MANUAL TEST — OBRS-1214: "use my location" moved onto the pickup tab

Worktree `OBRS-frontend-wt-obrs-1214`, branch `ao/obrs-1214-locate-me-on-stop-tab`, 3 commits on
`dca2e26b` (`8cff1fff` feature, `584de9f0` scrutinize self-fix, `46e8a830` AGENT_MEMORY). Executed by
the QA agent, not handed to a human — every row below was run by this agent against a real browser
or a real unit-test invocation; nothing here is a step for a person to redo.

## What changed

- The "use my location" button moved from a floating overlay ON the map
  (`route-map-panel.component.html`'s old `.locate-me-btn`, gated behind `mapRevealed` + a real map
  draw) to an inline button above the pickup stop list (`route-stop-list.component.html`'s new
  `.locate-me-inline-btn`), which is the DEFAULT tab on both desktop and mobile.
- Geolocation state (`userLocation`, `locating`, `locationError`) moved from
  `RouteMapPanelComponent` up to `RouteMapHomeComponent` (`onUseMyLocation()`), which now passes
  `userLocation` down to the map panel as a plain `@Input` instead of the panel resolving it itself.
- `route-map-panel.component.ts`'s `applyUserLocation()` now guards re-framing the camera with a
  `locationFramed` flag, fixed by scrutinize (`584de9f0`) because `onTilesLoaded` (the
  `<google-map>` `(tilesloaded)` output) fires on every tile reload, not only the first draw.

## Setup

1. **GATE lane** — `npm run e2e:gate` (`playwright.gate.config.ts`, hermetic, no backend). Serves
   `ng serve --configuration gate`, whose `mapsApiKey` is always `''` (`environment.base.ts`), so
   `<app-route-map-panel>`'s `ngOnInit` returns before ever mounting `<google-map>` or requesting
   `maps.googleapis.com` — the DOM/network assertions in `route-map.spec.ts`'s OBRS-1214 describe
   block rely on this.
2. **Before/after evidence capture** — a throwaway script for this card
   (`e2e/support/obrs-1214-capture.js`, plain Node + `@playwright/test`'s `chromium`, not wired into
   any `testMatch`), reusing the SAME mocks `route-map.spec.ts` already uses
   (`e2e/fixtures/public-page-mocks.ts`'s stubs, `locateMePayload`'s two-pickup shape) plus the same
   `obrs_analytics_consent_v1` seed `e2e/support/analytics-consent.ts` uses, run against
   `ng serve --configuration gate` on both the BEFORE tree (`OBRS-frontend-wt-obrs-1214-before`,
   detached at `origin/dev` `dca2e26b`) and this AFTER tree, at the card's mobile viewport
   (390×844).
3. Locale forced to `th` via `localStorage['app_language']` for the screenshot evidence (blank
   default is `th` — `DEFAULT_LANGUAGE` in `language.service.ts` — but `mockPublicPageApis` sets
   `'en'`, so this script overrides it back).

## Cases

| # | AC | Steps | Expected | Verified by |
| --- | --- | --- | --- | --- |
| 1 | AC#1 button on pickup tab, map untouched | `goto('/')`, wait for `.stop-row`, stay on default tab. | `.locate-me-inline-btn` visible; pickup tab has `p-tab-active`. | e2e `route-map.spec.ts` "AC#1" (GATE lane, passed); capture script `after` mode, screenshot `OBRS-1214-AFTER-pickup-tab-locate-button.png` |
| 2 | AC#2 nearest auto-selected + distance badge | Grant geolocation, `setGeolocation(13.1,100.1)`, click the button. Payload has "Pickup Near" at exactly that coordinate and "Pickup Far" at (20,100). | `.stop-row` for "Pickup Near" gets `.stop-distance` badge + `.stop-row--selected`; detail card below shows it selected. | e2e `route-map.spec.ts` "AC#2/AC#3" (GATE lane, passed); capture script, screenshot `OBRS-1214-AFTER-nearest-selected-with-distance.png` |
| 3 | AC#3 Google Map never loaded | Same click as #2, with a `page.on('request')` listener for `maps.googleapis.com`. | `app-route-map-panel` count = 0 (map tab never opened); 0 requests to `maps.googleapis.com`. | e2e `route-map.spec.ts` "AC#2/AC#3" (GATE lane, passed) — network assertion is a weak positive control on THIS lane alone (mapsApiKey is always blank here regardless of the fix), the DOM count-0 is the real one; both green |
| 4a | AC#4 permission denied | No geolocation permission granted (Chromium headless auto-denies), click button. | `LOCATION_DENIED` text shown. | e2e `route-map.spec.ts` "AC#4" (GATE lane, passed) |
| 4b | AC#4 i18n of denied text | Same as 4a, repeated once per locale (`app_language` = en/th/zh) against a fresh context. | Denied text renders translated, not a raw `HOME.ROUTE_MAP.` key. | Run directly by this agent (ad-hoc Node/Playwright script, not committed) — see Results |
| 5 | AC#5 exactly one trigger | Static check: `grep -rn locateMeClicked` under `route-map/`; `grep -rn locate-me-btn` (old overlay class). | Old `.locate-me-btn` + its `userLocated` output are gone from `route-map-panel.component.{html,ts}`; the only wiring left is `route-stop-list`'s `locateMeClicked` → `RouteMapHomeComponent.onUseMyLocation()`, bound once per breakpoint block (never two simultaneously rendered). | Run directly by this agent (grep) — see Results |
| 6 | AC#6 i18n completeness | `grep` all 4 new keys (`USE_MY_LOCATION`/`LOCATING`/`LOCATION_DENIED`/`LOCATION_UNAVAILABLE`) in `public/i18n/{en,th,zh}.json`; then load the button live in each locale and read its rendered text. | All 4 keys present, non-empty, in all 3 files; live button text matches the file's string, not a raw key. | Run directly by this agent (grep + ad-hoc script) — see Results |
| 7 | AC#7 before/after screenshots | Capture script, both trees, mobile viewport. | 4 named PNGs, uploaded to the Jira card. | Capture script — see Results (HTTP codes in the QA report) |
| 8 | Regression — locationFramed guard (scrutinize `584de9f0`) | Cannot be driven in a real browser on the GATE lane: `mapsApiKey` is always `''` here, so `<google-map>` never mounts and `(tilesloaded)` never fires for real — pan/zoom is unreachable. | N/A on this lane. | Unit test added by this agent: `route-map-panel.component.spec.ts` "a second onTilesLoaded firing for the same location does not re-frame the camera (locationFramed guard)" — see Results |
| 9 | Full unit suite | `npx ng test --watch=false --browsers=ChromeHeadless` | No new failures vs. the 7312-of-7312 baseline already measured for this branch. | see Results |
| 10 | Full GATE e2e suite | `npm run e2e:gate` | No failures attributable to this card. | see Results |

## Results

### Case 1-4a, 8 — GATE lane (`npm run e2e:gate`, AFTER worktree)

```
253 total, 252 passed, 1 failed (16.1m)
```

All `route-map.spec.ts` cases passed, including the four OBRS-1214 cases (AC#1, AC#2/AC#3, AC#4).
The one failure is unrelated to this card's test file but IS caused by this card's own new markup —
see the QA report's contrast finding (`customer-contrast-gate.spec.ts`, `.locate-me-inline-btn` text
`#0772a2` on dark background `#1a1d27`, 3.15:1, needs 4.5:1). Not re-verified against the BEFORE tree
because the class does not exist there — it cannot be pre-existing red.

### Case 4b — denied-text i18n, all 3 locales (ad-hoc script, AFTER worktree, port 4232)

```
en | ["Pickup points in Chonburi (1)","Use my location","Location access denied. Please allow location to find your nearest pickup.","1"]
th | ["จุดรับในChonburi (1 จุด)","ใช้ตำแหน่งของฉัน","ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง กรุณาอนุญาตเพื่อค้นหาจุดรับที่ใกล้ที่สุด","1"]
zh | ["Chonburi上车点 (1 站)","使用我的位置","位置访问被拒绝。请允许定位以查找最近的上车点。","1"]
```

`PICKUP_PANEL_TEXT_HAS_RAW_KEY` was `false` for all three. PASS.

### Case 5 — single trigger (grep, AFTER worktree)

```
$ grep -n "locate-me-btn" src/app/modules/home/components/route-map/route-map-panel/route-map-panel.component.{html,ts}
(no output)
$ grep -rn "locateMeClicked" src/app/modules/home/components/route-map/
route-map-home.component.html:103:   (locateMeClicked)="onUseMyLocation()"   (desktop block)
route-map-home.component.html:226:   (locateMeClicked)="onUseMyLocation()"   (mobile block)
route-stop-list.component.html:21:    (click)="locateMeClicked.emit()"
route-stop-list.component.ts:54:      @Output() locateMeClicked = new EventEmitter<void>();
```

Old overlay button and its `userLocated` output: zero occurrences. The two `(locateMeClicked)`
bindings are the desktop-column and mobile-tab renders of the SAME `<app-route-stop-list>` call
site, gated by `@if(isDesktop)`/`@if(!isDesktop)` so only one is ever in the DOM at a time. PASS.

### Case 6 — i18n key completeness (grep, AFTER worktree)

```
$ grep -n "USE_MY_LOCATION\|LOCATING\|LOCATION_DENIED\|LOCATION_UNAVAILABLE" public/i18n/{en,th,zh}.json
en.json: all 4 present, non-empty English strings
th.json: all 4 present, non-empty Thai strings
zh.json: all 4 present, non-empty Chinese strings
```

Cross-checked against the live button text in Case 4b (en/th/zh all matched the file's string
exactly). PASS.

### Case 7 — screenshots

4 files captured and uploaded to the Jira card (HTTP 200 each — see the QA report for the exact
codes). Not reproduced here; the QA report is the record of the upload.

### Case 8 — locationFramed guard unit test (AFTER worktree)

Added to `route-map-panel.component.spec.ts`. Sanity-checked non-vacuous by temporarily removing the
`|| this.locationFramed` guard from `applyUserLocation()` in the AFTER worktree, re-running, and
confirming the new test FAILS:

```
Chrome Headless ... RouteMapPanelComponent userLocation @Input (OBRS-1214) a second onTilesLoaded
firing for the same location does not re-frame the camera (locationFramed guard) FAILED
TOTAL: 1 FAILED, 62 SUCCESS
```

Guard reverted immediately after (confirmed via `git diff` showing zero change to the `.ts` file).
With the guard back in place:

```
Executed 190 of 190 SUCCESS
```

PASS — this is a real, falsifiable proof of the scrutinize fix, not a vacuous test.

### Case 9 — full unit suite (AFTER worktree)

```
npx ng test --watch=false --browsers=ChromeHeadless
Executed 7313 of 7313 SUCCESS
TOTAL: 7313 SUCCESS
```

(7312 pre-existing + 1 new test from Case 8.)

### Case 10 — full GATE e2e suite

Same run as Case 1-4a above: 252 passed, 1 failed (the contrast finding, attributable to this
card — see Case 1-4a).

## Verdict

FAILED on the WCAG AA contrast finding (Case 1-4a/10) — real, caused by this card's own new
`.locate-me-inline-btn` text color having no dark-theme override. Every other case (1-2, 3, 4a, 4b,
5, 6, 7, 8, 9) passed with real evidence above.
