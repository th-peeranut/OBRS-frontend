# MANUAL TEST — OBRS-862: แถบเลื่อนวันเดินทางบนหน้าผลค้นหา (`/schedule-booking`)

Worktree `OBRS-frontend-wt-obrs-862`, branch `ao/obrs-862-schedule-date-strip`, 3 commits
(`c90043fa` feature → `455f697e` nearest-day guard → `995e6dba` tests) on top of `origin/dev`
@ `5950c448`. **Executed by the QA agent — nothing here was handed to the user to run.**

Every row below was produced by a script in this repo, and every number is read out of the DOM or
off the wire, never off a screenshot. The scripts are
`e2e/capture-obrs-862-date-strip.mjs` (AC-1/2/6/7 + the BEFORE/AFTER pair) and
`e2e/verify-obrs-862-ac4-ac5.mjs` (AC-4/AC-5). Raw output:
`e2e-evidence/obrs-862/obrs-862-{before,after,ac4-ac5}-result.json` (gitignored).

## Setup

| | |
|---|---|
| Backend | local `dev,local` on `http://localhost:8080`, private DB `obrs862qa` (the shared `postgres` DB has a Flyway checksum mismatch on V83/V119 that is not ours) |
| Frontend | `npm run start:local` on port 4200 — one worktree at a time. Both trees resolve `environment.base.ts:13 apiUrl` to `http://localhost:8080`, so BEFORE/AFTER is a controlled comparison against one backend and one database |
| Fixture | `e2e/fixtures/obrs862-date-strip-fixture.sql` — departures relative to `CURRENT_DATE`: today none, +1/+2 trips, +3/+4 none, +5/+6 trips, +7/+8 none, +9 trips |
| Route | `nong_chak` → `bts_mo_chit`, 1 passenger |
| Run date | 2026-09-05, so today = `2026-09-05` |

Ground truth used for every availability cross-check, fetched independently of the browser:

```
POST /api/schedules/availability {"fromStop":"nong_chak","toStop":"bts_mo_chit",
  "numberOfPassengers":1,"fromDate":"2026-09-05","days":7}
→ {"availableDates":["2026-09-06","2026-09-07","2026-09-10","2026-09-11"],"effectiveDays":7}
GET /api/booking-policy → {"maxAdvanceDays":60,"cutoffMinutes":20}
```

The app's own request was captured off the wire and is byte-identical to the above
(`fromDate: 2026-09-05, days: 7`), so the picture is proven against the same answer the page got.

## Cases

