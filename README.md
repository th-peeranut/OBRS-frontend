# OBRS Frontend

Angular frontend for the Online Bus Reservation System (OBRS).

## Tech Stack

- Angular 18
- TypeScript 5
- NgRx
- PrimeNG + Bootstrap

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- Angular CLI (optional, local npm scripts are enough)

Verify:

```bash
node -v
npm -v
```

## Quick Start

1. Go to project directory:

```bash
cd OBRS-frontend
```

2. Install dependencies:

```bash
npm install
```

3. Run local development server:

```bash
npm start
```

App URL:
- `http://localhost:4200`

## Environments

The environment is selected **at startup** — it is baked into the running app and cannot be changed while the app is running.

| Environment | API backend | Command |
|---|---|---|
| Local (default) | `http://localhost:8000` | `npm start` |
| SIT | `https://sit-obrs-backend.koyeb.app` | `npm run start:sit` |

Environment config files live in `src/environments/`.

**To work against two backends at the same time**, open two terminals and start each on a different port:

```bash
# Terminal 1 — local backend
npm start
# → http://localhost:4200

# Terminal 2 — SIT backend (pick any free port)
npx ng serve --configuration sit --port 4201
# → http://localhost:4201
```

Open both URLs in separate browser tabs or windows and switch between them as needed.

## Useful Commands

Run with SIT configuration:

```bash
npm run start:sit
```

Build:

```bash
npm run build
```

Build SIT:

```bash
npm run build:sit
```

Run unit tests:

```bash
npm test
```

## Local Full-Stack Run

1. Start backend first on `http://localhost:8000`.
2. Start frontend with `npm start`.
3. Open `http://localhost:4200`.

## Admin UI Conventions

Admin list pages render a loading and empty state directly in the table body: while `isLoading` is true, iterate `skeletonRows` to show shimmer placeholder rows (`.admin-skeleton`, with the `--sm` / `--pill` modifiers to mirror each column's shape), and once loaded show the data rows plus a single `.admin-empty-row` carrying `ADMIN.COMMON.NO_DATA` when the result set is empty. These styles live in `src/styles/admin-theme.scss` (shared, not per-component) — reuse them on any new admin table rather than redefining a spinner, since the SIT backend can cold-start and a blank table reads as broken.

### User Management — Locked badge and Unlock action

The User Management page (`/admin/users`) renders a **Locked badge** (`.admin-status.is-warning.admin-status--icon` with a `lock` Material icon) in the Status column for any user whose `locked` field is `true`. The badge is visible to all admin-page viewers — it is not role-gated.

An **Unlock action** button (`.admin-icon-btn` with a `lock_open` icon) appears in the Actions column only when `user.locked && hasAdminRole()`. Clicking it opens a confirmation modal; confirming fires `PUT /api/private/users/{id}/unlock` (ADMIN-only), applies an optimistic `store.mutate` to clear the flag immediately, then triggers a background `store.refresh()`. Success and error outcomes are shown via `AlertService`.

### Shared sidebar shell (staff + admin)

Both the `/admin/*` and `/staff/*` shells share one sidebar implemented by the abstract `SidebarLayoutBaseComponent` (`src/app/shared/sidebar-layout/`) that `AdminLayoutComponent` and `StaffLayoutComponent` extend — put any sidebar behaviour change there, not in one layout. On desktop (≥ 1101px) the sidebar rests as a 76px icon rail and **expands on hover or keyboard focus** as an overlay (it floats over content, no reflow), collapsing ~120ms after the pointer leaves. A **pin** button (`push_pin`) locks it open; while pinned the sidebar becomes a reserved 280px column (content reflows). The pin preference persists in `localStorage` under `obrs-sidebar-collapsed` (`'0'` = pinned open, `'1'`/absent = hover rail) — note this key's meaning was repurposed from the old click-to-collapse toggle. Mobile (≤ 1100px) is unchanged: a hamburger off-canvas drawer, no hover/rail behaviour, pin hidden. See `docs/adr/0005-shared-sidebar-base-hover-expand.md`.

### Export trigger (`app-export-button`)

Any list screen that needs a "download this view as a file" action reuses the shared `app-export-button` component (`src/app/shared/components/export-button/`) and its companion `ExportService` (`src/app/services/export/export.service.ts`) rather than hand-rolling a button + menu + blob-download flow per screen. Inputs are `[datasetKey]`, `[requiredRole]` (lowercase role slug), and `[params]` (filter query params); it has no outputs and no NgRx — it is a fully self-sufficient presentational component. It renders a secondary `admin-btn` (never the primary role) that opens a `p-menu[popup]` with CSV / Excel(XLSX) options, is **hidden** (not disabled) when the current user lacks `requiredRole`, and shows a small rotating spinner + `Exporting…` label while the request is in flight. Errors branch on the backend's stable `errorCode` via `AlertService.error()`; success is silent (the browser's own download is the confirmation — no toast). See `docs/adr/0001-export-button-component.md` and `docs/design-system.md` §3.

