# Agent Memory — Scrutinize notes for developers

## 2026-07-10 — Follow-up fold-in: hide checkout / widen center on non-Ticket-Sales tabs (product-owner review)

Small behavior-preserving addition to OBRS-130, folded into the same branch/commit series
after the main boarding-management work above was already implemented and committed. The
boarding manifest was landing in a squeezed `col-xl-5` center column with a dead-space
`col-xl-4` checkout column next to it on the Trip Details/Boarding tabs — reclaimed that
space.

- **`WalkInCenterPanelComponent.activeTabChange` (new `@Output<number>`)** — emits the tab
  index on every `onTabChange()` call, AND once from a new `ngOnInit()` (component didn't
  implement `OnInit` before) so the parent starts at a known index-0 state without waiting
  for a user click.
- **Reset mechanism chosen: sell-page resets `activeTabIndex = 0` itself at every point
  it already resets `selectedTrip`** (`onDateChanged`, `onTripSelected`, the post-sale
  success handler in `onSell`, and the optimistic branch in `confirmDeleteSchedule`) —
  NOT relying on the child re-emitting 0 on remount. Reasoning: `WalkInCenterPanelComponent`
  itself is never destroyed/recreated (only its inner `p-tabView`, which is
  `*ngIf="selectedTrip"`, toggles) — so `ngOnInit` fires exactly once for the component's
  whole lifetime, not on every trip reselection. Coordinating "did the tabview just
  remount" from inside `ngOnChanges` would require inferring PrimeNG's internal
  activeIndex-reset behavior; driving it explicitly from the same call sites that already
  reset every other per-trip UI state (`selectedSeats`, `seatPassengerTypes`,
  `idempotencyKey`) is simpler and matches the existing pattern exactly. The child's
  `ngOnInit` emit is kept too (per the literal spec ask) — harmless no-op since the parent
  already defaults to 0.
- **Deliberately did NOT reset `activeTabIndex`** in `onTripDetailsUpdated()` (the
  `this.selectedTrip = {...this.selectedTrip, ...event.patch}` merge after a Trip-Details
  save) — the user is actively on the Trip Details tab when that fires; resetting would
  bounce them back to Ticket Sales right after their own save, a regression, not a fix.
- **Layout**: center column `col-lg-5 col-md-12` (unchanged breakpoints) with
  `[class.col-xl-5]="activeTabIndex === 0"` / `[class.col-xl-9]="activeTabIndex !== 0"`;
  checkout column gets `*ngIf="activeTabIndex === 0"`. On Ticket Sales (default, index 0)
  the DOM is byte-identical to before this change — same classes, same visibility.
- Tests added: `sell-page.component.spec.ts` (4 new assertions on `activeTabIndex` at the
  same 4 reset call sites) and `walk-in-center-panel.component.spec.ts` (new
  `activeTabChange output` describe: initial emit-once-on-init via a fresh
  `TestBed.createComponent`, and emits-per-`onTabChange()` call).
- `ng test`: 1057 passing (was 1053; +4 new). `ng build --configuration production`:
  initial bundle 1.48 MB (unchanged budget headroom), staff-module lazy chunk +0.5 kB.

## 2026-07-10 — Frontend implementation notes: OBRS-130 staff pre-departure boarding management

Implemented per the UX spec above. A few decisions made while building that the next
reader (Scrutinize/QA) should know:

- **`BoardingListStore` moved**, not just re-decorated: from
  `modules/staff/pages/boarding-list/boarding-list.store.ts` to
  `shared/components/boarding-list/boarding-list.store.ts`. The spec said "put
  `providers: [BoardingListStore]` on this component" but didn't say to relocate the file;
  moved it anyway so the shared component doesn't reach backward into a feature module's
  page folder for its own store — keeps the dependency direction (`modules/*` → `shared/*`,
  never the reverse) intact per `CLAUDE.md` §3's layer rules.
- **Backend contract for `board`/`unboard` + `boardedBy`/`boardedByName` does NOT exist yet**
  in the paired `OBRS-backend-wt-obrs-130-boarding` worktree at time of writing (`TicketController`
  only has `check-in`/`boarding-token`/`boarding-scan`; `BoardingListItemResponse` has no
  `boardedBy`/`boardedByName`). Built against the locked UX spec anyway — same parallel-lane
  pattern as OBRS-96/OBRS-129 (see `docs/handoff.md` Contract Requests, new OBRS-130 entry
  added this pass). **Do not merge to `dev`/`sit` until the backend lands both.**
- **Board-button row action is NOT `.admin-btn-primary`.** Considered it (staff shell is
  themed via `.admin-shell.theme-staff`), but rejected: design-system §4's "one primary
  button per screen" reads oddly if reused N times per row in a table. Used plain
  `.admin-btn.admin-btn-small` instead — this also closes the boarding-list entry in the
  §13 "still open: non-admin `btn-primary`" consolidation-debt list (removed that surface
  from the still-open bullet, added a "closed" note).
- **`getUsername()` self-seeding applies to BOTH optimistic paths** (the Board button AND
  the scan-success handler), not just the Board button as the literal spec wording
  ("the OPTIMISTIC board YOU just clicked") could be read narrowly. Reasoning: a manual
  scan is equally "an action the current operator just performed" — same non-misattribution
  argument applies (only ever seeded onto the one row just acted on, never a pre-existing
  boarded row). Flagging in case Scrutinize reads the spec more narrowly.
- **`checkIn()` fully retired**: method removed from `staff-api.service.ts` (confirmed via
  grep — no other frontend consumer), its spec test replaced with `board()`/`unboard()`
  tests, and the now-dead `STAFF.BOARDING.CHECKED_IN`/`CHECK_IN_BTN`/
  `STAFF.MESSAGES.CHECK_IN_SUCCESS`/`CHECK_IN_FAILED` i18n keys removed from all three
  locale files. The ticket-status `Status` column is unchanged (still reads
  `item.status.label`/`item.status.code === 'checked_in'` inline) — only the *boarding*
  signal moved off status.
- **ADR**: `docs/adr/0014-boarding-list-shared-component-dual-mount.md` covers the
  self-sufficient dual-mount pattern, the store-scoping trade-off (loses cross-nav SWR
  replay, a deliberate trade for live data), the single-owner `ngOnChanges` re-bind
  contract, and the hidden-not-disabled Un-board gating.

## 2026-07-10 — UX spec: staff pre-departure boarding management (OBRS-130) — key findings for the implementer

## 2026-07-10 — UX spec: staff pre-departure boarding management (OBRS-130) — key findings for the implementer

**Worktree:** `OBRS-frontend-wt-obrs-130-boarding` (branch `ao/obrs-130-boarding`, off `dev`).
No code written this pass — this is the UX/UI spec handoff. Full spec is in the OBRS-130
ticket thread / the parent agent's transcript; load-bearing findings below.

**Core extraction: `BoardingListPageComponent`'s current template/logic becomes a new shared
`<app-boarding-list [scheduleId]>` component, mounted in two places — the driver route
(thin wrapper, behavior-identical) and `walk-in-center-panel` Tab 3 (inline, no navigation,
replacing the current hint+link-out at `:200-207`).** `BoardingListStore` should move from
app-root `providedIn: 'root'` to component-level `providers:` on the new shared component so
the driver page instance and a sell-page Tab-3 instance never share one cache (its existing
`setScheduleId()` clear-on-change guard stays, just now scoped per mount instead of per app).

**The key decision: boarding is now status-neutral (`boarded = boardedAt != null`, decoupled
from ticket `status`). Recommended a THIRD column, not a repurposed one** — keep the existing
`Status` column showing the ticket lifecycle badge unchanged, ADD a new `Boarded` column
(icon+text+color chip: `check_circle`/green "Boarded" vs `radio_button_unchecked`/neutral-gray
"Not boarded", plus an audit sub-line "Boarded at HH:mm" when set). Reusing `is-info` for
"not boarded" was rejected — it would sit right next to the Status column's own `is-info`
badge (e.g. "confirmed") with a different meaning, the exact same-color-different-meaning
collision design-system §11 already warns about.

**Two new tokens/classes needed, both flagged as "new pattern — needs design-system.md +
ADR", not built yet:**
1. `.admin-status.is-neutral` + `--admin-neutral-bg`/`--admin-neutral-text` in
   `admin-theme.scss` — model directly on the existing `--admin-inreview-*` pair (self-
   contained light-bg/dark-text, **no** dark-mode text-only override — that exact mistake
   was already made once and reverted, see the OBRS-86 entry below in this file) but pick a
   visually distinct grey from `--admin-inreview-*` so the two neutral-ish chips don't read
   as the same color in adjacent columns.
2. `.admin-btn-danger` (compose the already-tokenized `--admin-danger-text`/
   `--admin-danger-border` — no new hex) for the Un-board button. §4 already names
   "Destructive" as a button role but no class implements it yet; this closes part of the
   §13 debt instead of inventing a one-off scoped style.

**Data gap: the locked `BoardingListItemResponse` contract has NO "who boarded" field.**
The card asks for an audit chip with "boarded time + who boarded." Spec's call: add
`boardedByName?: string` as an additive optional field on `BoardingListItemDto` (mirrors the
existing `boardedAt?: string` precedent from OBRS-96), seed it **optimistically** from
`authService.getUsername()` at the moment of a successful Board click (this session only —
it has nowhere else to come from until the backend adds it), and degrade gracefully to a
time-only chip after a refresh/reload. **Flagged as a backend contract gap for a follow-up
card** (add `boardedBy`/`boardedByName` to the boarding-list response) — do not block this
card on it.

**Board-button eligibility: deliberately did NOT hardcode a client-side status-code
allow-list.** The SA spec only locks the `boarded = boardedAt != null` formula, not the full
ticket-status enum. Board is disabled only when `boardedAt != null` (visibly already
boarded) or a request is in-flight for that row; every other rejection reason
(`TICKET_NOT_CONFIRMED`, `BOARDING_WINDOW_NOT_OPEN`, etc.) surfaces only after an attempt,
via the errorCode-mapped alert — same "status-neutral" philosophy as the boarded formula
itself, just applied to the button's disabled state too.

**Un-board is role-gated HIDDEN (not disabled) via `authService.hasAnyRole(['salesperson'])`**
— same "hidden, not disabled" precedent `app-export-button` already established
(`ExportButtonComponent.ngOnInit`'s `canExport` flag). `admin` inherits `salesperson`'s grant
transitively via `AuthService.ROLE_GRANTS`, so admin sees it too without a separate check.
Un-board requires `AlertService.confirm()` before firing (existing `confirm()` method already
supports this, no new alert-service API needed).

**New error-code helper needed, NOT a reuse of `boarding-scan-error.ts`.** Board/Un-board
share only some of the boarding-scan codes (`ALREADY_BOARDED`, `TICKET_NOT_CONFIRMED`,
`BOARDING_WINDOW_NOT_OPEN`, `TICKET_ERROR_ID_NOT_FOUND`) plus a NEW one scan doesn't have
(`NOT_BOARDED`, for an Un-board race). Spec'd a parallel `boarding-action-error.ts` +
`STAFF.BOARDING.ACTION_ERROR.*` i18n keys rather than overloading `SCAN.ERROR.*` (that
namespace is tied to the scan-box UI surface specifically).

**Multi-select "Board Selected" scoped OUT of v1.** Per-row Board/Un-board is the baseline
(matches how passengers actually arrive — staggered, one at a time). A bulk checkbox+"Board
Selected" toolbar action is real but lower-value for the staggered-arrival case; spec'd it as
an explicit phase-2 note only, not a build requirement.

**Tab-3 empty-state needs NO new copy.** `walk-in-center-panel`'s whole `p-tabView` (all 3
tabs) is already gated behind `*ngIf="selectedTrip"` one level up, with the existing
`STAFF.SELL.CENTER_EMPTY` empty-state covering "no round selected" — Tab 3 itself is never
reachable in that state. The *zero-passengers-in-this-round* empty state inside the shared
component reuses the existing `STAFF.BOARDING.EMPTY_TITLE`/`EMPTY_BODY` keys verbatim.

## 2026-07-10 — QA re-verify: OBRS-129 PASSED — data path confirmed end-to-end at backend `70ff182`

Backend fix (`70ff182`, Instant→OffsetDateTime projection conversion) rebuilt locally on the same
:8000/:4407 setup as the earlier FAILED pass. Re-checked only what the 500 had blocked; role
matrix / error-state handling were already proven and not re-run.

**AC1 (tile parity, FE render):** confirmed. Tiles read `1 / 28.6% / 4 / THB 800.00`, matching
the API response and `/reports/summary` byte-for-byte. Same for `owner@system.local`.

**AC2 (departures table):** 1 row rendered — `ชลบุรี-กรุงเทพฯ` (Chonburi-Bangkok, th label found;
falls back to the English route slug correctly when zh has no translation row — confirmed in the
zh screenshot, not a bug), `10 ก.ค. 2026 15:00` (via `formatDisplayDateTime`, OBRS-178 formatter —
NOT the raw `2026-07-10T15:00:00+07:00` ISO string), `4 / 14`, `28.6%`. `tiles.departuresCount(1)
== 1` row. Per-row occupancy (28.6%) consistent with the tile (only one row, so trivially
sum-equal — matches the backend-side sum-based math already verified).

**AC3 dark-mode DOM probe on the now-reachable DATA surfaces:** `.admin-kpi` computed
`background-color: rgb(29, 34, 38)`, `.admin-table` / table rows `rgba(0,0,0,0)` (transparent,
inherits the dark card background, same shape as the light-mode empty-state card already
checked) — none near-white, no light bleed on any of the newly-reachable surfaces.

**AC4 (basis captions + i18n, no raw-key leak):** confirmed live for en/th/zh (cold `app_language`
localStorage switch + reload) — captions render "by departure date"/"by booking date" (localized:
"ตามวันที่ออกเดินทาง"/"ตามวันที่จอง" in th, "按发车日期"/"按预订日期" in zh) under the correct tiles;
`/ADMIN\.DASHBOARD\./` regex found zero raw-key leaks in the rendered body in any of the 3
languages.