| # | AC | Scenario | What was measured | Result |
|---|---|---|---|---|
| 1 | AC-1 | Strip renders above the list | `[data-testid="day-strip"]` box top **628**, height **72**; `app-schedule-booking-list` top **700**; filter bar 380–628. Order is filter → strip → list, no overlap | **PASS** |
| 2 | AC-1 | Selected chip is distinguishable — by computed style, not by eye | selected `bg rgb(7,114,162)` / `fg rgb(255,255,255)` / `weight 700`; available `bg rgb(255,255,255)` / `fg rgb(53,60,68)` / `weight 400`. Three independent carriers (fill, text colour, weight), not hue alone | **PASS** |
| 3 | AC-2 | Tapping a chip updates the list AND the filter form | Tapped `2026-09-06`: rows **0 → 3**; `#filter-departure-date` **"ส., 05/09/2026" → "อา., 06/09/2026"**; last search payload `departureDate: 2026-09-06` | **PASS** |
| 4 | AC-2 | Exactly ONE `POST /api/schedules/search` per tap (a second is the OBRS-1503 double dispatch) | Counted on the wire: **1** search POST fired by the tap. Also **1** on initial landing, and **1** per tap in both AC-4 arms | **PASS** |
| 5 | AC-2 | The strip costs one extra request, not two | **1** `POST /api/schedules/availability` per search, shared by the strip and the empty-state hint (`getAvailabilityCached`) | **PASS** |
| 6 | — | Greyed days ARE the days the server said have no trips | Window `09-05…09-11`; server said available `[06,07,10,11]`. Greyed measured = `{09-08, 09-09}` = window − available − selected. Re-checked with `09-08` selected: greyed = `{09-05, 09-09}`, and with `09-06` selected: greyed = `{09-05, 09-08, 09-09}`. **Exact match in all three** | **PASS** |
| 7 | — | A greyed day is genuinely not selectable | Real click on greyed `2026-09-05`: search POSTs fired **0**, availability POSTs **0**, `#filter-departure-date` unchanged, selected chip unchanged (`2026-09-06`), rows unchanged (3) | **PASS** |
| 8 | — | Empty state names the nearest day with trips, and that day really has trips | Selected `09-05` → "วันที่มีรอบเดินทางใกล้ที่สุดคือ**วันอาทิตย์ที่ 6 ก.ย.**"; selected `09-08` → "…**วันพฤหัสบดีที่ 10 ก.ย.**". Both dates are in `availableDates`, and both are the first available date strictly after the searched day | **PASS** |
| 9 | AC-6 | 360 px — the PAGE must not scroll sideways | `document.documentElement.scrollWidth` **360** vs `clientWidth` **360** → horizontal overflow **0 px**. Does not deepen OBRS-634 | **PASS** |
| 10 | AC-6 | …while the strip itself does scroll | strip `scrollWidth` **504** vs `clientWidth` **328** → the strip scrolls; ≈4.5 chips visible with the next one cut at the edge as the affordance | **PASS** |
| 11 | AC-7 | Dark mode is really applied (colours read, not assumed) | `body.is-dark` true, body `rgb(15,17,23)`. Chips: selected `bg rgb(75,194,247)` / `fg rgb(15,17,23)`; available `bg rgb(26,29,39)` / `fg rgb(232,234,240)`; unavailable `bg rgb(34,38,58)` / `fg rgb(154,163,184)` — all distinct from their light values | **PASS** |
| 12 | AC-7 | Contrast, computed from the measured colours | light selected **5.33:1**, available **11.16:1**, unavailable **8.30:1**; dark selected **9.31:1**, available **13.98:1**, unavailable **5.91:1** — six of six pass WCAG AA | **PASS** |
| 13 | AC-7 | No hardcoded hex | `grep -nE '#[0-9a-fA-F]{3,8}\b'` over the component SCSS → **no matches**; every colour is a token | **PASS** |
| 14 | AC-4 | Round trip — tapping a day BEFORE the return date must not move the return | Depart `09-05`, return `09-07`; tapped `09-06` → departure `06/09/2026`, return **unchanged** `07/09/2026`; payload `{departureDate: 2026-09-06, returnDate: 2026-09-07}`; 1 search POST | **PASS** |
| 15 | AC-4 | Round trip — tapping a day AFTER the return date must carry the return (never leave `departure > return`) | Tapped `09-10` → departure `10/09/2026`, return **carried to** `11/09/2026` (= departure + 1, `defaultReturnDate`); payload `{departureDate: 2026-09-10, returnDate: 2026-09-11}`; 1 search POST. The return leg does not drift and never goes stale | **PASS** |
| 16 | AC-5 | i18n th/en/zh — the same date renders three different weekday strings | th `วันนี้ 5 ก.ย. / อาทิตย์ 6 ก.ย. / จันทร์ 7 ก.ย. …`; en `Today 5 Sept / Sun 6 Sept / Mon 7 Sept …`; zh `今天 9月5日 / 周日 9月6日 / 周一 9月7日 …`. Strip `aria-label` also translated (`เลือกวันเดินทาง` / `Choose travel day` / `选择出行日期`), as is the nearest-day hint | **PASS** |
| 17 | AC-3 | Lower bound = today | With `09-08` selected the window still starts at `09-05` (today), not `09-05 − 3`. No chip earlier than today in any run | **PASS** |
| 18 | AC-3 | Upper bound from `BookingPolicyService`, not a constant | Not reachable behaviourally in one session (the cap is 60 days). Covered by three unit tests that drive a stubbed policy: `maxAdvanceDays: 3` (renders no chip past the cap), `90` (reaches a day the fallback 60 could never reach), and a failed policy call (keeps the fallback) — `schedule-booking-day-strip.component.spec.ts:99-149` | **PASS (unit)** |
| 19 | — | Accessibility of the dead state | Unavailable chips carry `aria-disabled="true"` (not the native `disabled`, so they stay in the tab order) plus a visually-hidden "ไม่มีรอบเดินทาง", and the date row is `line-through` — the state is not carried by colour alone | **PASS** |

## BEFORE / AFTER — the pair that isolates the card

Both rows are the same route, same day, same backend; only the worktree serving :4200 differs.