### Reports (`/admin/reports`)

The MVP reporting page (OBRS-40) consumes one endpoint,
`GET /api/private/admin/reports/summary?from&to`, and renders four KPI tiles
(Bookings / Tickets Sold / Occupancy % / Revenue) plus a daily breakdown
table. It stays under the existing `/admin` guard (`requiredRoles: ['admin']`)
— admin/owner only for this MVP; salesperson access is deferred to OBRS-129.
The tiles are the dashboard's existing inline `.admin-card.admin-kpi` markup
(`admin-kpi-icon` / `admin-big-number` / skeleton), copy-pasted rather than
extracted into a shared component — the smallest diff for a single consumer;
extract a shared stat-tile component if/when OBRS-129 becomes a second one.

The `revenue` field on `tiles`/each `daily` row is **optional** in the
contract and the Revenue tile/column render off its **presence**
(`*ngIf="showRevenue"`), never a client-side role check — so the UI is already
correct for a future viewer the server omits `revenue` for, without a
frontend change. `ReportsStore` (`src/app/modules/admin/pages/reports/reports.store.ts`)
is the first `AdminCollectionStore` subclass parameterized by admin-chosen
input (a `[from, to]` date range, defaulting to the last 7 days) rather than a
fixed per-page query — `setRange()` updates the range and re-fetches in place,
keeping the same stale-while-revalidate re-entry contract as every other admin
store.

### Dashboard (`/admin/dashboard`)

The starter operational dashboard (OBRS-129) consumes one endpoint,
`GET /api/private/admin/dashboard/today`, and renders four KPI tiles
(Departures Today / Seat Occupancy / Bookings Today / Revenue Today) plus a
today's-departures table (Route / Departure Time / Seats Sold-Capacity /
Occupancy %). It stays under the existing `/admin` guard — no access-model
change. `AdminDashboardStore`
(`src/app/modules/admin/pages/dashboard/admin-dashboard.store.ts`) was
re-based onto `AdminCollectionStore<DashboardTodayDto>` (previously a bespoke
two-source cache merging `getBookings()` + `getVehicles()`), following the
exact pattern `ReportsStore` established: `fetch()` calls the single typed
endpoint and `emptySnapshot()` covers the API-returns-no-data edge. See
`docs/adr/0013-dashboard-rebase-on-admin-collection-store.md`.

Like Reports, the `revenue` field on `tiles` is **optional** and the Revenue
tile renders off its **presence** (`showRevenue`), never a client-side role
check — forward-compat for a future viewer (e.g. salesperson) the server
omits `revenue` for. Unlike Reports, "empty" has no date-range guard (there's
no picker — the endpoint is always "today" in Bangkok time) and is defined as
`departuresCount === 0 && bookingCount === 0 && occupancyRatePct === 0`; a day
with departure-date occupancy but zero booking-date bookings is **not**
empty (same divergent-basis reasoning as Reports' `isEmptyRange`, carried
over as `isEmptyDay`).