**AC5 (View full reports link):** `.admin-card-head a.admin-btn-small` → `href="/admin/reports"`,
click navigates to `/admin/reports`. (First attempt used an over-broad `hasText: /report/i`
Playwright locator that matched the sidebar's "Usability Reports" nav item instead — a test-script
bug, not a product bug; re-verified with the scoped selector above and it's correct.)

**AC6 (empty state):** not re-forced — today (2026-07-10) has 1 real departure, so the empty
branch isn't reachable live. Already confirmed via `dashboard-page.component.spec.ts`'s
`isEmptyDay`/`contentState` unit tests (`'empty' when departuresCount===0 && bookingCount===0 &&
occupancyRatePct===0`) plus the static template review — no change since the prior FAILED pass.

Fresh screenshots (light/dark, en default; th/zh; owner spot-check) captured after polling for a
real (non-skeleton) tile + a real table row — see QA's transcript for the scratchpad paths.
Verdict: **PASSED**. No frontend changes needed; the prior FAILED pass's frontend-side conclusions
(graceful error handling, correct i18n plumbing) already held and are now moot since the backend
supplies 200s.

## 2026-07-10 — QA: OBRS-129 FAILED (blocked on a backend 500, not a frontend bug)

**Verdict: FAILED**, blocking bug is backend-side (see backend worktree's `AGENT_MEMORY.md` for
the full root cause: `GET /api/private/admin/dashboard/today` 500s via an `Instant→OffsetDateTime`
native-query projection error whenever any departure exists on the given day — i.e. on every real
day, not just an edge case). Live-verified against local FE (:4407) + local backend (:8000, `sit`
profile / real SIT DB) as `admin@system.local`.

**What this DID confirm about the frontend's own code (all good):**
- `dashboard-page.component.html`'s `contentState === 'error'` branch degrades gracefully — no JS
  crash, no console pageerror, a clean centered message replaces the tiles+table entirely, exactly
  per the `dashboard-state-card` design intent (screenshot evidence: `dashboard-light.png` /
  `dashboard-dark.png` in QA's scratchpad, see the QA agent's transcript for paths).
- The error message is correctly localized (`ADMIN.DASHBOARD.LOAD_FAILED` rendered as
  "ไม่สามารถโหลดข้อมูลแดชบอร์ดได้" in Thai, no raw key leaked) — the admin account's
  `preferredLocale` defaulted the UI to Thai on this run.
- Dark mode probe on the one reachable new surface (`.dashboard-state-card`): computed
  `background-color: rgb(29, 34, 38)`, `color: rgb(231, 237, 241)` — dark, no light-bleed.
- Role gate (AC3) verified at the API level: ADMIN/OWNER reach the guarded route (get 500, not
  403 — i.e. auth passes, only the data path is broken); SALESPERSON/DRIVER/CUSTOMER get 403,
  anon gets 401.

**What could NOT be verified this pass (all downstream of the backend bug, nothing here implies a
frontend defect):** tile-parity rendering (AC1), departures table rendering + occupancy column
(AC2), the empty-state note replacing the table (AC5) — never reached because "today" has real
departures and the endpoint always 500s on that path, `.dashboard-basis-caption`/`.admin-kpi`/
`.admin-table` dark-mode probe (never rendered), the "View full reports" link (AC7 — its wrapping
`<section>` is `*ngIf="contentState !== 'error'"`, so it doesn't render in the error state either),
tile-level i18n (en/zh switch of tile labels/captions never got past the error state to check).

Re-run this worktree's own capture/regression once the backend fix lands — nothing here needs
frontend changes.

## 2026-07-10 — Frontend implementation: `/admin/dashboard` rebuild-in-place (OBRS-129)

**Worktree:** `OBRS-frontend-wt-starter-dashboards` (branch `ao/starter-dashboards`, off
`origin/dev` which already has OBRS-40). `ng test`: 996/996 PASS. `ng build --configuration
production`: PASS (1.45 MB initial, under the 1.5 MB budget). `npx tsc --noEmit -p
tsconfig.app.json`: clean.

**Rebuild-in-place, not a new page.** Kept the route (`/admin/dashboard`), sidebar nav item,
topbar title mechanism (`data.titleKey: 'ADMIN.PAGES.DASHBOARD'`, `subtitleKey:
'ADMIN.DASHBOARD.SUBTITLE'` — no in-body `<h3>`), and `pollWhileVisible` auto-refresh
untouched. Only `AdminDashboardStore`'s internals and the page's rendering changed.

**`AdminDashboardStore` re-based onto `AdminCollectionStore<DashboardTodayDto>`, deleting the
old bespoke two-source (`getBookings()` + `getVehicles()`) merge entirely** — same move
`ReportsStore` made for OBRS-40. `fetch()` is one `firstValueFrom(adminApiService
.getDashboardToday())` call; `emptySnapshot()` covers the no-`data` edge. See
`docs/adr/0013-dashboard-rebase-on-admin-collection-store.md` for the full rationale
(business logic — pending-payment/active-vehicle detection, revenue summation — now lives
server-side in the new endpoint instead of being re-derived client-side).

**Backend endpoint does not exist yet — built directly against the contract supplied in the
locked task spec (mirrors `ReportsSummaryDto`'s shape convention), flagged in
`docs/handoff.md`.** Checked the paired backend worktree
(`OBRS-backend-wt-starter-dashboards`): `IMPLEMENTATION_CHECKLIST.md` shows `#44` (OBRS-129)
"claimed"/in-progress but no `Dashboard*` controller/service exists yet, only planning-doc
commits. `../OBRS-backend/docs/api/` has no `dashboard.md`. Filed a Contract Request per
`CLAUDE.md`'s R0/R1 rule — every load will show `ADMIN.DASHBOARD.LOAD_FAILED` until the
backend ships `GET /api/private/admin/dashboard/today`.

**`contentState` has one fewer branch than `ReportsPageComponent`'s.** No date picker on this
page (the endpoint is always "today" in Bangkok time), so no `'invalid'` state —
`'loading' | 'error' | 'empty' | 'data'` only. `isEmptyDay` carries forward the OBRS-40
`e41e88e` divergent-basis reasoning (occupancy keys on departure-date, `bookingCount` keys on
booking-date, so a day can have real occupancy with zero bookings and that is NOT empty) —
renamed for this page but same logic shape as `isEmptyRange`.

**Revenue tile gates on `showRevenue = !!tiles?.revenue` (presence), never a role check** —
same forward-compat pattern as Reports, now literally realized: the interface comment on
`DashboardTilesDto.revenue` says this is for "a future viewer (e.g. salesperson) without
revenue visibility," which is exactly what OBRS-129's own deferred salesperson-access scope
describes.

**Split `loadError` (gated on `!store.hasValue`, drives the full-replace error card) from a
new raw `hasFailed` flag (ungated, drives `app-admin-refresh-hint`'s "failed, showing saved
data" line) — Reports doesn't need this split because it hardcodes `[failed]="false"` on its
refresh-hint and has no such requirement.** The task spec explicitly asked for
`app-admin-refresh-hint` to cover "background-refresh/failed-with-cache," which needs to fire
precisely when there **is** a cache (the opposite gating condition from the error card). The
outer `<section class="admin-page-intro">`'s `*ngIf` combines
`(contentState === 'data' || contentState === 'empty') && (isRefreshing || hasFailed)` so the
hint only ever appears over an already-rendered tiles/table view, never doubled up with the
error-state-card.

**Test gotcha: a naive `dedupes concurrent refreshes ... toHaveBeenCalledTimes(1)` assertion
is WRONG for `AdminCollectionStore` subclasses when the fetch resolves via `firstValueFrom(of(...))`.**
`AdminCollectionStore.refresh()`'s actual contract (see its own doc comment) is "a call that
arrives mid-flight requests one more fetch when the current one finishes" — with an
already-resolved-but-microtask-deferred observable, both the initial fetch AND the
one-rerun fire before `Promise.all([first, second])` settles, so the spy legitimately gets
called twice. Verified via a throwaway Node repro (`rxjs`'s `firstValueFrom(of(x))` still
defers the `await` continuation to a microtask, same as any promise). Rewrote the test to
assert the store resolves cleanly + `hasValue` afterward, not a specific call count — the
exact rerun-count contract is already covered in detail by the base class's own
`admin-collection-store.spec.ts` (using a manually-controlled `deferred<T>()` to actually hold
a fetch "in flight" across the assertion, which `of()` cannot model).

**i18n:** added `ADMIN.DASHBOARD.{TILE.*, BASIS.*, DEPARTURES.*, VIEW_FULL_REPORTS}` (12 keys)
to en/th/zh, changed `SUBTITLE`, deleted the now-dead flat keys
(`TOTAL_BOOKINGS`/`PENDING_PAYMENTS`/`ACTIVE_VEHICLES`/`REVENUE`/`RECENT_BOOKINGS`/`VIEW_ALL`/
`PARTIAL_LOAD_FAILED`/`UPDATING`) after grep-confirming none were referenced outside the
dashboard files being rewritten. Kept `LOAD_FAILED` (reused) and `TITLE` (not in the
task's deletion list, left as harmless unused weight rather than guessing it's safe to
remove).

**Docs:** `README.md` "Admin UI Conventions" gained a "Dashboard (`/admin/dashboard`)"
section (mirrors the existing "Reports" section's structure/tone) explicitly noting this is
now the **second** `.admin-card.admin-kpi` tile-markup consumer the Reports section already
predicted, and that extraction into a shared stat-tile component was deliberately NOT done
here (tracked as debt, out of scope for a task with a fully prescribed file list).
`docs/handoff.md` got a new Contract Request entry (2026-07-10); `docs/adr/0013-...md` covers
the store-rebase decision.
## 2026-07-10 — Frontend implementation: digital e-ticket QR + manual boarding-scan (OBRS-96)

**Worktree:** `OBRS-frontend-wt-obrs-96-eticket-qr` (branch `ao/obrs-96-eticket-qr`, off
`dev`). `ng test`: 1020/1020 PASS. `ng build --configuration production`: PASS (1.47 MB
initial, under the 1.5 MB budget).

**Backend does not exist yet for either endpoint — built against the SA/UX-locked shape,
flagged in `docs/handoff.md`, same pattern as OBRS-109/OBRS-85.** Checked the paired backend
worktree `OBRS-backend-wt-obrs-96-eticket-qr` (same branch name): `git diff dev --stat` shows
only `AGENT_MEMORY.md` + unrelated fixture fixes, no boarding-token/boarding-scan
controller/service/DTO. `IMPLEMENTATION_CHECKLIST.md` confirms `[#52] OBRS-96` is still
🔒 WIP. Filed a Contract Request in `docs/handoff.md` covering both
`GET /api/private/tickets/{id}/boarding-token` and `POST /api/private/tickets/boarding-scan`.
Until the backend lands: every ticket's e-ticket QR shows the `qrUnavailable` placeholder
(404 on every `boarding-token` GET), and the boarding-scan box always shows the `GENERIC`
error — both degrade gracefully, no broken UI.

**Per-ticket QR state lives OUTSIDE the transient `passengers` array — this is the one
non-obvious design point.** `ETicketComponent.mapTicketFields`/`applyApiOverrides` already
re-ran on every `combineLatest` emission before this feature, including a bare locale switch
(`translateService.onLangChange`). If the resolved `qrDataUrl`/`qrUnavailable` lived only on
the `TicketPassenger` row objects, a language toggle would rebuild the array from scratch and
either blank already-fetched QR codes or re-trigger duplicate `boarding-token` GETs per
ticket. Fixed via two component-level, `ticketId`-keyed structures independent of the
`passengers` array's lifetime: `qrStateByTicketId: Map<number,{qrDataUrl,qrUnavailable}>` and
`fetchedTicketIds: Set<number>`. See `docs/adr/0013-per-ticket-qr-eticket-and-boarding-scan.md`
Decision 3 for the full writeup. **Pattern to remember:** whenever a component's field-mapping
function re-runs on a locale/language change (not just on new data), any per-item async state
that must survive that re-run needs to live in a keyed side-map, not embedded in the
regenerated array.

**`forkJoin` isolation gotcha caught while writing the isolation test, not before.** The
initial instinct was `catchError` around the whole `forkJoin(...)` call — that's wrong: it
would make ONE ticket's 409 (`TICKET_NOT_CONFIRMED` on a cancelled/refunded leg) blank every
other ticket's QR, since `forkJoin` never emits if any inner observable errors. Fix: put
`catchError` **inside** each inner `.pipe()`, resolving to a `{ticketId, boardingToken: ''}`
sentinel — every inner observable is then guaranteed to emit, so `forkJoin` always completes
with one result per ticket regardless of how many failed. Also learned while writing the spec
for this: the default `of(null)` boarding-token stub resolves the whole
fetch→apply chain **synchronously** (the empty-token branch in `applyBoardingTokenResults`
never hits an `await`), so a test asserting `component.passengers` right after calling
`applyApiOverrides()` already sees the resolved (`qrUnavailable: true`) state, not a pending
one — don't assume an async-looking method leaves state untouched by the time the next
synchronous line runs; check whether every branch actually awaits something.

**Boarding-scan `SKIP_AUTH_LOGOUT` is intentionally asymmetric between the two new calls** —
the customer-side `TicketService.getBoardingToken()` does NOT set it (a 401 there is the
customer's own expired session and should force-logout normally), but
`StaffApiService.boardingScan()` DOES set it, mirroring `booking.service.ts`/
`promotion.service.ts`'s defense-in-depth against OBRS-187. Don't copy one call's
`SKIP_AUTH_LOGOUT` choice onto the other without re-checking who's making the call and what a
stray 401 there should mean.

**Boarding-scan error UI reuses `.admin-status`/`.admin-field`/`.admin-btn-primary` — no new
control types.** The 7 documented `errorCode`s (`INVALID_TICKET_TOKEN`, `EXPIRED_TICKET_TOKEN`,
`WRONG_SCHEDULE_TICKET`, `BOARDING_WINDOW_NOT_OPEN`, `TICKET_NOT_CONFIRMED`, `ALREADY_BOARDED`,
`TICKET_ERROR_ID_NOT_FOUND`) plus `GENERIC` each map to a distinct i18n key + severity
(`danger`/`warning`) + Material Symbol icon in `shared/lib/boarding-scan-error.ts` (mirrors
`reschedule-error.ts`). `TICKET_ERROR_ID_NOT_FOUND` is kept exactly as specified — did NOT
"clean up" to `TICKET_NOT_FOUND`, since it must match the backend's stable code verbatim.

**`BoardingListItemDto.boardedAt?: string`** is a new, additive, optional field — every
existing call site (the pre-existing `checkIn()` button flow) is untouched; only the new
`reflectBoardedInList()` (fired after a successful `boardingScan()`) sets it via
`store.mutate()`, the same optimistic-update pattern the existing `checkIn()` method already
uses.

## 2026-07-09 — Scrutinize self-fix: OBRS-176 admin cross-area access

**Worktree:** `OBRS-frontend-wt-admin-cross-area-access` (branch `ao/admin-cross-area-access`).

**Fixed one stale comment the widening left behind.** `staff-layout.component.ts:22-25`
still read "only the owner reaches both portals, so this is effectively an 'owner is here'
check." After OBRS-176 admin is also a cross-portal superset, so admin reaches both portals
too — the comment was factually wrong (the exact "leftover text claiming admin is confined"
class of defect). The `isAdmin = hasAnyRole(['admin'])` gate was already correct (true for
both owner and admin, false for plain salesperson/driver); only the prose was wrong. Rewrote
it to "both owner and admin hold cross-portal access (OBRS-176) ... an 'owner/admin is here'
check." Comment-only, no behavior change.

**Pattern for next time:** when you widen `ROLE_GRANTS`, grep the whole `src/` tree for prose
that asserts the OLD confinement (`only the owner`, `admin.*confin`, `both portals`,
`cannot enter`), not just the file you edited. The sibling `admin-layout.component.ts` comment
was updated in the same PR but this staff-side twin was missed.
## 2026-07-09 — Frontend implementation: usability report detail triage-UX refinement (OBRS-174)

**Worktree:** `OBRS-frontend-wt-usability-triage-ux` (branch `ao/usability-triage-ux`, off
`origin/dev`). Refines the existing admin Usability Reports detail modal from OBRS-77/82/86/106/108/115.

**Un-aliased `detailStatusOptions` from `statusFilterOptions`.** `buildStatusOptions()`
previously set `this.detailStatusOptions = this.statusFilterOptions` (all 5 statuses,
including `new`/`in_review`) — a decision-only dropdown should never let an admin "select"
a triage state as if it were an outcome. Now built from its own `detailStatusValues =
['accepted','resolved','rejected']`. The table filter above the table is untouched (still
all 5 — an admin does want to filter by `new`/`in_review` there).

**Added `seedStatus()` gate so the dropdown starts empty (design-system §3.1) unless the
report already carries a terminal decision.** All three places that seeded
`selectedDetailStatus` (cache-hit branch, optimistic-open, fetch-resolve pristine patch) now
route through `seedStatus(status)`, which returns `''` for anything not in
`accepted|resolved|rejected`. `new`/`in_review` reports now correctly leave Save disabled
until the admin actively picks an outcome — previously a `new` report seeded
`selectedDetailStatus = 'new'`, which is not even a selectable dropdown option once #1 above
un-aliased the options, so Save would have silently rendered with an invalid/blank selection
without this seeding fix.

**Silent auto-promote (`new` → `in_review`) is a SEPARATE code path from `saveStatus()` —
do not be tempted to unify them.** `openDetail()` calls a private `autoPromoteToInReview(id)`
when the just-opened row's status is `'new'`. It calls the same
`adminApiService.updateUsabilityReportStatus(id, 'in_review', null)` endpoint but has its
own `subscribe({next, error})` with NO `alertService` calls in either branch — success
silently updates the store row + `detailCache` entry (so it can't re-fire this session) and
triggers the badge refresh; error is fully swallowed (covers the expected 400
`report.invalid-transition` when another admin's session already advanced the row between
this admin's list fetch and opening it). It must never block or close the modal — the modal
render is driven entirely by the (separate) detail GET subscription, not by this promote
call. Gate is strictly `summary?.status === 'new'` read from the row already in `allReports`
— it does not fire from the cache-hit branch (a cache hit means this report's full detail
was already fetched once this session, so it has either already been promoted or the admin
already made a decision).

**`saveStatus()`'s success branch now also calls `closeDetail()`** (after the existing
`detailCache.delete`/`alertService.success`/`store.refresh()`) — a saved decision is a
completed action, so the modal dismisses back to the table. The error branch is untouched;
the modal stays open on failure so the admin can retry without re-opening.

**Badge refresh: added `UsabilityReportBadgeRefreshService`** (`shared/services/`,
`providedIn: 'root'`, a single `Subject<void>` + `trigger()`) rather than wiring the page
directly to the layout (siblings, no existing channel). `AdminLayoutComponent
.watchNewReportCount()`'s existing `merge(timer(...), router.events...)` gained this as a
third source — same fetch, same error handling, no new code path. See
`docs/adr/0011-usability-report-badge-refresh-trigger.md` for why this is scoped narrowly
(not a general notification bus — that refactor is deliberately DEFERRED, see
`notification-domain-deferred.md` in agent-office memory).

**Test gotcha: an existing OBRS-86 spec (`sends the triage note in the PUT payload...`)
asserted `toHaveBeenCalledOnceWith` on `updateUsabilityReportStatus`.** Since every fixture
in this spec file opens a `status: 'new'` report, and opening now always fires the
auto-promote call on that same spy, the assertion legitimately needed to change from "called
once" to "assert on `calls.mostRecent().args`" — this is a real behavior change (the spy now
does get called twice: once for the silent promote, once for the explicit save), not a test
weakening. Also added a default `adminApiServiceSpy.updateUsabilityReportStatus.and
.returnValue(of({code:200,...}))` in the shared `beforeEach` so every existing fixture (most
of which open a `new`-status report and therefore now trigger the auto-promote) has a sane
default response without each test needing to opt in.

**i18n:** changed `ADMIN.USABILITY_REPORTS.STATUS.SAVE` value only (same key) in en/th/zh —
`"Save Status"/"บันทึกสถานะ"/"保存状态"` → `"Save"/"บันทึก"/"保存"` (shorter label now that the
button sits next to the status dropdown, whose own `LABEL` key already reads "Status").

**Test results:** `ng test --watch=false --browsers ChromeHeadless` — see run output in the
implementation report. `ng build --configuration production` — see run output.
## 2026-07-09 — Frontend implementation: `/admin/reports` MVP (OBRS-40)

**Worktree:** `OBRS-frontend-wt-reporting-summaries` (branch `ao/reporting-summaries`).
`ng test`: 882/882 PASS. `ng build --configuration production`: PASS (1.45 MB initial,
under the 1.5 MB budget). Diff vs branch HEAD is scope-only (7 files modified, 2 new:
`reports-summary.interface.ts` + the `pages/reports/` folder).

**PO simplification applied — the whole ADR-0011 guard-relaxation was dropped, and I found
(and reverted) a prior partial attempt at it already sitting in the worktree.** On starting,
`README.md` had an uncommitted diff describing a salesperson cross-portal-access ADR, and
`docs/adr/0011-admin-stat-tile-and-reports-cross-portal-access.md` existed as an untracked
file proposing: relax the top-level `/admin` guard to `['admin','salesperson']`, then
re-tighten every *other* existing child route with its own `canActivate`, plus a
`StaffLayoutComponent` "Reports" shortcut and `isSalesperson` nav filtering. The task
explicitly superseded this (salesperson access deferred to OBRS-129) — I ran
`git checkout -- README.md` and deleted the ADR file before starting, so no trace of the
dropped approach reached this commit. **Lesson: when a task says "apply these
simplifications (they remove work done for an earlier version of this spec)," check the
worktree for uncommitted/untracked leftovers from that earlier version before writing new
code — don't just diff your own additions against a clean baseline.**

**Inlined the KPI tiles — did not extract `AdminStatTileComponent`.** Copy-pasted
`dashboard-page.component.html`'s `.admin-card.admin-kpi` markup (icon/big-number/skeleton)
directly into `reports-page.component.html`, per the "smallest diff" instruction. Revenue
tile uses `.admin-kpi-icon.is-success` (same visual role as the dashboard's Revenue tile).

**Revenue gating is presence-based, not role-based — verified both the store and the
component read it that way.** `ReportsTilesDto.revenue?` and `ReportsDailyRowDto.revenue?`
are optional; `ReportsPageComponent.showRevenue = !!tiles?.revenue` gates both the tile
(`*ngIf="showRevenue"`) and the table column. No `AuthService`/role check anywhere in this
page — forward-compatible with OBRS-129 without a frontend change when the server starts
omitting `revenue` for a salesperson viewer.

**`ReportsStore` is the first range-parameterized `AdminCollectionStore` subclass — kept as
a single root-scoped cache, not one per range.** `setRange(from, to)` mutates the store's
own `fromDate`/`toDate` fields then calls `refresh()`; `fetch()` always reads the current
range. This preserves the SWR contract (re-entering `/admin/reports` shows the
last-fetched range immediately) without needing a cache keyed by range, since only one
range is ever being viewed. Default range is last 7 days inclusive of today, computed via
local (not UTC) date math — matches `schedules-page.component.ts`'s own
`toDateInputValue`/date-filter convention, not `toISOString()` (which would shift a day near
a local-midnight boundary in certain timezones — caught this while writing the store spec's
"defaults to last 7 days" test, which originally used `toISOString()` and would have been
flaky).

**Server 400 backstop needed a way to surface `errorCode` without changing the shared
`AdminCollectionStore` base class.** The base class's `error$` is a bare boolean (by design
— it's shared by every admin store and none of the others need more). Added a
store-local `lastErrorCode` getter to `ReportsStore` only: `fetch()` catches the raw error,
extracts `error.error.errorCode` into a private field, then re-throws so the base class's
existing error-swallowing/cache-retention behavior is unchanged. The page reads
`store.lastErrorCode` inside its own `error$` subscription to pick between
`RANGE_INVALID`/`RANGE_TOO_LARGE`/generic `LOAD_FAILED` — matches design-system §9 (branch
on `errorCode`, never the localized `message`) without touching a class every other admin
page depends on.

**Client guard runs before every dispatch, blocks on `from > to` or a >366-day span, and
does NOT call `store.setRange()` when it fires** — regression-tested directly (two specs
assert `store.setRange` was never called after an invalid range change). The empty-range
(all-zero 200) case is intentionally NOT routed through the error path at all — it's a
`isEmptyRange` getter checked independently of `rangeError`/`loadError`, rendering a
friendly `ADMIN.REPORTS.EMPTY_RANGE` note alongside the normal (zeroed) tiles/table.

## 2026-07-08 — Frontend implementation: promo code system (OBRS-109 / #37)

**Worktree:** `OBRS-frontend-wt-promo-codes` (branch `ao/promo-codes`, off `dev`, on top of
#36's shipped round-trip admin page). Implements the UX spec below end to end. `ng test`:
675/675 PASS. `ng build --configuration production`: PASS (1.42 MB initial, under budget).

**Backend does not exist yet for either half of this feature — built against the SA/UX-locked
shape, flagged in `docs/handoff.md`, same pattern as OBRS-85.** Checked
`OBRS-backend-wt-promo-codes`: still at `origin/dev` HEAD, no promo-code commits. Neither
`POST /api/private/promotions/validate` nor the general `/api/private/admin/promotions`
CRUD exist. Filed one consolidated Contract Request covering both. Until the backend lands:
the customer promo field will show a generic apply-failed error on every attempt, and the
admin list/CRUD calls will 404 (skeleton/error states render gracefully, no crash).

**Split of responsibility between `PromoCodeFieldComponent` and `PassengerInfoSummaryComponent`
was a judgment call — the field does NOT render Subtotal/Discount/Total.** The UX spec bundles
"collapse to a chip + show Subtotal/Promo discount/Total" as one bullet, but the required i18n
keys (`REVIEW_SCHEDULE_BOOKING.TOTAL.SUBTOTAL`/`PROMO_DISCOUNT`) live in the *summary's own*
existing i18n namespace, not a `PROMO_CODE.*` one — strong signal the breakdown belongs to the
consuming summary component, which already owns the "Total" row. Went with:
`PromoCodeFieldComponent` = input/apply/chip/inline-error only (generic, portable, its own
`PROMO_CODE.*` keys); `PassengerInfoSummaryComponent` owns swapping its existing plain "Total"
row for Subtotal/Discount/Total once `(applied)` fires. Keeps the shared component reusable
without dragging a page-specific i18n namespace into `shared/components/`.

**Preview→submit race handled via a ViewChild chain, not a shared store.** `PromoCodeFieldComponent`
exposes `applyExternalError(errorCode)` (reverts to input state, keeps the typed code visible,
shows the mapped error, re-emits `(removed)`). `PassengerInfoSummaryComponent.revertPromoWithError()`
forwards to it via `@ViewChild`. `PassengerInfoComponent.handleBookingCreationError()` calls that
via its own `@ViewChild(PassengerInfoSummaryComponent)` — same hand-off pattern already used for
the passenger/booker form ViewChildren in this component, just one level deeper.

**`createBooking`'s new `suppressGlobalErrorAlert` param opts out of the error alert ONLY, not the
loading dialog.** `booking.service.ts` builds a context with just `SKIP_GLOBAL_ERROR_ALERT` (a new
private `silentErrorContext()`, separate from the existing `silentContext()` used by cancel/list
calls which also skips the loading alert) — the spec only asked to suppress the *error* alert for
this call. `PassengerInfoComponent.handleBookingCreationError()` then branches on
`error.error.errorCode`: a `PROMO_CODE_*` code reverts the field inline (no alert at all); any other
error manually calls `alertService.error(...)` with a new `PASSENGER_INFO.ALERT.CREATE_FAILED` key,
replicating what the (now-opted-out) global interceptor would have shown. The no-promo-code path is
byte-identical to before (`suppressGlobalErrorAlert` defaults `false`).

**Two `admin-btn-primary` buttons now coexist on one page (Save on `RoundTripPromotionCardComponent`,
Add Promotion Code on the list below) — a deliberate reading of design-system §4, not an oversight.**
The UX spec explicitly labels the new Add button "(primary)" while also requiring the round-trip
card's existing Save button preserved verbatim. Treated as two independently-scoped cards (each
with its own bounded action), analogous to how `vehicles-page` already has one primary "+Add" for
the table plus a separate primary "Save" inside its own modal — just both visible on-screen
simultaneously here instead of one being inside a modal. Flagging for Scrutinize/UX in case the
rule is meant to bind at the page level, not the card level.

**`RoundTripPromotionCardComponent` is a verbatim extraction — `RoundTripPromotionStore` and its
partial-PATCH/pristine-patch contract are untouched.** Moved `promotions-page.component.{ts,html,scss,spec.ts}`
to `round-trip-promotion-card/round-trip-promotion-card.component.*` unchanged except the class/selector
name and import path depth (+1 level). `PromotionsPageComponent` is a new file: hosts the card at the
top, then a `PromotionsListStore extends AdminCollectionStore<PromotionRespDto[]>` (sibling to
`VehiclesStore`) backing a list + create/edit modal (optimistic open, pristine-only late-patch from
`GET /{id}`, `PUT /{id}` full-replace) + soft-delete confirm modal, modeled on `vehicles-page`'s
skeleton. A row with `slug === 'round_trip'` renders "Managed above" instead of Edit/Delete icons —
one edit surface per entity, no risk of two forms fighting over PATCH-partial vs PUT-full-replace.

**Soft-delete keeps the row, just flips `status` to `'inactive'` locally (optimistic) — does not
filter it out of the list**, unlike `vehicles-page`'s hard-delete `confirmDelete()` which does
`list.filter(...)`. This was the one place I deliberately did NOT copy the vehicles skeleton
verbatim, per the UX spec's explicit "becomes Inactive, not removed" copy requirement.

**`discountType`/`status`/`autoApply` dropdowns start empty on create, pre-fill on edit — the
create-modal pre-seed anti-pattern in `vehicles-page.component.ts::openCreateModal()`
(`vehicleType: this.vehicleTypeOptions[0]?.code ?? ''`) was NOT copied here.** That pre-seed looks
like a live violation of design-system §3.1 despite the doc citing the Vehicle Type bug as the
motivating example — flagging for Scrutinize/tech-lead rather than silently fixing an unrelated
page in this PR.

## 2026-07-08 — UX spec: promo code system (OBRS-109) — key findings for the implementer

**Worktree:** `OBRS-frontend-wt-promo-codes` (branch `ao/promo-codes`, off `dev`, includes
#36's shipped `/admin/promotions` singleton page + payment-summary discount line). No
code written this pass — this is the UX/UI spec handoff. Full spec is in the OBRS-109
ticket thread; load-bearing findings below.

**Key decision — customer promo entry is INSTANT PREVIEW, not apply-at-submit — and it
needs a new backend endpoint.** The locked backend only validates/applies a
`promotionCode` inside `POST /api/private/bookings` (no preview exists). I'm
recommending backend add a small stateless `POST /api/private/promotions/validate
{code, amount}` (reuses the same validation logic, persists nothing, no usage
increment) so the customer can see "Code XYZ applied: -50 THB" before committing to the
booking — standard checkout expectation, and avoids a submit → reject → retype loop
where the "Next" button doubles as "create the whole booking." Tradeoff stated in the
spec: apply-at-submit needs zero new backend but gives worse UX (blind submit, and a
wrong code fails the entire booking-creation call, not just the coupon). If backend
cannot add the endpoint in this increment, fall back to (a) apply-at-submit with the
same entry field/errorCode-mapping, just remove the live preview call and forward
`promotionCode` straight into `buildBookingPayload()`.

**Placement: `passenger-info-summary` sidebar, not `review-schedule-booking` or
`payment`.** Traced the flow like OBRS-85 did: `review-schedule-booking-total` and
`passenger-info-summary` both compute totals client-side from the same selectors: only
`passenger-info-summary` sits directly above the "Next" button that actually calls
`createBooking()` (in `passenger-info.component.ts::onSubmitPassengerInfo`) — the
natural "review order + apply code + place order" moment. This is a **deliberate,
scoped reversal of OBRS-85 Finding 1** ("review/passenger-info structurally cannot show
a real discount") — that finding was about the *auto-apply round-trip* discount, which
still has no preview path and still only surfaces on `payment-summary` post-booking,
unchanged. The new validate endpoint only covers the *manually typed* code, so
`passenger-info-summary` can show a real, server-validated (not client-guessed) preview
for that case only.

**`payment-summary.component.html` line 84's `PAYMENT.SUMMARY.DISCOUNT_ROUND_TRIP` label
needs a generic replacement.** Post-#37 the discount snapshot on a booking can come from
either the round-trip auto-apply OR a manually typed code — the backend gives no
`discountSource` field to distinguish them, so a round-trip-specific label is now
wrong half the time. Spec adds a generic `PAYMENT.SUMMARY.DISCOUNT` key and repoints
that one template binding; leaves `DISCOUNT_ROUND_TRIP` in the i18n files as harmless
dead weight rather than chasing every locale file for a delete.

**Admin list/CRUD reuses the `vehicles-page` skeleton almost verbatim** (list +
create/edit modal + soft-delete confirm modal, `AdminCollectionStore<PromotionRespDto[]>`
sibling to `VehiclesStore`). The existing `PromotionsPageComponent` (today: a single
round-trip edit form, `RoundTripPromotionStore`) gets extracted unchanged into a new
`RoundTripPromotionCardComponent` child — pure move, not a rewrite, to protect the
already-tested partial-PATCH/pristine-patch logic. The round-trip row still appears in
the general list (backend's `GET /admin/promotions` returns it as a normal row), but its
Edit/Delete icons are replaced with a muted "managed above" label — one edit surface per
entity, no risk of two divergent forms fighting over the same PATCH-partial vs
PUT-full-replace contract.

**`autoApply` (boolean) is modeled as a 2-option `app-admin-dropdown` (Yes/No), not a new
toggle-switch component** — no toggle pattern exists anywhere in this admin module yet,
and the round-trip form already sets the precedent of representing a boolean
(`active`) as a string-valued canonical dropdown. Reuses the canonical control instead
of introducing a 4th form-control type.

**Translations sub-form covers en/th/zh (3 locales), not en/th (2) like
`lookup-settings`.** `lookup-settings-page` only has `enLabel/thLabel` fields — but that
predates the ZH locale rollout on the customer site. Promotion labels/descriptions are
the trilingual site's actual customer-facing content, so the create/edit modal gets 6
translation inputs (EN/TH/ZH × label/description), matching `AdminTranslationReqDto[]`
already defined in `admin-api.service.ts` (reused type, not a new one).

## 2026-07-08 — Frontend: usability-report-triage (OBRS-86) (SELF-FIXED)

**Worktree:** `OBRS-frontend-wt-usability-report-triage` (branch `ao/usability-report-triage`, diff vs `origin/dev`)

**Finding (self-fixed) — dark-mode `.admin-status.is-accepted` was light-green-on-light-green (~1.3:1, unreadable).**
The new accepted pill added `--admin-accepted-text: #6fe08a` inside the `.admin-shell.is-dark`
block, while leaving `--admin-accepted-bg: #b7f3c0` (a light pastel green) unchanged. Every
OTHER status pill (success/warning/danger) is a self-contained pastel chip: light bg + dark
text in BOTH themes — none override their text color in dark mode. The lone dark-mode text
override put a light green (#6fe08a) on a light green bg → ~1.31:1 contrast, effectively invisible.
**Fix:** removed the dark-mode `--admin-accepted-text` override so the pill keeps its light-mode
dark-green text (#0a3d1d) on #b7f3c0 in dark mode too — ~9.8:1, readable, and consistent with
the other pills. Still a distinct green vs the blue `is-success` "resolved" pill, so intent holds.
**Pattern to remember:** the admin status pills are theme-agnostic pastel chips — do NOT add a
dark-mode color override for a new status unless you override the *background* to a dark surface
too. Match the existing token pattern (bg + text defined once in the light `.admin-shell` block).
## 2026-07-08 — Frontend implementation: round-trip discount UI (OBRS-85)

**Worktree:** `OBRS-frontend-wt-round-trip-discount` (branch `ao/round-trip-discount`).
Implements the UX spec below (Findings 1-4) end to end. `ng test`: 631/631 PASS.
`ng build --configuration production`: PASS (1.41 MB initial, under the 1.5 MB budget).

**Backend contract does not exist yet — built against the SA-locked shape, flagged in
`docs/handoff.md`.** Neither `OBRS-backend` (main) nor its `-wt-round-trip-discount`
worktree has a controller/DTO for `GET|PATCH /api/private/promotions/round-trip` at
time of writing — only the `Promotion`/`PromotionTranslation` JPA entities exist. Built
`AdminApiService.getRoundTripPromotion()` / `updateRoundTripPromotion()` directly against
the `Promotion` entity's fields (`discountValue`, `minBookingAmount`, `startDateTime`,
`endDateTime`, `status`, `discountType`, `usageLimit`, `currentUsage`, `slug='round_trip'`,
`code='RT20'` per `data.sql`), and filed a Contract Request in `docs/handoff.md` with the
assumed `PromotionRespDto` shape. The `/admin/promotions` page will show its
`ADMIN.PROMOTIONS.LOAD_FAILED` state until the backend implements the endpoint. Also
flagged there: `data.sql` only seeds a `promotion_status` lookup value of `active` — the
Active/Inactive dropdown needs an `inactive` value added too (worked around client-side by
building the two options from i18n rather than fetching a lookup category, so the FE isn't
blocked by that gap).

**Partial PATCH is driven by FormControl `dirty`, not value-diffing.** The edit form is a
single `FormGroup`; `buildPartialPayload()` includes a field only when its own control is
`.dirty` (regardless of whether the value is textually unchanged). This was chosen over
diffing the raw value against `this.promotion` because the date fields round-trip through
`Date.prototype.toISOString()` — a fetched `"2026-01-01T00:00:00+07:00"` and the
re-serialized value are the *same instant* but different strings, so string-equality
diffing would spuriously include an untouched date field on every save. `dirty` sidesteps
that entirely. After a successful save, `promotionForm.markAsPristine()` (which Angular
cascades to every child control) clears dirty state so the next background SWR revalidate
patches those controls again without a visual jump.

**Reused the schedules-edit-modal pristine-patch contract (design-system §6) for the
SWR case, not just the modal case.** `AdminCollectionStore` re-emits in the background
(`refresh()`) while the admin may be mid-edit on this single-form page (no modal open/close
boundary here). First `data$` emission → full `.reset()`; subsequent emissions → patch only
controls where `control.pristine` — same guard as the schedules edit modal's late-arriving
detail fetch, just triggered by the SWR revalidate instead of an async detail GET.

**Design-system §5 (pill inputs) applied narrowly, not by editing `admin-theme.scss`.**
The shared `.admin-field`/`p-calendar` classes used by every other admin page are still the
10px-radius pre-pill shape (tracked debt, §13) — I did not touch that global file. Instead
`promotions-page.component.scss` overrides `.admin-field { border-radius: $radius-pill; }`
and adds a `.promotion-calendar` `::ng-deep` override, both scoped to this component only
(Angular's emulated encapsulation confines the plain `.admin-field` rule; `::ng-deep` was
only needed for the PrimeNG-rendered calendar internals). No raw hex was introduced — the
calendar override reads `var(--admin-surface-card)`/`var(--admin-text)`/`var(--accent-strong)`/
`var(--accent-soft)`, matching `.admin-field`'s own tokens instead of copying the raw-hex
`schedule-calendar-filter` styles from `schedules-page.component.scss`.

**PaymentSummaryComponent footer: two `*ngIf ... else totalOnly` pointing at the same
template ref.** `booking$` (via `selectBooking`) and `hasDiscount(booking)` are two
independent conditions, but both "no" branches must render byte-identical `totalOnly`
markup ("no visual change" is a UX requirement, not just a suggestion). Angular allows
multiple `*ngIf/else` directives in the same template to reference one `<ng-template
#totalOnly>`, so the "no discount" path (booking absent OR discount not `>0`) only exists
once in the DOM output regardless of which condition was false. If you touch this template,
keep both `else totalOnly` pointers — collapsing to a single flag is fine, just don't
duplicate the total-only markup (a copy-paste would drift the two silently).

**Walk-in checkout discount plumbing is genuinely inert — verified, not just asserted.**
`WalkInCheckoutComponent.@Input() discountAmount` defaults to `null`; `netAmount` getter
returns `totalAmount - (discountAmount ?? 0)`, so with the default every existing getter
(`changeDue`, `canSell`) and the 5 pre-existing spec assertions on them are byte-identical
to before. Confirmed via `ng test` (no walk-in-checkout regressions) — this was a forward-
compat/parity addition per the UX spec's Finding 2, not something exercisable today.

## 2026-07-08 — UX spec: round-trip discount (OBRS-85) — key findings for the implementer

**Worktree:** `OBRS-frontend-wt-round-trip-discount` (branch `ao/round-trip-discount`). No
code written this pass — this is the UX/UI spec handoff. Full spec is in the OBRS-85 ticket
thread; the load-bearing findings that will surprise whoever implements are below.

**Finding 1 — only `payment-summary` can show a REAL discount line; review/passenger-info
cannot, by construction.** Traced the actual booking flow: `review-schedule-booking-total`
and `passenger-info-summary` both compute their totals *entirely client-side* from
`selectScheduleBooking`/`selectScheduleFilter` (schedule `pricePerSeat` × passenger count) —
neither makes a server call. The booking is only created (`POST /api/private/bookings`) at
the END of `passenger-info.component.ts::onSubmitPassengerInfo`, and `discount_amount_snapshot`
is a server-computed field that only exists *after* that call. So the review page and the
passenger-info sidebar are pre-booking *estimates*; they structurally cannot carry a real
discount without the FE precomputing one, which the backend spec explicitly forbids. Do NOT
add a discount line there — the spec calls this out and scopes the real change to
`payment-summary.component.ts` (used inline by `payment-creditcard`/`payment-qrcode`, the only
summary that renders AFTER booking creation, reading from the NgRx `booking` store).

**Finding 2 — `walk-in-checkout`'s discount line will be dormant on ship.** Two independent
reasons: (a) `sell-page.component.ts` hardcodes `bookingType: 'one_way'` for every walk-in
sale — round-trip walk-in booking doesn't exist in the UI yet, so the discount can never
trigger; (b) even if it did, `WalkInCheckoutComponent.totalAmount` is a pre-sale client getter
(`pricePerSeat * selectedSeats.length`) computed before `createWalkInBooking`/`payWalkIn` are
ever called — same pre-transaction timing gap as Finding 1. The spec adds the `@Input()
discountAmount` plumbing there anyway (parity + forward-compat with a future walk-in
round-trip feature) but flags explicitly that it cannot render under current functionality —
don't spend QA time trying to trigger it via walk-in.

**Finding 3 — `CreateBookingResponse`/`BookingState` currently only carry `{bookingId,
bookingNumber}`.** `booking.service.ts::normalizeCreateBooking` is the single seam that
resolves the booking-intake response — it needs the three new optional fields
(`totalAmount`/`discountAmountSnapshot`/`netAmount`) added there, in the `CreateBookingResponse`
and `BookingState` interfaces (`shared/interfaces/booking.interface.ts`), and forwarded through
`passenger-info.component.ts::setBookingStore`. No new NgRx actions/reducers needed —
`invokeSetBookingApi`/`invokeSetBookingApiSuccess` already carry the whole `BookingState`
generically, so extending the interface is sufficient plumbing.

**Finding 4 — OWNER cannot reach `/admin` today, full stop.** The top-level route guard
(`app-routing.module.ts`) gates the whole `/admin` module on `requiredRoles: ['admin']`, and
`AuthService.hasAnyRole`'s hierarchy expansion (admin > owner > salesperson > driver > customer)
only expands a role *downward* — an `owner` session's effective roles are
`{owner,salesperson,driver,customer}`, which does not include `'admin'`. So today, an OWNER
literally cannot open any admin page, even though the backend's round-trip promotion PATCH
allows OWNER/ADMIN. This is a pre-existing gap, not something this light UI ticket should
silently patch by loosening the global admin gate — flagged in the spec as a call-out for
the SA/PM to decide, not resolved here.

## 2026-07-08 — Frontend: report-row-clickable (OBRS-82) (SELF-FIXED)

**Worktree:** `OBRS-frontend-wt-report-row-clickable` (branch `sit/report-row-clickable`, diff vs `origin/dev`)

**Finding (self-fixed) — keyboard path lacked the interactive-target guard the mouse path has.**
The whole `<tr>` is now clickable/activatable. `onRowActivate` (mouse) correctly bails
when the click originates from an inner control via `target.closest('button, a, …')`,
so the View button opens the detail exactly once. But `onRowKeydown` (keyboard) had NO
equivalent guard: a keydown bubbling up from the focused View button on Enter/Space
was handled by the row too — it called `preventDefault()` + `openDetail()`. Combined
with the button's own native activation this double-fires the detail GET (or, when
`preventDefault` suppresses the button, hijacks the button's activation through the
row handler — browser-dependent, non-deterministic). The two activation paths must
stay symmetric.
**Fix:** guard `onRowKeydown` with `if (event.target !== event.currentTarget) return;`
so only a keydown on the row *itself* (not an inner focused control) activates it.
Added a regression spec: Enter bubbling from `button.admin-btn-small` must NOT call
`openDetail` from the row handler. Pattern to remember: **whenever you add a row/card-level
click handler alongside inner controls, the keyboard handler needs the same
origin guard as the mouse handler — don't guard one path and leave the other open.**

**Returned to developer/UX (not self-fixed — design decision) — `role="button"` on `<tr>`.**
Overriding the row's implicit `role="row"` with `role="button"` breaks the table's
accessibility structure (its `<td>` cells lose their valid `row` parent) and adds a
second tab stop per row that duplicates the already-accessible View button. Since every
row already has a keyboard-reachable View button that opens the same modal, the row-level
`role`/`tabindex`/`aria-label`/`keydown` are redundant for AT+keyboard users. Simpler,
more accessible option: keep row-click as a pure *mouse* affordance (`(click)` +
`cursor:pointer` only), drop the row-level ARIA/keyboard surface and the `ROW_ARIA` key.
Flagging for UX rather than unilaterally removing declared a11y scope.


## 2026-07-08 — Frontend: report-detail-ux (OBRS-77) (SELF-FIXED)

**Worktree:** `OBRS-frontend-wt-report-detail-ux` (branch `sit/report-detail-ux`, diff vs `origin/dev`)

**Finding (self-fixed) — optimistic-open clobbered the admin's in-progress status edit.**
`openDetail()` now opens the modal optimistically and seeds `selectedDetailStatus`
from the summary row, then fires the detail GET (~2s on SIT). The GET's `next`
callback unconditionally re-assigned `this.selectedDetailStatus = detail.status`.
If the admin changed the status dropdown during that ~2s window, the resolving
GET silently reverted their selection to the server value. This is exactly the
hazard design-system.md §6 names: *"patch detail into pristine-only controls."*
The status dropdown is the one user-editable control that gets patched, and it
was not pristine-guarded. **Fix:** only adopt the fetched status when nothing is
selected yet (`if (!this.selectedDetailStatus)`) — the summary already seeded it
for the normal case, and the guard preserves an in-flight edit. Added a locking
spec ("does not clobber an in-progress status selection…") that drives the GET
through a `Subject`, changes status mid-flight, then resolves — it fails on the
old code (`Expected 'new' to be 'resolved'`) and passes on the fixed code.
**Lesson:** whenever a modal goes optimistic-open, audit *every* subscribe
callback that writes to a user-editable control — seed-on-open + patch-on-arrive
must be pristine-guarded or it becomes a silent edit-clobber race.

**Also self-fixed (state hygiene):** `closeDetail()` didn't reset `isDetailFetching`,
leaving it stuck `true` after closing mid-fetch. Currently invisible (every
`openDetail` path re-sets the flag), but it left the state machine incoherent —
added `this.isDetailFetching = false;` to `closeDetail()`.

**Confirmed correct (no action needed):**
- **Lightbox ESC/backdrop routing.** Only the detail modal carries
  `adminModalBackdrop`; the lightbox is a plain child overlay. The single ESC
  listener routes through `onDetailBackdropDismiss()`, which closes the lightbox
  first when open, else the detail modal — no double-ESC dismiss, no path that
  strands the lightbox or closes the modal underneath. Backdrop-click on the
  lightbox is handled by its own `(click)` (target===currentTarget) and does not
  reach the detail directive's host-click (target ≠ detail backdrop element).
- **Cache stores only full detail.** The summary skeleton is only assigned to
  `detailReport`, never to `detailCache`; only the GET response is cached. Stale
  guard (`selectedReportId !== id`) protects the view-write in `next`; `saveStatus`
  invalidates the entry via `detailCache.delete(id)`. Optimistic `store.mutate` +
  AlertService + `store.refresh()` preserved.
- **Colors are tokens/established ink.** Lightbox close bg `rgba(25,28,30,.55/.75)`
  is the admin ink used throughout (base `#191c1e`); the scrim is inherited from
  `.admin-modal-backdrop`. No new raw hex. i18n keys (`IMAGE_ENLARGE`) present in
  en/th/zh; `COMMON.UPDATING`/`COMMON.CLOSE` exist. Backdrop directive reused, not
  forked. One primary (Save Status); × is a themed icon affordance.


## 2026-07-01 — Frontend: stop-detail-card-cleanup (OBRS-72) (SELF-FIXED)

**Worktree:** `OBRS-frontend-wt-stop-detail-card-cleanup` (diff vs `origin/dev`)

**Finding (self-fixed) — e2e test still asserted the removed "View photo" button.**
The diff removed the "View photo" `p-button` from `route-stop-detail-card`, but
`e2e/tests/route-map.spec.ts` (lines 223 & 225) still asserted
`button hasText: 'View photo'` was visible on both the pickup and dropoff cards.
`ng test` (Karma unit) passed 606/606 and was the only suite the implementing
agent ran, so this regression went unnoticed — Playwright e2e is a separate
suite. **Lesson:** when deleting a UI element, grep the `e2e/` folder (and any
`.spec.ts`) for its label/text, not just the component unit spec. `ng test`
green does not cover e2e. **Fix:** removed the two "View photo" assertions and
updated the comment on line 222 to note OBRS-72 removed the button.

**Confirmed safe (no action needed):**
- `mapsApiKey` — still used by the *sibling* `route-map-panel` component (live
  interactive map) and its 2 parent bindings + `environment.mapsApiKey`. Removal
  was correctly scoped to the detail card only.
- `.detail-photo` SCSS class — still used by the inline photo `<img>`, not dead.
- `*ngIf="stop.address"` — truthy check correctly guards both `null` and `''`
  (empty string is falsy), so no separate empty-string check is needed. (Note:
  `RouteStop.address` is typed `string` but is null at runtime — a pre-existing
  interface inaccuracy, out of scope for this hotfix.)
- No other orphaned i18n keys; en/th/zh remain valid JSON.

## 2026-06-30 — Frontend: home-route-road-snap (issue #74) (SELF-FIXED)

**Worktree:** `OBRS-frontend-wt-home-route-road-snap` (diff vs `origin/dev`)

**Finding 1 (self-fixed) — duplicate Directions API call on /home re-navigation.**
Angular runs `ngOnChanges` (initial inputs) *before* `ngOnInit`. In
`route-map-panel.component.ts`, when `window.google.maps` is already loaded at
`ngOnChanges` time (any 2nd+ visit to /home after the Maps script loaded once),
`recomputeMapData()` fires `requestDirectionsPath(seq=1)`, and then `ngOnInit`'s
`.then()` deferred re-fire also fired it again with the *same* `seq=1`. Both pass
the stale guard and both hit the (billed) Directions API. Not a correctness bug
(same result, no stale overwrite) but a doubled API cost on every revisit.
**Fix:** added `private dirReqDispatchedSeq = -1;` — set to the seq whenever a
request is actually dispatched (in `recomputeMapData` and in the `ngOnInit`
re-fire), and the `ngOnInit` re-fire now only fires when
`dirReqDispatchedSeq !== dirReqSeq`. So the deferred re-fire only runs for the
genuine "stops arrived before maps loaded" case. 30/30 panel specs still pass.

**Finding 2 (self-fixed) — orphaned CSS.** `.contact-footer` rule remained in
`route-map-home.component.scss` after all three `.contact-footer` blocks were
removed from the template. Deleted the dead rule.

**Lesson for the developer:** `ngOnChanges` fires before `ngOnInit`. Any
"deferred until async resource ready" re-fire scheduled in `ngOnInit` must be
guarded against the case where the resource was *already* ready during
`ngOnChanges` (which then already did the work) — otherwise you double-dispatch.
A dispatched-seq marker is the cheap fix.

**Left for the developer (NOT self-fixed):** dead i18n keys now unused after the
removals — `HOME.ROUTE_MAP.VIEW_MAP` and the placeholder
`HOME.ROUTE_MAP.CONTACT_TITLE/CONTACT_PHONE/CONTACT_HOURS` ("Enquiries" /
"02-xxx-xxxx") in en/th/zh.json. Harmless but dead; remove if you want hygiene
(spans 3 locale files). The global `shared/components/footer` uses the separate
`HOME.FOOTER.*` keys and is untouched.

## 2026-06-30 — Frontend: ao/report-usability-issue (SELF-FIXED)

**Branch:** `ao/report-usability-issue` (commit `b004343`)

**Finding (self-fixed):** In `usability-reports-page.component.ts` the two
`app-admin-dropdown` option arrays (`statusFilterOptions`, `detailStatusOptions`)
were initialized with **hardcoded English labels** (`'New'`, `'In Review'`,
`'Resolved'`, `"Won't Fix"`). `app-admin-dropdown` renders `option[labelKey]`
verbatim with no translate pipe, so a Thai/Chinese admin saw English status
labels in the filter dropdown and the detail status selector — while the same
statuses rendered translated in the table via `statusLabel()`
(`ADMIN.USABILITY_REPORTS.STATUS.<status>`). Inconsistent + an i18n violation.

**Fix:** Build both option arrays from i18n in `ngOnInit` via a private
`buildStatusOptions()` that maps `statusValues` → `translate.instant('ADMIN.USABILITY_REPORTS.STATUS.<value>')`,
and rebuild on `translate.onLangChange` (takeUntil(destroy$)). The translated
STATUS keys already existed in en/th/zh, so no new i18n keys were needed.

**Lesson for the developer:** `app-admin-dropdown` does NOT translate labels —
whenever you feed it `{value,label}` options, the `label` must already be a
translated string. Never hardcode user-facing option labels; build them from
existing i18n keys (and rebuild on `onLangChange` so the dropdown follows the
language switcher like the rest of the page).

## 2026-06-26 — Frontend: ao/route-pickup-dropoff-map

**Branch:** `ao/route-pickup-dropoff-map`

**Feature:** Interactive Pickup/Drop-off Route Map — replaces `<app-station-home>` on `/home`
with a 3-panel (desktop) / 3-tab (mobile) pickup/drop-off selector backed by
`GET /api/routes/{slug}/pickup-dropoff`.

**New dependency:** `@angular/google-maps@^18` — added to package.json.
Map rendering is degraded-graceful: `mapsApiKey = ''` in all envs → placeholder only.
No JS error when key is blank.

**Key patterns used:**
- All 5 new components declared in `HomeModule` (no standalone).
- `BreakpointObserver` from `@angular/cdk/layout` drives `isDesktop` flag for 3-col ↔ 3-tab switch.
- `RouteMapHomeComponent` injects `RouteMapService` directly (smart container; not a page component).
- `HomeComponent.@ViewChild(HomeBookingComponent)` hand-off: picks up confirmed slug, resolves
  to `StationApi` from `selectProvinceWithStation`, calls `onStartStationChange` /
  `onEndStationChange`, checks `isPassengerSelected` getter before calling `onSearch()`.
- `HomeBookingComponent.isPassengerSelected` getter added (minimal public surface — sums
  all passengerInfo counts from the form control).
- ADDENDUM A2 status normalization: `String(status?.code ?? status?.slug ?? status).toLowerCase() === 'active'`
- ADDENDUM A3 script race: script injected in `ngOnInit` only if mapsApiKey set and `window.google?.maps` absent.
- `tsconfig.spec.json` types array updated to include `"google.maps"` so spec build resolves
  `google.maps.*` types from the `/// <reference types="google.maps" />` in @angular/google-maps.
- `home.component.spec.ts` updated to pass 3 constructor args after HomeComponent signature change.

**ADR:** `docs/adr/0005-route-pickup-dropoff-map.md` documents the component family,
Google Maps integration, ViewChild hand-off pattern, and status normalization rationale.

**Test result:** 517/517 PASS. Production build: 1.38 MB initial (under 1.5 MB budget).



## 2026-06-26 — Scrutinize self-fix: ao/sidebar-hover-expand pin visible on mobile

**Branch:** `ao/sidebar-hover-expand` (commit `dc32eab`)

**Defect found and self-fixed:** Every `.admin-sidebar-pin` rule (display, opacity,
align-self, hover, etc.) lived *inside* the `@media (min-width: 1101px)` desktop block in
`src/styles/admin-theme.scss`. There was no base rule, so at <=1100px the pin rendered as a
fully visible, clickable unstyled `<button>` between the brand and nav in the mobile drawer —
contradicting "mobile drawer unchanged." Worse, a mobile tap calls `togglePin()`, which writes
`obrs-sidebar-collapsed='0'`, silently making the *next desktop* session start pinned.

**Fix (under 10 lines):** added a base `.admin-sidebar-pin { display: none; }` next to the
sibling `.admin-menu-toggle` / `.admin-sidebar-backdrop` rules, which already use this exact
"hidden by default, revealed in the desktop media query" pattern (the desktop block already sets
`display: inline-flex`). **Pattern to remember:** when an element should only exist at one
breakpoint, give it a base `display:none` and reveal it in the media query — do not let the
*only* styling for an element live inside a media query, or it leaks as an unstyled element at
other widths.


## 2026-06-25 — QA pass: feature/trip-details-edit Editable Trip Details

**Branch merged:** `feature/trip-details-edit` → `dev`
Merge commit: `0ddc7bc`

**Defect found and self-fixed during QA:**
Integration Risk #1 confirmed. The frontend matched the backend 400 capacity-error by calling
`.includes('schedule.error.capacity.exceeds-type-max')` on `error.error.message`, but the backend
localizes `message` to prose ("Seating capacity exceeds vehicle type maximum") via
`messageSource.getMessage()`. The key string never appears in `message`. Fix (commit `66b00e2`):
match on `error.error.errorCode` instead — the backend derives `errorCode` from the message key
using `deriveErrorCode()` → `SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX`. This is stable and
locale-independent. Pattern: never rely on localized prose for programmatic FE matching; always
use the structured `errorCode` field.

**Test results:**
- ng test: 335/335 PASSED
- Playwright E2E (trip-details-edit.spec.ts): 9/9 PASSED (AC-9 through AC-14 + i18n)
- Playwright regression suite: 43/43 PASSED (0 new failures)

**AC coverage:**
- Route name + Date: read-only (no formControlName input rendered) - PASSED
- Departure time: editable p-calendar - PASSED
- Vehicle type: editable admin-dropdown - PASSED
- Vehicle: filtered by type; type change refilters - PASSED
- Seating capacity: inline client-side validator fires before save; backend errorCode match renders inline error - PASSED
- Seat plan: pointer-events overlay confirmed on preview container - PASSED
- Driver: preselects current driver (id from schedule detail); change PUT payload includes driverId - PASSED
- Optimistic update: no full-page reload on save - PASSED
- i18n: all 17 TRIP_DETAIL_EDIT_* keys present in en/th/zh - PASSED

**Critical risk verifications (code-traced, no live backend required):**
- R0 invariant: ScheduleTimeChangedEvent ONLY fires on departureTimeChanged (line 135 ScheduleService). Capacity/vehicle/driver changes do NOT trigger it.
- Capacity invariant: COALESCE(seating_capacity, total_seats) used in both walk-in browse + search queries; service trims availableSeatNumbers to effectiveCapacity.
- 400 body shape: {status:400, message:"<localized prose>", errorCode:"SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX", errors:null}. FE now reads errorCode, not message.



## 2026-06-25 — Scrutinize: owner role-hierarchy fix in hasAnyRole (#67)

**Self-fix (test stub drifted from production):** the production fix made
`AuthService.hasAnyRole` expand a held role to every role it outranks
(admin > owner > salesperson > driver > customer). But `navbar.component.spec.ts`
mocked `hasAnyRole` with a plain exact-match stub
(`required.some(r => roles.includes(r))`). After the fix that stub no longer
matched real runtime — a salesperson is now `isDriver === true`, yet the spec
asserted `isDriver === false`. The test stayed green only because it tested the
mock, not the behavior.

I rewrote the stub to mirror the real hierarchy expansion and corrected the one
assertion that genuinely changed (salesperson now flags `isDriver`). Pattern to
remember: **when you change a service method's semantics, audit every hand-rolled
stub of that method across the spec suite** — a stub that's simpler than the real
implementation will silently pass and hide the behavioral shift. Same exact-match
stub still lives in `staff-routing.spec.ts` (line ~82) and
`boarding-entry-page.component.spec.ts`; they don't assert the salesperson→driver
case so they're harmless today, but keep them in mind if those specs grow.


## 2026-06-25 — Scrutinize: global light/dark mode toggle (staff + public surfaces)

**Self-fix (CSS cross-surface bleed):** `src/styles/dark-theme.scss` scoped its dark rules
under `body.is-dark`. The new `ThemeService.applyBodyClass()` toggles `is-dark` on
`document.body` GLOBALLY (not just the `.admin-shell` div as before). Two generic selectors
therefore bled the public dark palette INTO the admin/staff shells, which already self-theme
via `admin-theme.scss` using `--admin-*` tokens:
  1. `body.is-dark label, input { color: ... !important }` (section 1) — collided with
     `.admin-shell label/input` at equal specificity; dark-theme.scss imports AFTER
     admin-theme.scss in styles.scss, so the public rule won by source order.
  2. `body.is-dark .form-control { background-color:#161922 !important; ... }` (section 4) —
     the staff portal uses bare `.form-control` inputs (walk-in-checkout, staff-schedules),
     so staff inputs got painted with the public dark-input palette instead of admin tokens.
  Fix: qualified those two rules with `:not(.admin-shell ...)` so they only apply outside the
  admin/staff shells. Verified `ng build` compiles and `ng test` (334) green.
  Pattern: when a global `body.is-dark` class drives dark mode, any UNQUALIFIED element or
  generic-utility selector (`label`, `input`, `.form-control`, `.title`, `.content-container`)
  under `body.is-dark` WILL leak into the self-theming `.admin-shell`. Either prefix
  public-page rules with a public-only ancestor, or exclude `.admin-shell` descendants. The
  `.admin-*`-prefixed and page-component-specific selectors (`.login-container`, `.payment-*`,
  `.stepper-*`, `.how-to-book-*`) are safe because they don't appear inside the shells.

**Returned to developer (test gap, not a blocker):** the staff/navbar toggle buttons have no
test asserting the click calls `themeService.toggle()`. Staff spec only checks the button
renders; navbar spec stubs `toggle: () => {}` as a plain fn (not a spy) and adds no
toggle/render test at all. The `ThemeService` itself is well covered (theme.service.spec.ts:
body class, persistence, toggle, init), so the wiring risk is low — but add a click→toggle
spy assertion for staff and navbar to lock the behaviour. See report for exact locations.

## 2026-06-25 — Scrutinize: online seat-picker Phase 1 (surface seat map + seat-race errors)

**Self-fix (duplicate alert):** removed the `extractApiErrorMessage` fallback block (and
its import) from `passenger-info.component.ts` `onSubmitPassengerInfo` catch. `createBooking`
does NOT set `SKIP_GLOBAL_ERROR_ALERT`, so the global `errorInterceptor` already calls
`alertService.error(extractApiErrorMessage(error) || 'Request failed.')` for every failed
`/api/` call and re-throws. The component's fallback then raised the SAME message a second
time → double toast. The seat-error branch keeps its own localized alert (it is a distinct
message) but is still double-toasted by the interceptor — see "Returned to developer".
Pattern: before adding `alertService.error(...)` in a component catch, check whether the
request opts out of the global interceptor via `SKIP_GLOBAL_ERROR_ALERT`. If it does not,
the interceptor already owns generic error messaging — only add a component alert for a
message the interceptor cannot produce, and suppress the global one for that request.

**Self-fix (cosmetic):** collapsed the dangling 3-line `<div class="seat-map-wrap mt-3">`
in `passenger-info-form.component.html` back to one line — the `*ngIf="...isSelectSeat..."`
was removed (Phase 1-A always renders the map) leaving an empty attribute artifact.

**Verified correct (traced end-to-end):**
- Phase 1-A: seat map renders unconditionally; `isSelectSeat:[true]` is now vestigial — the
  only reader was the removed template `*ngIf`. Grep confirms no code reads `.value`.
  Booker form still hard-codes `isSelectSeat:false`, harmless (it has no seat map).
- 401 early-return preserved; `error.error?.errorCode` read correctly for the two seat codes.
- Seat map (van) sources `availableSeatNumbers$` from `selectScheduleBooking`, NOT
  `selectScheduleList` — so the refresh genuinely must patch schedule-booking to update the
  map. The intent is real; the mechanism is the problem (below).

**Returned to developer (NOT self-fixed — >30 lines / lifecycle plumbing):**
- `refreshScheduleAvailability` waits for the fresh list with
  `firstValueFrom(store.pipe(select(selectScheduleList), skip(1), take(1)))`. This is
  fragile: (a) `skip(1)` assumes the very next emission is the HTTP result, but the
  schedule-list store is global and any other emission grabs the wrong value; (b) on a
  non-200/error the effect sets the store to `null` (or an unchanged value collapsed by
  NgRx `distinctUntilChanged`) → no 2nd emission → the `firstValueFrom` promise NEVER
  resolves and the subscription leaks. The component has NO `destroy$`/`ngOnDestroy`, and
  both call sites fire-and-forget the async method, so there is no teardown. Recommended:
  add `OnDestroy` + `destroy$`, react to the list via
  `pipe(filter(l => !!l), takeUntil(destroy$))` keyed on the known schedule IDs, or move the
  bridge into an effect. Pattern: never use `skip(1)` to "wait for my dispatch's result" on
  a shared store — there is no guarantee the next emission is yours, and the no-emission
  path leaks.
- Seat-race branch double-toasts (interceptor generic message + component localized one).
  Real fix needs `createBooking` to send `SKIP_GLOBAL_ERROR_ALERT` (edit in
  `booking.service.ts`, out of this review's scope).
- `buildScheduleFilterPayload` / `resolveStationCode` duplicate the payload+slug logic in
  `home-booking.component.ts` and `schedule-booking-filter.component.ts` (and `resolveStationCode`
  near-duplicates the component's own `getStationCodeById`). The two existing builders read
  their own forms, so none is directly reusable — extract a shared
  `buildScheduleFilterPayload(filter, stations)` util and have all three call it.

**Tests:** the C-error specs DO drive the real `onSubmitPassengerInfo` catch via a real
`throwError` (good), but they `spyOn(buildBookingPayload)` so the payload assembly is not
exercised, and the availability-refresh path (`refreshScheduleAvailability`, the `skip(1)`
wait, the schedule-booking patch) has ZERO coverage. NOTE: `ng test` could not be run green
in this working tree — an unrelated in-flight `login.component.spec.ts` constructs
`LoginComponent` with 7 args (constructor takes 6), failing the shared TS compile.

## 2026-06-25 — Scrutinize: login lang switcher mirrors home navbar switcher

**Self-fix (dead dependency):** removed `private elementRef: ElementRef` from the
`LoginComponent` constructor (and the now-unused `ElementRef` import). When you port the
navbar's outside-click handler that matches by CSS class
(`targetElement.closest('.navbar-lang-dropdown')`), `elementRef` is no longer read by
anything — the old Bootstrap handler used `this.elementRef.nativeElement.contains(...)`,
but the class-based handler does not. The navbar KEEPS `elementRef` only because its
`handleMobileMenuOutsideClick` still uses `nativeElement.contains`; login has no mobile
panel, so it has no such use. No spec churn: there is no `login.component.spec.ts`, so
nothing constructs the component with positional args. Pattern: after copying a method
from another component, re-grep the destination for each injected dependency it used to
need — a class-based DOM match drops the `ElementRef` requirement.

**Verified correct (traced end-to-end):**
- Outside-click + listener lifecycle: `toggleLangDropdown` registers a document click
  listener only while open; `closeLangDropdown` unlistens and nulls the handle;
  `ngOnDestroy` unlistens. Selecting an item runs the item's `(click)` first
  (closeLangDropdown unregisters the doc listener) so the same click does NOT re-fire the
  document handler. No leak, no double-handling.
- Material Symbols glyphs render via the GLOBAL `.material-symbols-outlined` rule in
  styles.scss — login does not need the navbar's component-scoped `%mat-icon` placeholder
  (which is itself redundant with the global rule). Parity confirmed.
- No leftover references to removed classes (`btn-lang`, `menu-lang`, `arrow-icon`,
  `dropdown-toggle`, flag svgs) in login html/scss/ts.

**Returned to developer (not self-fixed — needs a new file):**
- No `login.component.spec.ts` exists. The new switcher behavior (toggle open/close,
  select language calls languageService.switch + closes, outside-click closes,
  currentEndonym fallback) has zero regression coverage. This loop has no QA stage — add a
  spec. See report for the minimal cases.


## 2026-06-25 — Scrutinize: remove walk-in trip-headline + dead supporting code (issue #55)

**Self-fix (dead code):** removed the orphaned `formatDate(dateTime)` ("D MMM YYYY")
method from `walk-in-center-panel.component.ts`. It was NOT introduced by this diff —
it was pre-existing dead code, never referenced from the template or anywhere in the
component. Each other component (e-ticket, payment-info, review-schedule-booking,
passenger-info-summary) has its OWN `formatDate`, so a global grep looks busy; always
scope the grep to the component dir AND check the template before assuming a `formatXxx`
helper is live. While cleaning up sibling dead methods (`formatTime`), sweep the whole
helper block for other unused ones in the same class — don't stop at the symbols named
in the ticket.
Pattern: `dayjs` import stays — `formatDateTime` (Trip Details tab) still uses it, so
removing `formatTime`/`formatDate` does not orphan the import.

**Verified correct (traced end-to-end):**
- `selectedRouteSlug` correctly KEPT: it feeds `loadSegments(routeSlug, trip)` and the
  stale-response guards (`selectedRouteSlug !== routeSlug`) in both the success and error
  callbacks of the segment fetch. Removing it would break segment loading. Good call.
- `selectedRouteLabel` removal is complete: gone from the field, both assignments
  (`onDateChanged` reset + `onTripSelected`), the `[routeLabel]` binding, and all specs.
  No residual references anywhere. `WalkInRouteGroupDto.routeLabel` (DTO field) and the
  trip-browser's own `formatTime`/`routeLabel` usages are separate and correctly untouched.
- Padding change `py-2` → `pt-0 pb-2` does NOT reopen the #41/#55 viewport-fit e2e: the
  SCSS binds `.container-fluid` to `height: calc(100vh - 156px)` with `flex-direction:
  column` + `.pos-layout { min-height: 0 }`. The container's own padding is absorbed by
  the flex column (the SCSS comment states this explicitly); only the fixed 156px chrome
  constant — unchanged here — drives the fit. Safe.

## 2026-06-25 — Scrutinize: per-seat passenger type + pickup/drop-off state lift (issue #53)

**Self-fix (test):** `sell-page.component.spec.ts` → "stamps each passenger with the
passenger type staff selected" was a **vacuous test** (Karma warned "has no expectations").
It pre-set `selectedSeats = ['B1','B2']` and THEN called `onSeatToggled('B1')`/`('B2')`.
Because B1/B2 were already in the array, `onSeatToggled` took the *removal* branch and
emptied `selectedSeats`, so `onSell` built an empty `passengers` array and the
`for…expect` loop body never ran — the assertion executed zero times.
Fix: drop the manual `selectedSeats` pre-seed, add the seats via the real `onSeatToggled`
flow (so `seatPassengerTypes` is actually populated), and assert `passengers.length === 2`
before the per-passenger loop.
Pattern: `onSeatToggled` is a *toggle*. In tests, never pre-populate `selectedSeats` and
then call the toggle for the same seats — drive seats exclusively through the toggle, and
always assert array length before a `for…of … expect` so the loop can't pass vacuously.

**Verified correct (traced end-to-end):**
- Seat components' `seatGenders = null` default path is behaviorally identical to before:
  `seatGenderFor(l)` null-branch = `isSelected===l ? gender : ''`; `!isSeatActive(l)` null-branch
  = `isSelected!==l`. Customer passenger-info flow unaffected (it never sets `seatGenders`).
- Per-seat bug fix holds: `onSeatToggled` snapshots `selectedPassengerType` into
  `seatPassengerTypes[seat]` at click time; `onPassengerTypeChanged` only mutates the active
  type, never the map. `onSell` reads `seatPassengerTypes[seat] ?? selectedPassengerType`.
  Removal deletes the map entry; resets fire on date change, trip change, and post-sale.
- State lift complete: no orphaned segment state left in `walk-in-checkout`; `canSell` now
  gates on `pricePerSeat > 0`, totals on `pricePerSeat`. Stale-response guards
  (`selectedRouteSlug !== routeSlug`) preserved in the lifted `loadSegments`. Drop-off kept
  valid on pickup change via `onPickupChange`.

**Minor (left for dev, non-blocking):**
- `walk-in-center-panel.stopRowLabel()` is dead code — defined + unit-tested but never used in
  the template (HTML renders `{{opt.name}}`/`{{opt.time}}` inline). Remove method + its 2 tests.
- Orphaned i18n keys `STAFF.SELL.PICKUP_POINT/DROPOFF_POINT/STOP_PLACEHOLDER` no longer
  referenced after the checkout `<select>`s were removed; safe to delete from en/th/zh.
- `_buildStopTimes`: a leg with missing/zero `estimatedDurationMinutes` sets that stop's time
  to '' WITHOUT advancing `cumulativeMinutes`, so any downstream stop with a valid leg shows an
  under-counted (too-early) time rather than ''. No crash; low-severity display inaccuracy on
  incomplete duration data only.

## 2026-06-25 — Scrutinize: walk-in seat count/total fix + calendar restyle

**Self-fix (3-line comment):** Updated the stale leading comment in
`walk-in-trip-browser.component.html`. It still read "No calendar icon... the trailing
button was redundant" while the same change re-added an in-input `calendar.svg` icon —
the comment now contradicted the code. Replaced it with an accurate description (in-input
icon via `iconDisplay='input'`, `panelStyleClass="booking-calendar-panel"`, no `appendTo`).
Pattern: when you reverse a decision, rewrite the comment that justified the old one — a
contradicting comment is worse than none.

**Verified correct (traced end-to-end):**
- `seatClicked` is emitted unconditionally after the gender/taken-by-other guards, before the
  `isSelected` toggle. The walk-in count fix therefore does NOT depend on the seat component's
  internal single-select `isSelected` state (which goes stale in multi-select, but is only used
  for the single-highlight visual — a pre-existing UX limitation, not a count bug). Multi-seat
  deselect (select A1, A2, deselect A1 → [A2]) works because the parent `selectedSeats` array is
  the source of truth and `onSeatToggled` toggles by value.
- Walk-in flow binds ONLY `seatClicked`; `passengerSeatPositionOnChange` is no longer bound there
  → no double-fire. The passenger-info single-select flow still binds
  `passengerSeatPositionOnChange` and relies on its `''`-on-deselect to clear the form control
  (`setPassengerSeat`), so preserving that emit is correct.
- Removing `appendTo="body"` is REQUIRED, not incidental: `:host ::ng-deep .booking-calendar-panel`
  cannot reach a panel appended to `<body>`. Matches the proven home-booking / schedule-booking
  pattern. Van unavailable-seat clicks are still blocked by the seat-box `isDisabled` guard.

**Test note (left as-is):** `sell-page` "select then deselect leaves length 0" passes on the OLD
code too (it never passes `''`), so it's non-discriminating. The real regression test is
"empty string seat is a no-op" — that one fails without the `if (!seat) return;` guard. Adequate.

## 2026-06-25 — Scrutinize: issue #50 walk-in passenger-type tiles + center header

**Self-fix (1 line):** Added `[attr.aria-pressed]="passengerGender === pt.value"` to the
passenger-type tiles in `walk-in-center-panel.component.html`. The tiles use `role="button"`
and a `--active` CSS class to show selection, but that active state was visual-only. For a
toggle-button tile group, screen readers need `aria-pressed` to announce which option is
selected. Pattern: whenever a `role="button"` element represents a toggled/selected state,
pair the visual `[class.x--active]` with `[attr.aria-pressed]` bound to the same condition.

**Not fixed (left as-is, acceptable for a small UI change):**
- `(keydown.space)` does not call `preventDefault()`, so Space may also scroll the page while
  the tile is focused. Minor; revisit if QA flags it.
- `routeEndpoints` splits `routeLabel` on `→ — – -`. Robust for the standard
  "City → City" backend labels. Only failure mode is a 2-endpoint label where a single city
  name contains a spaced hyphen — unlikely given current backend data. Fallback header renders
  correctly when the label has no separator or is null.

## 2026-06-24 — QA pass: feature/walkin-ticket-sales Walk-in POS single-screen

**Branch merged:** `feature/walkin-ticket-sales` → `dev`

**Test results:**
- Playwright E2E: 27/27 PASSED (new spec replaced old 5-step wizard spec)
  - AC-1 through AC-12 covered; WI-A, WI-G watch items covered
  - One self-fix: AC-10 tab count used `li[role="tab"]` (0 hits) — PrimeNG uses `a[role="tab"]` anchors inside `li[role="presentation"]`; fixed to `a[role="tab"]`
- Backend unit tests: 633/633 PASSED (4 skipped)
  - Walk-in specific: ScheduleWalkInServiceTest (11), ScheduleWalkInControllerTest (6), ScheduleWalkInSecurityTest (4) all green

**Key observations:**
- Old `staff-sell-walkin.spec.ts` tested the 5-step wizard (fromStop, toStop, bookingType selectors, passengers array with gender). Completely replaced for the new 3-column POS.
- PrimeNG `p-tabview` nav renders `li[role="presentation"]` for tab items (not `li[role="tab"]`); the `a` inside has `role="tab"`.
- WI-A (totalAmount>0) confirmed by E2E: payload captured shows `totalAmount: 350` for 1-seat × 350 THB trip.
- WI-G (null pricePerSeat) confirmed: Sell button stays disabled when `canSell` gates on `totalAmount > 0`.
- API functional tests: SIT backend predates this feature (returns 400/TYPE_MISMATCH for `walk-in` path matching `{id}` route). Contract verified via MockMvc-based controller tests instead.
- i18n: all 3 locales (en/th/zh) have identical STAFF.SELL key sets — AC-11 passed.

## 2026-06-24 — Walk-in POS booking payload omitted `totalAmount` (self-fixed)

**File:** `src/app/modules/staff/pages/sell/sell-page.component.ts` (`onSell`).

The new single-screen POS built the `POST /api/private/bookings` payload without a
`totalAmount` field. The locked contract's `BookingReqDto` declares `totalAmount(>0)`
(NotNull/Positive on the backend), and the canonical online flow
(`passenger-info.component.ts`) always sends it (`price * passengers`). The walk-in payload
would have been rejected (400) or booked at zero. The checkout child already computes the
same value for its `canSell` gate but never forwarded it.

**Fix:** recompute `totalAmount = (parseFloat(trip.pricePerSeat || '0') || 0) * seatCount`
in `onSell` and add it to the booking payload (typed field + value). Added a spec asserting
`callArg.totalAmount === 600` for a 2-seat / 300-baht trip, plus two checkout specs proving
`canSell` stays false when `pricePerSeat` is `null` or `'0'` (the contract's null-price gate).
**Rule:** when you assemble a request payload by hand, diff it field-by-field against the
locked DTO contract AND the existing reference implementation of the same endpoint — don't
trust that the gate getter covering a value means the value reaches the wire.

## 2026-06-24 — Dark-mode accent text fails WCAG (self-fixed, #39)

**File:** `src/styles/admin-theme.scss`.

The unify-shell change added `.admin-shell.is-dark` flipping `--admin-surface*` and
`--admin-text/muted/outline`, but it did NOT flip the `--accent*` tokens. `--accent-text`
(light-mode values `#b3420a` orange / `#0f766e` teal / `#075c7a`) is deliberately dark so it
reads on white — but those same values are used in dark mode for card/modal headings, table
`code`, chips and status badges. On the dark surfaces (`#1d2226` / `#14181b`) that is only
~2.8:1, below the WCAG AA 4.5:1 floor for normal text. Light mode was fine (~5.5:1); the
defect appears only on the dark path, which is the admin-only shipped path (orange → 2.83:1).

**Fix:** added dark-mode `--accent-text` overrides scoped to `.is-dark` (generic `#fdba74`,
plus `.theme-admin.is-dark` → `#fb923c` ≈7:1 and `.theme-staff.is-dark` → `#5eead4` ≈10:1).
`--accent-soft` (a translucent tint) was left unchanged — the lighter text still passes AA
over it (~6:1). **Rule:** when you introduce a dark-mode surface flip, every token that
encodes a foreground colour tuned for the light surface (here the accent *text*, not just the
neutral text) must get a dark-mode value too. Don't stop at `--admin-text`; audit accents.


## 2026-06-23 — Navbar admin-reskin: group aria-label + dead field (self-fixed, #24)

**Files:** `navbar.component.html`, `navbar.component.ts`, `public/i18n/{en,th,zh}.json`.

Two issues in the TH|EN toggle + avatar dropdown reskin:
1. **a11y:** the `<div role="group">` wrapping the TH/EN buttons had
   `aria-label="HOME.NAVBAR.LANGUAGE_TH"` → screen readers announced the whole group as
   "Switch to Thai", which is the label for ONE button. A radiogroup/group label must describe the
   group, not a child. Added a neutral `HOME.NAVBAR.LANGUAGE_SWITCH` ("Language"/"ภาษา"/"语言") key in
   all three locales and pointed the group at it. Rule: a `role="group"` aria-label names the set, not
   a member — reuse a member's label only by accident.
2. **Dead code:** `userName` field + its `ngOnInit` assignment survived the refactor even though the
   template switched from `{{ userName }}` to `{{ userInitials }}`. Removed both. When you replace a
   bound field with a getter, grep the field name across the component's html+ts+spec and delete the
   orphan.

Note on the retained outside-click machinery: `toggleProfileDropdown` /
`handleProfileDropdownOutsideClick` (renderer `document` listen) is the old pattern; the admin
reference (`admin-layout.component.ts`) does this far more cleanly with
`@HostListener('document:click')` (close-only, `!profile.contains(target)`) plus
`@HostListener('document:keydown.escape')`. Functionally the navbar version works, but it lacks the
Escape-to-close affordance the admin topbar has — flagged to developer, not self-fixed (parity, not a
bug).

The `@ViewChild('profileDropdown', static:false)` change is CORRECT: the ref lives behind
`*ngIf="isLogin"`, so `static:true` would resolve it to `undefined`. It's only dereferenced from the
document-click handler, which can only be registered after the avatar (also behind the `*ngIf`) is
clicked — so no NPE.

## 2026-06-23 — Bookings departureTime: don't paper over a missing DTO field with `as` (self-fixed, #23)
The hotfix read departure time via `(schedule as { departureDateTime?: string })?.departureDateTime`.
The cast existed only because `AdminBookingScheduleDto` lacked the field that backend #17 now serves.
Two problems it hid:
1. Selection was `bookingSchedules?.[0] ?? journeys?.[0]` — it picks the FIRST non-null *object*, then
   reads `.departureDateTime`. If `bookingSchedules[0]` exists but has no timestamp (current SIT state),
   you get `undefined` and never fall through to `journeys[0].departureDateTime`. The `??` was at the
   wrong level (object, not field).
Fix pattern: add the real field to the DTO (`departureDateTime?`/`arrivalDateTime?` on
AdminBookingScheduleDto) and coalesce at the FIELD level:
`booking.bookingSchedules?.[0]?.departureDateTime ?? booking.journeys?.[0]?.departureDateTime ?? null`.
Rule: when a backend contract adds a field, update the typed DTO — never reach for `as { x?: T }`. The
cast disables exactly the null-safety analysis you need here.

## 2026-06-20 — Language not persisted on 5 more customer pages (self-fixed, #22)

**Files:** `switchLanguage()` in `login.component.ts`, `login-mobile.component.ts`,
`register.component.ts`, `forget-password.component.ts`, `otp-validate.component.ts`.

**Problem:** The #22 fix added `localStorage.setItem('app_language', lang)` to the
navbar's `switchLanguage()`, but five other customer-facing (unauthenticated) pages
had the identical pre-fix body — `translate.use(lang)` with no persistence. The
`authInterceptor` builds `Accept-Language` from `localStorage['app_language'] || 'th'`,
so switching language on login/register/OTP/forgot-password did NOT change the header.
These are exactly the pages that POST to the backend (login, register, send-OTP,
reset-password) and surface backend error modals — so the #22 symptom ("error stays
Thai after switching to English") reproduced there even after the navbar fix.

**Fix (pattern to learn):** When you fix a shared symptom rooted in a duplicated
method, grep the whole app for the method (`switchLanguage`) and fix every copy, not
just the one on the reported page. Root cause = N copies of the same omission. Each of
these components already *reads* `localStorage.getItem('app_language')` in ngOnInit to
seed `currentLanguage`, so the write side was simply missing — persisting also makes
the choice sticky across these pages, consistent with admin/staff layouts.

**Takeaway:** The real fix for a "duplicated logic" bug is to consider extracting a
shared `LanguageService.switch(lang)` so persistence can never drift again. Left as a
follow-up (>30 lines, new file) — see "Notes for the developer" below.

## 2026-06-20 — Sell page BUS seat map showed booked seats as free (self-fixed)

**File:** `src/app/modules/staff/pages/sell/sell-page.component.ts` — `getTakenSeats()`

**Problem:** `getTakenSeats()` was a stub that always returned `[]`. The BUS seat
component (`app-passenger-seat-bus`) has no `availableSeatNumbers` input — it only
disables seats listed in `[takenSeats]`. Because we passed an empty array, every BUS
seat (B1..B21) rendered as selectable, so a salesperson could pick a seat that was
already booked. (The VAN path was fine: it receives `[availableSeatNumbers]` and the
van component computes availability itself.)

**Fix (pattern to learn):** When reusing a presentational component, feed it the input
it actually consumes. The BUS component needs the *taken* set, so derive it as the
complement of `availableSeatNumbers` over the BUS's fixed seat universe (B1..B21, see
`passenger-seat-bus.component.html`). Match on the numeric part of each label because
`availableSeatNumbers` arrive as plain digit strings — this mirrors the VAN's
`normalizeSeatNumber()` convention. Empty `availableSeatNumbers` -> return `[]`
(don't mark everything taken).

**Takeaway:** Don't ship `// TODO`-style stubs that silently disable a safety check.
A seat picker that can't mark booked seats is worse than no picker — it invites
double-booking. Always wire the real data when the source (`availableSeatNumbers`) is
already on the DTO.

**Follow-ups for QA (not fixed here):**
- `sell-page.component.ts` has no component spec. The 5-step flow, seat-count guards,
  idempotency-key lifecycle, and walk-in payload are untested. Add coverage.
- `loadSeatMap()` fetches `getSeatMap()` then discards the result; seat availability
  comes only from the search DTO's `availableSeatNumbers`. If the search list goes
  stale, the map can drift. Consider using the seat-map response or removing the
  unused call.
- StaffModule statically imports the full PassengerInfoModule (booking/province/
  schedule effects + dropdowns) just to reuse two seat components. Safe (NgRx
  `forFeature` dedupes), but it bloats the staff lazy bundle. Consider extracting the
  seat components into a small shared module.

---

## 2026-06-20 — QA run: feature/staff-pages-salesperson-driver (FAILED)

**Verdict:** QA_FAILED — two spec deviations; unit tests all green.

**Unit tests:** `ng test --watch=false --browsers=ChromeHeadless` — 145/145 SUCCESS.
Covers StaffApiService (5 specs), BoardingListStore (4 specs), DriverSchedulesStore (3 specs),
StaffSchedulesStore (3 specs), plus all pre-existing tests (no regressions).

**Failing acceptance criteria (code-trace against spec):**

### FAIL 1: Boarding nav item absent from staff sidebar
**File:** `src/app/modules/staff/staff-layout.component.ts` — `get navItems()` lines 28–43.
**Spec requirement:** "nav built from authService roles: salesperson → [Sell, Schedules, Boarding];
driver → [My schedules, Boarding]. Dedupe Boarding by path if user has both roles."
**Actual:** salesperson gets [Sell, Schedules]; driver gets [My Schedules]. Boarding is entirely
absent from the sidebar nav. Boarding is only reachable by clicking "Boarding list" in the table
row actions on StaffSchedulesPage / DriverSchedulesPage, but there is no standalone sidebar link.
**Fix needed:** In `navItems` getter, add `{ path: 'boarding', labelKey: 'STAFF.NAV.BOARDING',
icon: 'list_alt' }` for both salesperson and driver branches. Apply dedup: if both roles are
present, push the boarding item once (check `items.some(i => i.path === 'boarding')` before push,
or add it once outside both `if` blocks when either role is present).

### FAIL 2: Main app navbar has no staff entry
**File:** `src/app/shared/components/navbar/navbar.component.ts` — line 34, 59.
**Spec requirement:** "Also surface a staff entry in the main app navbar where it shows admin entry
(navbar currently only knows isAdmin) — add isSalesperson/isDriver flags via authService.hasAnyRole."
**Actual:** `NavbarComponent` has only `isAdmin: boolean = false` (set at line 59 in the
`authStatus$` subscription). No `isSalesperson` or `isDriver`. The HTML (`navbar.component.html`
line 109) shows `*ngIf="isAdmin"` for the admin link but no staff equivalent exists.
**Fix needed:** Add `isSalesperson = false; isDriver = false;` properties; set them in the
`authStatus$` subscription alongside `isAdmin`; add a `<li *ngIf="isSalesperson || isDriver">`
routerLink="/staff" nav entry in `navbar.component.html` near the admin link.

---

## 2026-06-20 — QA re-check: commit e3b8cf7 — navigation fixes (PASSED)

**Verdict:** QA_PASSED — both prior FAIL items resolved; unit tests all green.

**Unit tests:** `ng test --watch=false --browsers=ChromeHeadless` — 154/154 SUCCESS (no regressions; 9 new tests added by the developer).

### PASS 1: Staff sidebar Boarding entry (previously FAIL 1)
**File:** `src/app/modules/staff/staff-layout.component.ts` — `get navItems()` lines 28–47.
Boarding item `{ path: 'boarding', labelKey: 'STAFF.NAV.BOARDING', icon: 'how_to_reg' }` is
pushed once outside both `if` blocks when `isSalesperson || isDriver` is true (line 42–44).
Dedup is handled by the branching: only one push regardless of roles.
Route `/staff/boarding` (param-less) exists at line 41–45 of `staff.module.ts`, ordered
before `/staff/boarding/:scheduleId` (line 46–51), both guarded with `canActivate:[AuthGuard]`
and `data.requiredRoles: ['driver','salesperson']` (lowercase). The param-less route is backed
by `BoardingEntryPageComponent`, which uses `driverSchedulesStore` for drivers
(assignedToMe=true) and `staffSchedulesStore` for salespersons (all schedules). Links to
`/staff/boarding/:id` via `router.navigate(['/staff/boarding', row.id])` on row click. Empty
state rendered when `isEmpty` is true (`!isLoading && rows.length === 0`).

### PASS 2: Main navbar staff entry (previously FAIL 2)
**File:** `src/app/shared/components/navbar/navbar.component.ts` lines 35–36 and 62–63.
`isSalesperson` and `isDriver` are declared as class properties and set in the `authStatus$`
subscription alongside `isAdmin`. `navbar.component.html` line 114 shows
`<li *ngIf="isSalesperson || isDriver">` with `[routerLink]="'/staff'"` — exactly what the
spec required.

**R0 guardrail:** Confirmed clean. Git diff of frontend feature branch shows only staff module
files + routing + i18n changed. No payment, booking, idempotency, or boarding-list core code
was modified.

**What passed (code-trace):**
- Walk-in stepper (5 steps): search → seats → passengers → booking payload (bookingChannel:'walk_in')
  → idempotency key stable on retry (generate in goToStep('payment'), kept across pay() retries)
  → e-ticket dispatch + navigate.
- Cash-only payment: static "Cash" badge, no method selector, payWalkIn sends `paymentMethod:'cash'`.
- BUS seat takenSeats computed as complement of availableSeatNumbers (scrutinize fix applied).
- VAN seat: availableSeatNumbers bound directly.
- Invalid form: markAllAsTouched + alertService.warning (FORM_INVALID, SEAT_COUNT_MISMATCH).
- Schedules CRUD: optimistic modal open + GET patch (pristine-only), mutate+refresh on delete.
- No fetch-in-ngOnInit: all three stores call store.refresh() from ngOnInit (not fetch directly).
- Driver page: assignedToMe=true via getMySchedules(), empty→empty-state (not error).
- Boarding check-in: optimistic mutate → POST → revert on error + alertService.error; store.refresh on success.
- BoardingListStore.setScheduleId() calls clear() when id changes (root-scoped store reset).
- Routes: each child has canActivate:[AuthGuard] + data.requiredRoles lowercase. Parent /staff route
  has requiredRoles:['driver','salesperson']. AuthGuard checks hasAnyRole.
- i18n STAFF keys: present in en.json, th.json, zh.json (changed files include all three).

## 2026-06-24 — Bare /staff redirect: regression test didn't lock the bug (self-fixed, #30)

**Files:** `staff-routing.spec.ts` (rewritten), `staff.module.ts`, `passenger-info.module.ts`
(exported the previously module-local `routes` consts as `staffRoutes` / `passengerInfoRoutes`).

The fix itself (extracting `PassengerSeatModule` so `StaffModule` no longer imports
`PassengerInfoModule`) was correct and resolves the root cause. The problem was the **regression
test**: it hand-rolled a *stub* `staffRoutes` table that simply omitted the leaking passenger-info
empty-path route, and never imported the real `StaffModule` / `PassengerInfoModule`. A stub that
mirrors the desired routes proves nothing — it passes identically with the bug present, because the
bug lived in NgModule import *composition* (Angular flattening a child module's
`RouterModule.forChild` routes into the lazy context), not in any literal route array the stub copied.
The trivial `StaffLayoutComponent !== PassengerInfoComponent` "structural guard" was always true and
unrelated to the bug.

**What I changed:** the spec now asserts against the **real exported route arrays** and the **real
compiled module import graph** (walking `StaffModule.ɵinj.imports`). The decisive assertion —
`StaffModule must not import PassengerInfoModule` — was verified to FAIL when the fix is reverted
(re-adding the `PassengerInfoModule` import) and PASS with the fix in place. That is what "locks the
regression" means.

**Rule:** a regression test must consume the *real* artifact the bug lives in, not a parallel
hand-authored copy of the intended state. Before trusting a regression test, revert the fix and
confirm the test goes red. If it stays green against the buggy code, it tests nothing. When the bug
is in module wiring, assert on the module's actual metadata/route exports — export the `const` if you
must — rather than re-declaring stub routes.

---

## navbar mobile hamburger — a single `@ViewChild` cannot identify a template rendered twice

**Bug (caught in scrutinize, self-fixed):** The language switcher was extracted into one
`<ng-template #langSwitcher>` and rendered via `*ngTemplateOutlet` into BOTH the desktop bar and the
mobile panel. The trigger button carried a `#langDropdown` template-ref read by
`@ViewChild('langDropdown')`, and `handleLangDropdownOutsideClick` used
`this.langDropdown.nativeElement.contains(target)` as its "clicked the trigger?" guard.

When both outlets are in the DOM (mobile panel open — note the desktop copy is only `display:none`,
still present), a single-element `@ViewChild` resolves to the **first** match = the hidden desktop
trigger. The same click that opened the menu from the **mobile** trigger then failed
`desktopTrigger.contains(mobileTrigger)` → the guard's else-branch slammed the menu shut. Net effect:
the language dropdown was impossible to open on mobile. The header comment claiming "@ViewChild
resolves the LAST instance, so it's safe" was wrong on two counts (it's the first, and one ref can
never represent two elements).

**Why the new tests missed it:** they set `isLangDropdownOpen = true` by hand instead of calling
`toggleLangDropdown()`, so the same-click guard was never exercised. A test that drives the real
toggle path with the mobile trigger as the event target fails on the old code.

**Fix:** drop the `@ViewChild`/template-ref entirely; match the trigger by class with
`(event.target as HTMLElement).closest('.navbar-lang-dropdown')`. Class matching is correct for N
instances of the same template.

**Rule:** when a template (or `ng-template`/`*ngTemplateOutlet`) is instantiated more than once in a
component, do NOT identify its elements with a single `@ViewChild`/template-ref — it silently binds to
one instance. Use a class/`closest()` check, `@ViewChildren` (QueryList), or event delegation. And a
dropdown's "outside click" regression test must call the real `toggle*()` and feed the guard the
actual clicked element, not pre-set the open flag.


## 2026-06-25 — QA re-check: feature/trip-details-edit defect fix (PASSED)

**Verdict:** QA_PASSED — defect resolved; all tests green; merges complete.

**Fix verified (commit 66b00e2):** walk-in-center-panel.component.ts lines 331-332 now read
(err as HttpErrorResponse)?.error?.errorCode and compare with === 'SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX'
/ 'SCHEDULE_ERROR_CAPACITY_BELOW_OCCUPIED'. Inline capacityInlineError now fires correctly for
server-side 400 capacity responses. ng test: 335 passing.

**E2E results (post-fix):**
- New spec (trip-details-edit.spec.ts): 9/9 PASSED
  - AC-11 server-side path (test 4): PUT mock returns errorCode=SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX;
    edit form remains visible without crash (test passes; behavior logs inline error rendered correctly)
- Regression (staff-sell-walkin + admin-critical-paths + b2c-critical-path): 34/34 PASSED

**Backend unit tests:** 651/651 PASSED (confirmed from prior run; no BE changes in fix commit)

**Merge status:**
- Frontend: merged feature/trip-details-edit → dev (merge SHA 0ddc7bc in OBRS-frontend)
- Backend: merged feature/trip-details-edit → dev (merge SHA cef8a8a in OBRS-backend)
- Neither repo pushed (per QA protocol)


## 2026-06-26 — Scrutinize: sit/title-prefix-chinese (issue #69) — SELF_FIXED

**Self-fix (register.component.ts):** The zh title-prefix fix wired `localizedDropdownName`
into the three forms that consume the shared `TITLE_OPTIONS` constant (walk-in-checkout,
passenger-info-form, booker-info-form), but `register.component.ts` carried its OWN inline
copy of the title array WITHOUT `nameChinese`. Since the register title dropdown renders via
`app-dropdown-obrs` → `getValue` → `localizedDropdownName`, zh fell back to nameEnglish there —
the same bug #69, just on a fourth dropdown the fix missed.

Replaced the 48-line duplicate array with `titleOptions: Dropdown[] = [...TITLE_OPTIONS];`
(+ import of TITLE_OPTIONS). The inline array was byte-identical to TITLE_OPTIONS, and
`resolveTitleName` only reads id/nameThai/nameEnglish (all still present), so this is a safe
drop-in that closes the zh gap on registration and removes the duplication.

**Pattern for next time:** when localizing a shared option list, grep for *all* render sites
of that list — duplicated/hardcoded copies of a shared constant won't inherit the new field.
Prefer `[...SHARED_CONSTANT]` over re-declaring the array per component.

---

## Scrutinize self-fix: global error alert double-toast on new auth HTTP calls (ao/google-signin-email-verify)

`loginWithGoogle()` / `verifyEmail()` / `resendVerification()` in `auth.service.ts` were posting
WITHOUT the `SKIP_GLOBAL_ERROR_ALERT` HttpContext token. Because the global `errorInterceptor`
(registered in `app.module.ts` via `withInterceptors([authInterceptor, errorInterceptor])`) fires
`alertService.error(extractApiErrorMessage(...))` on every `/api/` error, and these components then
ALSO show their own errorCode-mapped alert (or, for verify-email, an inline "failed" panel), the user
saw TWO error surfaces — a generic interceptor toast plus the specific one. For verify-email this even
fired a toast on `VERIFICATION_TOKEN_ALREADY_USED`, which the component intentionally treats as success.

Fix: added `{ context: new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true) }` to all three posts —
the same opt-out convention already used by booking/admin/staff/route-map/usability-report services
that do their own inline error handling.

**Pattern for next time:** any service method whose call-sites branch on `error.error.errorCode` and
render their own alert/inline error MUST opt out of the global error alert with `SKIP_GLOBAL_ERROR_ALERT`,
otherwise you get a double-toast. The existing `callLogin` avoids this only because it swallows the error
(returns `err`) and the component never re-alerts — that is NOT the pattern to copy for errorCode-branching flows.

---

## Scrutinize self-fix — admin-unlock-account (ao/admin-unlock-account, base commit 0a83175)

**What I changed:** `user-management-page.component.ts` `confirmUnlock()` error branch.
The original read `errorCode` via typed cast and fed it into
`this.translate.instant(errorCode ? 'ADMIN.MESSAGES.UNLOCK_FAILED' : 'ADMIN.MESSAGES.UNLOCK_FAILED')`
— a vacuous ternary whose two branches are identical, plus a now-unused `errorCode` read.
Collapsed to a single controlled key:
`this.alertService.error(this.translate.instant('ADMIN.MESSAGES.UNLOCK_FAILED'))`.

**Why it matters:** a ternary with identical branches is dead/misleading code — it implies
two outcomes when there is one. AC7's intent (a controlled i18n key, NOT
`extractApiErrorMessage`) is still fully satisfied. AC7 said "branch on error.error.errorCode",
but the spec defines a single failure key, so there is genuinely nothing to branch on — the
typed access served no purpose.

**Pattern for next time:** don't scaffold a `cond ? A : B` when A === B "for future error codes".
Wire the branch only when a second key actually exists; otherwise it reads as an unfinished TODO.
If distinct backend errorCodes (e.g. USER_NOT_LOCKED) later need distinct messages, reintroduce
the typed read + a real branch at that point. tsc --noEmit stays clean (0) after the change.

**QA follow-up (this session):** the Thai-locale i18n E2E test (`AC7-i18n-th`) initially
clicked `page.locator('button[aria-label]').first()` on the whole page, which matched the
sidebar's menu-toggle button (also aria-labelled, rendered before the table) instead of the
row's Unlock button — the confirm dialog never opened, and the test timed out. Scoped the
click to the locked row instead. Also confirmed the shared `node_modules` environment
(broken by an earlier QA run's stray `npm install` outside its worktree) was repaired via
`npm ci`; all 607 unit tests and all 7 Playwright E2E specs in `admin-unlock-account.spec.ts`
pass clean.

---

## OBRS-110 change-seat — Scrutinize self-fix: i18n key placed OUTSIDE its ERROR block

**What I changed:** In all three locale files (`public/i18n/{en,th,zh}.json`), the
`CHANGE_SEAT.NO_SEATS` string was defined at the *top level* of `MY_BOOKINGS.CHANGE_SEAT`,
but `change-seat-error.ts` maps `CHANGE_SEAT_ERROR_NO_SEATS → MY_BOOKINGS.CHANGE_SEAT.ERROR.NO_SEATS`.
So `translate.instant('...ERROR.NO_SEATS')` resolved to `undefined` and the confirm banner
would render the raw key `MY_BOOKINGS.CHANGE_SEAT.ERROR.NO_SEATS` to the user. I moved the
already-translated string into the `ERROR` block (next to `SEAT_UNAVAILABLE`) in all three files.

**Why it matters:** NO_SEATS is a RETURN_TO_MAP confirm error — the exact OBRS-83 lesson path.
A raw i18n key on that banner is precisely the "looks broken to the user" failure the ticket
called out. Unit tests did NOT catch it because `TranslateModule.forRoot()` with no loaded
translations returns the key for BOTH a correct-but-untranslated key and a missing key — so
`expect(...).toBe('MY_BOOKINGS.CHANGE_SEAT.ERROR.NO_SEATS')` passes either way.

**Pattern for next time:** when adding an error-code→i18n map, verify each target key path
against the actual JSON nesting, not just that *some* key with that leaf name exists. A quick
`node -e "require('./en.json').MY_BOOKINGS.CHANGE_SEAT.ERROR.NO_SEATS"` per locale catches
misplacement that key-presence greps and unit tests both miss.

---

## OBRS-96 QA (local-BE + local-FE against live SIT Supabase, 2026-07-10)

**Setup that worked:** ran the backend worktree locally with `-Dspring-boot.run.profiles=sit`
plus manually-exported env vars (DB_PASSWORD from `secrets.local.env`, TICKET_TOKEN_SECRET_KEY
from the task brief, JWT/SendGrid/Omise/ThaiBulkSMS/Google values copied from the main clone's
gitignored `application-local.yml`) — booted on port 8080 against the real SIT Supabase. FE
served via bare `ng serve --port <random>` (NOT `npx playwright test`, whose own `webServer`
tries `ng serve --configuration sit` on :4200 and fails — `environment.local.ts` doesn't exist
in a fresh worktree, only the `.example`). `environment.base.ts`'s default `apiUrl` is
`localhost:8000` but the backend's real default port is `8080` (docker-compose remaps to 8000,
plain `mvn`/`spring-boot:run` does not) — edited `apiUrl` to 8080 for this run only, reverted
after.

**Real bug found — `boardedAt: null` in the boarding-scan success response:**
`TicketRepository.updateBoardedByIdIfConfirmed` is a native `@Modifying` bulk UPDATE with no
`clearAutomatically`/`flushAutomatically`. `TicketService.boardingScan` loads the `Ticket` via
`findById` BEFORE the bulk update (to check `scheduleId`/status), so it's already in the
persistence-context L1 cache; the immediately-following `findById` after the update returns the
SAME stale managed instance instead of re-querying, so `boarded.getBoardedAt()` is `null` in the
response even though the DB row is correctly stamped (verified directly via psql — `boarded_at`
and `boarded_by` both set correctly). Reproduced twice (tickets 74 and 75, salesperson's own
seed bookings on schedule 10 / today). Real user impact: `boarding-list-page.component.ts:187`
merges `result.boardedAt` straight into the on-page row, so the just-scanned passenger's row
shows a blank boarded-at until the list is refreshed/reloaded (a fresh GET re-queries and gets
the right value). Fix would be `ticketRepository.flush()` + `entityManager.clear()` (or
`@Modifying(clearAutomatically = true)`) between the update and the re-fetch in
`TicketService.boardingScan`.

**Confirmed via direct API (curl) against local-BE/live-SIT-DB, all matching contract:**
happy-path scan 200 (passenger name + seat correct, boardedAt bug above), ALREADY_BOARDED 409,
WRONG_SCHEDULE_TICKET 400, INVALID_TICKET_TOKEN 400, TICKET_NOT_CONFIRMED 409 (via real
cancel-booking API on a sacrificial salesperson-owned booking, not raw SQL), customer role on
`/boarding-scan` → 403 ACCESS_DENIED. Critically: **garbage/tampered token returns 400, never
401** — the OBRS-187 regression guard holds at the API layer, and live-browser-confirmed too
(staff stayed on `/staff/boarding/10`, no forced logout, after scanning a garbage token).

**Scope correction — don't confuse the pre-existing `my-booking-ticket-modal` /
`app-e-ticket-card` (My Bookings' "View e-ticket" action) with the actual OBRS-96 feature.**
That modal is untouched by this branch (`git diff dev...HEAD --stat` confirms) and still passes
ONE comma-joined `ticketNumber` string for the whole booking into a single QR — that is NOT a
regression, it's just the wrong component to test. The real per-ticket QR lives in
`e-ticket.component.html`'s `*ngFor="let passenger of passengers"` block, one `.ticket-card`
per ticket with its own `passenger.qrDataUrl`/`ticketNumber`, and a `qrCardPlaceholder` template
for `qrUnavailable` tickets (confirmed by source read) — but this page's `bookingId` comes from
NgRx state set by `invokeSetBookingApi` during the live checkout/payment-result flow with NO
localStorage persistence (`booking.effect.ts`'s `getBooking$` just echoes current store state,
no HTTP call) — it cannot be deep-linked directly; reaching it live requires driving the full
booking→payment flow. Did NOT complete that live within the 45-min box; verified structurally
via source instead (see report). If a future session needs to live-verify this exact page,
budget for the full search→seats→passenger-info→payment→e-ticket flow (see
`obrs-booking-flow-playwright-capture` memory) rather than trying to reach it from
"My Bookings".

**`mapBoardingScanErrorCode`/`boardingScanErrorSeverity`/`boardingScanErrorIcon`
(`boarding-scan-error.ts`) branch strictly on `error.error.errorCode`, never message text** —
confirmed by source read, matches the live errorCodes observed above exactly (INVALID_TICKET_TOKEN,
WRONG_SCHEDULE_TICKET, TICKET_NOT_CONFIRMED, ALREADY_BOARDED, plus EXPIRED_TICKET_TOKEN /
BOARDING_WINDOW_NOT_OPEN which are time-dependent and not live-tested here — covered by BE unit
tests per the task brief).

---

## OBRS-96 QA re-verify after the boardedAt fix (2026-07-10, second pass)

**Both gaps from the first pass closed, live:**

1. **boardedAt fix confirmed** (backend commit `20cc56f`, `@Modifying(clearAutomatically=true,
   flushAutomatically=true)`): scanned a fresh ticket (id 81) via curl — response now returns
   `"boardedAt":"2026-07-10T13:27:34..."` instead of `null`. Live-confirmed in the browser too:
   scanned ticket 82 on the staff boarding-list page and the row showed `เช็คอินแล้ว` +
   `เวลาขึ้นรถ: 13:28` **immediately, with no page reload** — screenshot
   `05-scan-success-boardedAt-no-reload.png`.

2. **Live-rendered the actual OBRS-96 per-ticket QR e-ticket page** (the headline feature, only
   structurally verified in the first pass). Drove the full real booking flow as
   `customer@system.local`: home search (หนองชาก → BTS หมอชิต, 2 adults) → seat selection (2
   distinct seats, one per passenger, via the `.card-container.mt-3` per-passenger seat-van maps)
   → passenger-info (booker + `useBookerInfo` copy for passenger 1, manual fill for passenger 2)
   → payment with Omise test card `4242 4242 4242 4242` → landed on `/e-ticket`. Result: **2
   passengers → 2 distinct QR codes**, each with its own `ticketNumber` (`T-2SPNB7S72Q` seat 6 /
   `T-EES6CLCAHN` seat 7), passenger name, and a download button — screenshot
   `06-e-ticket-page-HEADLINE.png`. Confirmed the QR encodes the real signed **boardingToken**
   (not the ticket number) by re-fetching a token for the just-booked ticket 102 and scanning it
   at the boarding-list endpoint — round-tripped correctly (see below).

**Bonus finding — `BOARDING_WINDOW_NOT_OPEN` verified live** (was deferred as time-dependent in
the first pass): the just-booked ticket 102 departs 2026-07-18 (today is 2026-07-10); scanning
its real token on its real `scheduleId` (11) correctly rejected with 400
`BOARDING_WINDOW_NOT_OPEN` ("Boarding is only allowed on the day of departure") rather than
boarding it early.

**Automation gotchas hit driving the full booking flow (useful for next time):**
- **Seat inventory depletion across retries**: each abandoned/failed script attempt still
  reserves seats on that schedule (no visible release), so repeated runs against the SAME
  schedule burn through its free-seat count fast (schedule 10 today went from 7→0 free across a
  few attempts; schedule 7 (2026-07-17) similarly). Pick a schedule with a healthy taken/free
  ratio first — query `select count(*) from tickets where schedule_id=X and status in
  (confirmed,checked_in,reserved)` vs. capacity — and expect to burn a few seats per debugging
  iteration. Schedule 11 (2026-07-18) had only 3/13 taken and absorbed the successful run fine.
- **Passenger seat maps**: `.card-container.mt-3` on the passenger-info page is NOT 1:1 with
  passengers — index 0 is the booker card, index 1/2 are passenger 0/1's own seat-van maps.
  Scope `.seat-box:not(.disabled)` inside the right card, re-querying live (not cached) right
  before each click, since taking a seat in one map disables it in the other (shared inventory).
- **The credit-card `p-calendar` (`view="month"`, `inputId="templatedisplay"`) resisted every
  Playwright UI approach** (`#templatedisplay` click reported "element is not enabled"; the
  panel's month cells were empty/unmatchable). Fastest reliable workaround: patch the Angular
  reactive form directly via the dev-build's `window.ng.getComponent(...)` devtools API —
  `ng.getComponent(document.querySelector('app-payment-creditcard')).creditCardForm.patchValue({expireDate: new Date(2027,11,1)})`
  — then `markAsDirty()`/`updateValueAndValidity()`. This still exercises the REAL Omise
  tokenization + real backend payment call + real e-ticket render; only the calendar-click UI
  mechanic is bypassed. Legitimate for E2E capture, not for asserting the calendar widget itself
  works (that's out of scope for a payment-flow smoke test).
- **`FRONTEND_URL` env var on the local backend MUST match the FE's actual serve port** — Omise's
  card 3DS flow (`.../authorize` → `.../complete`) redirects the real browser back to
  `${app.frontend-url}/payment/result`; if `FRONTEND_URL` is stale (e.g. left at `:4200` from a
  previous session while the FE is actually on a fresh random port like `:4267`), the post-3DS
  redirect hits `ERR_CONNECTION_REFUSED` and the flow never reaches `/e-ticket`. Always set
  `FRONTEND_URL` to the exact port the FE was just started on for this session, not a
  remembered/default one.
- The `.p-monthpicker`/`.p-datepicker-calendar` selectors from the pre-existing booking-flow
  memory note (departure-date picker) worked fine as documented; it was specifically the credit
  card's `view="month"` variant that was unreliable to automate.

## 2026-07-10 — QA verification: OBRS-130 staff pre-departure boarding management

Verified LOCAL frontend (`ao/obrs-130-boarding`, this worktree, served on a fresh port against
a **local backend**, not Koyeb SIT — the new `/board`/`/unboard` endpoints aren't deployed yet)
paired with `OBRS-backend-wt-obrs-130-boarding` (branch `ao/obrs-130-boarding`) booted locally
with `spring.profiles.active=sit` (real SIT Supabase), `TICKET_TOKEN_SECRET_KEY` given by the
task + a locally-generated `JWT_SECRET_KEY` (any valid HS256 secret works — it only needs to be
internally consistent for this process's own sign/verify, not match Koyeb's). Real SIT data
found for the manifest: `scheduleId=10` (Chonburi-Bangkok, today) already had 6 confirmed
tickets (mixed boarded/not-boarded) from prior QA/dev sessions — no fresh booking-flow seeding
needed.

**Confirmed via curl (API) + Playwright (browser) against the real local stack:**
- Sell page Tab-3 ("ขึ้นรถ"/Boarding) renders the manifest **inline** — clicking the tab keeps
  the URL at `/staff/sell` (no navigation).
- Manifest columns: ticket #, seat, passenger, pickup stop, dropoff stop, a separate **Status**
  column (`สถานะ` = ticket lifecycle, e.g. "ยืนยันแล้ว"/Confirmed) AND a **Boarded** column
  (`ขึ้นรถแล้ว`/`ยังไม่ขึ้นรถ` with check-circle vs. empty-circle icon) — confirmed distinct,
  matches spec. Boarded rows show the audit sub-line `เวลาขึ้นรถ: HH:mm · บันทึกโดย: <name>`.
- Board → duplicate board → `409 ALREADY_BOARDED`. Unboard → duplicate unboard →
  `409 NOT_BOARDED`. Re-board after unboard produces a **fresh** `boardedAt` (verified two
  different timestamps on the same ticket across unboard/re-board) — no stale state.
- `boardedByName` attribution: boarded as `salesperson@system.local`, then re-fetched the same
  manifest as `admin@system.local` — still attributed to "Ms. Sales Person" (the real boarder),
  not "Mr. Admin Admin" (the viewer). Misattribution guard holds at the API level.
- Un-board is SALESPERSON-only server-side: driver token → `403 ACCESS_DENIED` on `/unboard`
  regardless of the ticket's boarded state (the `@PreAuthorize` gate rejects before the service
  layer even runs). Driver's own boarding page (`/staff/boarding/:scheduleId`) renders the full
  manifest + scan box + Board button but **zero** Un-board affordance anywhere in the DOM
  (`grep`'d the rendered body text for "ยกเลิกขึ้นรถ"/"Un-board" — zero matches).
  Screenshot: `qa-obrs-130-screenshots/11-driver-boarding-page.png`.
- i18n: `en.json`/`th.json`/`zh.json` all carry the full `STAFF.BOARDING.*` key set (`BOARDED`,
  `NOT_BOARDED`, `BOARDED_AT`, `BOARDED_BY`, `UNBOARD_*`, `ALREADY_BOARDED`, `NOT_BOARDED` error
  strings) — verified by direct key inspection in all three files; live browser-switch to
  ZH wasn't exercised this pass (ran out of time-box) but the TH default render was live-verified
  end-to-end with correct strings throughout.
- 409-no-forced-logout (OBRS-187 regression): confirmed at the code level, not just by
  observation — `auth.interceptor.ts` only force-logs-out on `error?.status === 401`, so a `409`
  (both `ALREADY_BOARDED` and `NOT_BOARDED`) can never trip it, full stop.

**One non-bug worth flagging for future readers (already anticipated in the code comment at
`boarding-list.component.ts` `board()`, ~line 140-144):** immediately after a successful Board
click, the row's "boarded by" optimistically shows `authService.getUsername()` — which in this
build returns the **raw email** (e.g. `salesperson@system.local`), not the formatted display
name ("Ms. Sales Person") the backend returns. It self-corrects within one `store.refresh()`
cycle (confirmed: reloading/re-navigating to Tab-3 immediately after shows the correct full
name). This IS the intended, commented tradeoff — not a defect — but it's a real few-hundred-ms
window where the row's format is visibly inconsistent with every other row if a screenshot or a
fast-clicking operator catches it mid-flight. Did not block QA; noting for anyone who sees it in
a future capture and wonders if it's the misattribution bug reappearing (it isn't — that one
is the *stale value across different viewers* case, which IS correct; this is a *this-operator,
this-instant* cosmetic-only optimistic-UI artifact).

**Residual gap (not exercised, disclosed rather than declared done):** driver-role **successful**
Board click wasn't captured end-to-end — the only driver-assigned schedule in SIT seed data
(`scheduleId=1`) departs 2026-12-20, outside the "boarding is only allowed on the day of
departure" window (`400 BOARDING_WINDOW_NOT_OPEN`), and `scheduleId=10` (today, has confirmed
tickets) has no `driver_id` assigned (`403` "not authorized to access this ticket"). Confirmed
the *authorization* boundary (driver reaches the service layer, correctly blocked by legitimate
business rules, not a blanket permission wall) but not a full driver board-success round-trip.
Would need either a schedule with both `driver_id` set AND `departure_date_time` = today in SIT
seed data, or a live DB write to create one — didn't do the latter to avoid mutating shared SIT
state beyond what the QA pass itself needed.