| | BEFORE (`origin/dev` 5950c448) | AFTER (`995e6dba`) |
|---|---|---|
| Day control on `/schedule-booking` | **none** — `[data-testid="day-strip"]` count **0**, chips **0** | strip present, `role="group"`, 7 chips |
| `POST /api/schedules/availability` | **0** (the endpoint is never called) | 1 per search |
| Searching **today** (`09-05`, empty) | "รอบของวันนี้ออกครบแล้ว" + generic "ลองดูรอบของวันถัดไป" + the OBRS-1217 blind "+1 day" button — it steps one day forward whether or not that day has trips | same block, but the hint **names the day**: "วันที่มีรอบเดินทางใกล้ที่สุดคือวันอาทิตย์ที่ 6 ก.ย." |
| Searching **`09-08`** (empty, not today) | bare `.no-results` paragraph — **no control, no hint, no button.** A dead end | strip (with `09-10`/`09-11` selectable) + "วันที่มีรอบเดินทางใกล้ที่สุดคือวันพฤหัสบดีที่ 10 ก.ย." + the jump button "ดูรอบวันพฤหัสบดีที่ 10 ก.ย." (added by `e21f928c`; see Observation 1) |

> ⚠️ The AFTER column was re-measured after `e21f928c`. The AFTER screenshots on the Jira card were
> re-captured from that same build and the pre-fix ones deleted, so the images and this table agree.
> The three BEFORE attachments are untouched — `origin/dev` did not move.

## Observations — not AC failures, recorded so they are decisions and not surprises

1. ~~**The nearest-day jump BUTTON appears in only one of the three empty states.**~~ **CLOSED
   2026-09-05, commit `e21f928c` — re-measured after the fix, this observation no longer holds.**
   As first measured: today + one-way → hint **and** button; today + round trip → hint, no button;
   **any day that is not today → hint, no button**, because the `@else` branch of
   `schedule-booking-list.component.html` rendered the hint without one, deviating from UX spec
   §6.2. The card itself asks for the hint *พร้อมปุ่มกดไปวันนั้นเลย*, so this was a gap against the
   card's own wording, not merely against the spec — it was fixed rather than left for the owner.
   Re-run of `capture-obrs-862-date-strip.mjs --label after` against the fixed build measures
   `emptyState.actionPresent = true` with `actionTestId = "nearest-day-action"` in **stage A**
   (today, one-way) **and stage G** (`09-08`, not today) — stage G's button reads
   *"ดูรอบวันพฤหัสบดีที่ 10 ก.ย."* — while **stage F** (round trip) still measures
   `actionPresent = false` with the hint present.
   ⛔ **The round-trip omission is NOT a bug and must not be "fixed".** It is the owner's
   2026-08-10 call (`canJumpToNextDay = !isRoundTrip`), deliberately preserved: an unattended queue
   run may not overturn an owner decision. Both halves are now pinned by unit tests whose failure
   was proven by mutation (widening the gate fails the round-trip arm; closing it fails the
   one-way arm).

2. **Pre-existing, NOT this card:** on the **home** page the "เที่ยวเดียว" (one-way) button cannot
   be clicked by a real user — the decorative `<img class="home-bg" role="presentation">` paints
   over it (measured at 1440×1000: image 1440×540 at y=80, button at y=568, both `position: static`
   with `z-index: auto`, so `elementFromPoint` at the button's centre returns the IMAGE).
   `probe-obrs-862-toggle.mjs` reproduces it at **7 of 8 viewports** (1920×1080, 1440×1000,
   1440×900, 1366×768, 1280×800, 390×844, 360×740 — only 768×1024 is clear), and it reproduces on
   the **BEFORE** worktree at `origin/dev`, so it is not a regression from this card. The handler
   itself is fine (`dispatchEvent('click')` toggles correctly), which is how both scripts here
   drive it. Worth its own card.

## Artifacts

Scripts (committed): `e2e/capture-obrs-862-date-strip.mjs`, `e2e/verify-obrs-862-ac4-ac5.mjs`,
`e2e/probe-obrs-862-toggle.mjs`.
Screenshots + JSON: `e2e-evidence/obrs-862/` (gitignored — the 12 PNGs are attached to the Jira
card instead; the SCRIPT is what the repo keeps).

## Verdict

All seven ACs pass. No defect found in the card's own behaviour; two observations above.