## Customer Account Page & Email-Change Flow

`/account` (OBRS-84) is the first customer "account settings" page — a
minimal card showing the signed-in user's login email (read from
`AuthService.getUsername()`, no new GET) with a single "Change email"
action. It uses the same guard shape as `/my-bookings`
(`AuthGuard`, `data: { customerArea: true, requireAuth: true }`) and does
**not** touch the area-based access model.

"Change email" opens `ChangeEmailDialogComponent` — the same hand-rolled
modal chrome as `ChangeStopDialogComponent` (backdrop, `role="dialog"`,
top-right ×, Escape-to-close; ADR-0010) — which POSTs the current password +
new email to `AuthService.requestEmailChange()`. The new email is **not**
applied yet: the backend emails a confirmation link to the new address, and
only applies the change once that link is opened. The dialog's new-email
field reuses `register.component.ts`'s debounced duplicate-check pipeline
(`debounceTime(500)` → `distinctUntilChanged()` → `switchMap(userService.checkExistEmail)`).

The confirmation link opens the new public route `/change-email/confirm`
(no guard — mirrors `/verify-email`'s shape), which reads `?token=` and
calls `AuthService.confirmEmailChange()`. Because the backend's old JWT
stops authenticating once the change is confirmed, a successful confirm
calls `authService.clearAuthData()` before redirecting to
`/login?reason=email-changed` (+ `&email=` when returned), so no stale token
lingers to 401 with a confusing toast. `LoginComponent` reads that query pair
to show `LOGIN.EMAIL_CHANGED_BANNER` and prefill the email field. An
already-used/expired confirmation token renders a **neutral** (not red)
state — the link is expected to be opened twice in normal use. See
`docs/adr/0014-account-identity-settings-page.md`.

This page is the **second** `.admin-card.admin-kpi` tile consumer the Reports
section above predicted — the markup is still copy-pasted rather than
extracted into a shared stat-tile component (out of scope for this rebuild;
tracked as consolidation debt, not actioned here since the two screens'
tile sets don't fully overlap in count/basis-caption shape). Extract a shared
component the next time a third dashboard-style screen needs KPI tiles.

## My Bookings — action menu & reschedule dialog

`/my-bookings` (`src/app/modules/my-bookings/`) collapses each booking
card's three actions — View e-ticket, Reschedule, Cancel booking (in that
order) — behind a single overflow trigger: a kebab (`bi-three-dots-vertical`)
icon button with an `aria-label` (`MY_BOOKINGS.ACTIONS_MENU.LABEL`), opening a
PrimeNG `p-menu` popup. This reuses the exact same pattern already
established by `WalkInTripBrowserComponent` (staff module) — a single shared
`#actionMenu` instance whose `MenuItem[]` model is rebuilt per row on open
(`openActionMenu()`), rather than introducing a second menu/dropdown
convention. PrimeNG's Menu popup already handles Escape/outside-click-to-close
and keyboard navigation, so no bespoke overlay logic was needed. Cancel
booking renders as the menu's one destructive item (`item.danger` →
`.action-menu-item--danger`, red per design-system §4); View e-ticket only
appears when the booking is paid/confirmed and Cancel booking only when it's
cancellable — the same conditional presence the old inline buttons had.

**Reschedule is the one item that is never omitted.** Per design-system
§6/§11, "shown but disabled, never hidden" now applies to a *menu item*
instead of an inline button: it always appears in the opened menu, `disabled`
whenever any client-side eligibility check fails — status isn't `confirmed`,
the booking isn't one-way/single-leg, it has already been rescheduled once
(`rescheduleCount >= 1`), or the departure is inside the 4h reschedule window
— with the localized reason rendered as visible subtext directly under the
label (`item.reasonText`, via `<p-menu>`'s custom `pTemplate="item"` — not a
hover-only tooltip, so it's unconditionally present once the menu is open,
not dependent on a simulated hover in tests). These mirror the backend's own
prerequisites (`../OBRS-backend/docs/api/booking.md`, `POST .../reschedule`)
so the action is never presented as available when the server would reject
it — the server remains the final authority.

