# MANUAL TEST — OBRS-1949 · font-size token sweep (15px ghost step + one funnel title size)

**Executed by the agent on 2026-09-17, not handed over.** Every RESULT below was produced by running
the steps, not by reading the diff. Branch `ao/obrs-1949-font-token-scale` @ `fcab452e`, base
`origin/dev` @ `03022856` (PR [#522](https://github.com/th-peeranut/OBRS-frontend/pull/522)).

This card is typography only, so **every assertion is a measurement, never an eye judgement**: the
number checked is `getComputedStyle(el).fontSize` read out of the live DOM, and the reading is
painted into the frame it belongs to, so a reviewer compares digits rather than pixels.

## 0) start

```bash
# AFTER  — this branch
cd ../OBRS-frontend-wt-obrs-1949 && npx ng serve --port 4430
# BEFORE — a detached worktree at origin/dev
git -C ../OBRS-frontend worktree add --detach ../OBRS-frontend-wt-obrs-1949-before origin/dev
cd ../OBRS-frontend-wt-obrs-1949-before && npx ng serve --port 4431
```

Both worktrees need the gitignored `src/environments/environment.local.ts` copied in from the main
clone, and a `node_modules` junction to it — a fresh worktree has neither and the build dies on the
missing import, which reads like a code error and is not one.

**No backend, no Postgres, no SIT.** `e2e/scripts/capture-obrs1949.js` stubs every `/api` call, so
the two builds are photographed against identical wire bytes and the only difference between a pair
is the CSS. That also means the data on every frame is a fixture — say so wherever a frame is shown.

```bash
node e2e/scripts/capture-obrs1949.js http://localhost:4430 AFTER
node e2e/scripts/capture-obrs1949.js http://localhost:4431 BEFORE
```

The script **refuses to save** a frame while a SweetAlert popup or an error toast is on screen, and
prints `MISSING` rather than skipping a selector that matched nothing — a frame that quietly lost its
subject is worse than one that says so.

## Cases

| # | screen | selector | expected BEFORE → AFTER | RESULT |
| --- | --- | --- | --- | --- |
| 1 | `/my-bookings` | `.my-bookings__header h1` | 28px → **30px** | ✅ 28px → 30px |
| 2 | `/my-bookings` | `.my-bookings__header p` | 15px → **14px** | ✅ 15px → 14px |
| 3 | `/my-bookings` | `.booking-card__meta dd` | 15px → **14px** | ✅ 15px → 14px |
| 4 | `/my-parcels` (empty) | `.my-parcels__header h1` | 28px → **30px** | ✅ 28px → 30px |
| 5 | `/my-parcels` (empty) | `.my-parcels__header p` | 15px → **14px** | ✅ 15px → 14px |
| 6 | `/my-parcels` (empty) | `.state-card p` | 15px → **14px** | ✅ 15px → 14px |
| 7 | `/my-reports` (empty) | `.my-reports__header h1` | 28px → **30px** | ✅ 28px → 30px |
| 8 | `/my-reports` (empty) | `.my-reports__header p` | 15px → **14px** | ✅ 15px → 14px |
| 9 | `/my-reports` (empty) | `.state-card p` | 15px → **14px** | ✅ 15px → 14px |
| 10 | `/account` | `.account-page__header h1` | 28px → **30px** | ✅ 28px → 30px |
| 11 | `/account` | `.account-page__header p` | 15px → **14px** | ✅ 15px → 14px |
| 12 | `/account/notification-preferences` | `.npref-page__header h1` | 28px → **30px** | ✅ 28px → 30px |
| 13 | `/account/notification-preferences` | `.npref-page__header p` | 15px → **14px** | ✅ 15px → 14px |
| 14 | `/schedule-booking` (results) | `.booking-container > .title` — **AC2** | 18px → **20px** | ✅ 18px → 20px |
| 15 | `/schedule-booking` (results) | `.open-seating-banner__title` | 15px → **16px** | ✅ 15px → 16px |
| 16 | `/schedule-booking` (results) | `.open-seating-banner__body` | 14px → **14px** (token swap, no change) | ✅ 14px → 14px |
| 17 | `/schedule-booking` (no results) | `.booking-container .no-results` | 15px → **14px** | ✅ 15px → 14px |
| 18 | `/passenger-info` @390 | `.btn-back` | 15px → **16px** | ✅ 15px → 16px |
| 19 | `/passenger-info` @390 | `.btn-next` | 15px → **16px** | ✅ 15px → 16px |
| 20 | `/review-schedule-booking` @390 | `.btn-change-info` | 15px → **16px** | ✅ 15px → 16px |
| 21 | whole suite | `ng test` | `Executed N of N SUCCESS` with N > 0 | ✅ `Executed 7341 of 7341 SUCCESS` · `TOTAL: 7341 SUCCESS` |
| 22 | whole sweep | count of raw-px `font-size` declarations in `modules/` (customer) + `shared/` | 117 → 84 | ✅ 117 → 84 (33 = 31 substitutions + 2 deleted overrides) |

Frames: `docs/manual-tests/assets/OBRS-1949/` (gitignored — attached to the card, not committed),
9 BEFORE/AFTER pairs, each stamped with the readings for its own rows above.

## Regression guards that matter on a re-run

- **กอง A must stay raw.** The 7 dialog close buttons (`change-email-dialog:36`, `close-account-dialog:35`,
  `cancel-booking-modal:47`, `change-seat-dialog:36`, `change-stop-dialog:36`, `reschedule-dialog:36`,
  `my-booking-ticket-modal:34`) are `font-size` driving a **glyph**, not text. If a future sweep pulls
  them onto the text scale, the ✕ changes size and the 36×36 button stops looking like a button.
- **A serve that has not rebuilt will report the BEFORE numbers from the AFTER port.** This happened
  on the first pass here: the edits landed while the initial build was still running, so watch mode
  never saw them and every reading came back at its old value. If an AFTER run prints BEFORE numbers,
  touch the changed files and wait for the rebuild — do not conclude the CSS did not apply.
- **Scope `.title`.** A bare `.title` selector matches something else earlier in the DOM and reads
  12px on every screen. The funnel title is `.booking-container > .title`.