Clicking an enabled action dispatches `openRescheduleDialog({ bookingId })`,
which the module-local `myBookings` NgRx state reflects **synchronously** —
`RescheduleDialogComponent` opens optimistically (its date-picker step is
interactive immediately; the stops lookup and the booking's current tickets
load in the background via `RescheduleEffect.loadStopsLookup$` /
`.loadRescheduleTickets$`, both triggered off the same `openRescheduleDialog`
action). The flow then steps through date → available-departures →
cost-estimate → (an embedded payment step, only if a top-up is owed) →
success. See `docs/adr/0008-my-bookings-reschedule-dialog.md` for the modal
chrome, payment-leaf reuse, and stop-ID resolution decisions behind this
component family (`src/app/modules/my-bookings/components/reschedule-dialog/`).

**Testing note (NgRx):** `MockStore.overrideSelector()` (`@ngrx/store/testing`)
permanently pins the shared, module-singleton selector's memoized result
(`resultSelector.setResult(value)`) until `store.resetSelectors()` is called.
Because Karma bundles every spec file into one run, an override left
un-reset in one spec's `beforeEach` can leak into a completely unrelated spec
file that happens to import the same selector later in the same run. Any new
spec using `overrideSelector` should pair it with `afterEach(() =>
store.resetSelectors())` — see `reschedule.effect.spec.ts` and
`my-bookings.component.reschedule-dom.spec.ts` for the pattern.

**Testing note (PrimeNG `p-menu`):** the popup content (including the custom
`pTemplate="item"` markup) is asynchronous and, with `appendTo="body"`,
rendered outside the fixture's own root node — the same conditions
`walk-in-trip-browser.component.spec.ts` already worked around. Don't try to
open the real popup and query its rendered DOM in a unit test; instead stub
the `@ViewChild` (`component.actionMenu = { toggle: jasmine.createSpy() }`,
assigned **after** the first `fixture.detectChanges()` — assigning before
gets clobbered by Angular's own view-query resolution pass) and assert
against the built `actionMenuItems` array, which is exactly what the item
template renders. See `my-bookings.component.reschedule-dom.spec.ts`.

### My Bookings — Change seat dialog (OBRS-110)

`ChangeSeatDialogComponent` (`src/app/modules/my-bookings/components/change-seat-dialog/`)
adds a **Change seat** action as the action menu's 4th item — after
Reschedule, before Cancel booking — following the exact "always present,
disabled with a localized reason when ineligible" contract Reschedule
established (`computeChangeSeatEligibility()` alongside
`computeRescheduleEligibility()` in `my-bookings.component.ts`: not
confirmed → not one-way/single-leg → already used
(`seatChangeCount >= 1`) → inside the 4h window → eligible, first-failing-wins,
no 30-day/TOO_FAR check since change-seat doesn't move the departure date).

The dialog itself is a single seat-map step (a ticket stepper — "Passenger
{{index}} of {{total}}" — appears only for multi-ticket bookings) rather than
reschedule's multi-step date→options→estimate→payment flow, because the
change-seat contract is simpler: `POST .../change-seat` always resolves
`CONFIRMED` with no payment step. It opens optimistically
(`openChangeSeatDialog` dispatches synchronously; `ChangeSeatEffect` loads
the seat-map availability and the booking's current tickets in parallel in
the background) and reuses the same fixed-layout
`app-passenger-seat-bus`/`app-passenger-seat-van` components the
passenger-info and walk-in-sell flows already use, in their existing
multi-select mode (`[seatGenders]` + `(seatClicked)`). The one addition:
`passenger-seat-box.component.html` gained a `gender === 'SELECTED'` branch
rendering a neutral `check_circle` marker (no gender icon) for "this is the
picked seat" — additive, every existing MALE/FEMALE/MONK call site
unchanged. See `docs/adr/0009-change-seat-dialog.md` for the full reasoning,
including why `rowIndex`/`columnIndex` on the availability contract are
intentionally unused (the seat components are fixed-layout, not
row/column-driven) and how the OBRS-83 NO_SEATS lesson (never let a
background re-fetch wipe an inline error or re-arm a spinner) was applied to
change-seat's own non-terminal errors (`SEAT_UNAVAILABLE`/`NO_SEATS`/
`SEAT_NOT_IN_MAP`/`TICKET_MISMATCH` re-fetch availability and stay on the
map with the banner visible; `NOT_CONFIRMED`/`MAX_COUNT`/`WINDOW_CLOSED`/
`MULTI_LEG_NOT_SUPPORTED`/`UNAUTHORIZED`/`BOOKING_NOT_FOUND` are terminal —
close + toast).

### My Bookings — Change stop dialog (OBRS-110 wave 2)

`ChangeStopDialogComponent` (`src/app/modules/my-bookings/components/change-stop-dialog/`)
adds a **Change stop** action as the action menu's 5th item — after Change
seat, before Cancel booking — following the same "always present, disabled
with a localized reason when ineligible" contract
(`computeChangeStopEligibility()` alongside the other two `compute*Eligibility`
methods in `my-bookings.component.ts`: not confirmed → not one-way/single-leg
→ already used (`stopChangeCount >= 1`) → inside the 4h window → eligible,
first-failing-wins; no 30-day/TOO_FAR check, same as change-seat, since
change-stop doesn't move the departure date).

Unlike change-seat, this dialog's shape is much closer to reschedule's: it
steps through **pickup → drop-off → estimate → (an embedded payment step,
only if a top-up is owed)**. It opens optimistically
(`openChangeStopDialog` dispatches synchronously) and resolves the booking's
`routeSlug` (`MyBookingScheduleDto.routeSlug`, added alongside `stopChangeCount`
on `GET /bookings/me`) to call `RouteMapService.getPickupDropoff(routeSlug)`
in the background — a missing/failed lookup renders a full-step error card
with Retry rather than falling back to a broken picker. Both steps reuse
`app-route-stop-list` (the exact same pickup/drop-off picker the home route
map uses) **as-is**, extracted into its own `RouteStopListModule` so
importing it here doesn't fold `HomeModule`'s own route into this module's
route config (mirrors `PaymentMethodsModule`'s extraction from
`PaymentModule`).

Before any network call, a client-side guard checks the picked segment:
`pickup.order < dropoff.order` (else `INVALID_SEGMENT`, shown inline on the
drop-off step) and the new segment differs from the booking's current one
(else `SAME_SEGMENT`). Only once both pass does `loadChangeStopEstimate`
fire, rendering the cost preview via `app-reschedule-estimate-summary` —
reused with a new optional `[hideFee]="true"` input (change-stop charges no
fee, unlike reschedule) and `i18nPrefix="MY_BOOKINGS.CHANGE_STOP"` (so its
labels resolve under change-stop's own translated copy instead of leaking
reschedule's — the existing reschedule call site omits both inputs and
renders byte-identically). Confirming posts
`{ newFromStopId, newToStopId, seatAssignments (current seats unchanged),
clientNetAmount }`; `CONFIRMED` (refund or no additional payment) settles
immediately, `PENDING_PAYMENT` hands off to the embedded payment step with
the exact same `setActiveBookingId` + `[successRedirect]="null"` +
`(paymentCompleted)` wiring reschedule's dialog uses. A confirm-time
non-terminal `errorCode` stays inline on the estimate step and is
deliberately **not** cleared by a re-dispatched `loadChangeStopEstimate` —
mirroring change-seat's (not reschedule's) OBRS-83 NO_SEATS lesson, since
change-stop has no options-list step to bounce back to; only
`NOT_CONFIRMED`/`MAX_COUNT` are terminal (close + toast). See
`docs/adr/0010-change-stop-dialog.md` for the full reasoning behind all
three reuse decisions and the confirm-error persistence rule.
