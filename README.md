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

Build (AOT + bundle-budget check, same as CI — builds against `environment.ts`, not deployable):

```bash
npm run build          # = ng build --configuration ci-smoke
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

### Vehicle Maintenance (`/admin/vehicles` → Maintenance tab, OBRS-209)

`VehiclesPageComponent` gained a second tab (`.schedule-tabs`/`.schedule-tab`,
the same tab-bar markup `SchedulesPageComponent` uses for its Sets/Schedules
tabs — no new route, no new guard). The tab starts **disabled** (visible, not
hidden) until an admin clicks the per-row "Manage maintenance" `admin-icon-btn`
on a vehicle, which focuses that vehicle and switches to it — copying
`SchedulesPageComponent.viewSchedulesForSet()`'s focus-banner pattern
("Showing maintenance for X · Back to vehicle list").

The tab body is `AppVehicleMaintenancePanelComponent`
(`src/app/modules/admin/pages/vehicles/vehicle-maintenance/`), a dumb,
self-sufficient component mirroring `BoardingListComponent`
(`src/app/shared/components/boarding-list/`): it owns its own
`VehicleMaintenanceStore` instance via `providers: [VehicleMaintenanceStore]`
on the component (component-scoped, **not** `providedIn: 'root'`) so a
remount for a newly-focused vehicle never replays a previous vehicle's cached
maintenance list. Only the panel's own `ngOnChanges` calls
`store.setVehicleId()` + `refresh()` (single-owner re-bind contract); the host
page must not call it. Create/update mutations `await store.refresh()`
afterward rather than optimistic-splice, since the server assigns id/timestamps.

The maintenance-status select is `app-admin-dropdown` (not `p-selectButton` —
design-system §11), required, placeholder-start with no pre-seeded default on
create, seeded from the record's current status on edit. There is no hard
delete: a record is closed by editing it to the "completed" status.

**Empty-state pattern** (new, design-system §12 candidate): a `200 + []`
response renders a centered icon/title/body block
(`.vehicle-maintenance-empty`, tokens `var(--admin-muted)`/`var(--admin-text)`
only) that **replaces the whole table section**, not a zero-row table under a
banner — reuse this instead of the older zero-row-table pattern when a list's
empty state deserves more than one muted `<tr>`.

Schedule create/update also surfaces a new backend error: a picked vehicle
with an open maintenance record covering the departure date returns
`errorCode: VEHICLE_UNDER_MAINTENANCE`. `SchedulesPageComponent.submitSchedule()`
branches on this stable code (never the localized message) and renders it as
an inline `<small class="schedule-form-message admin-error">` under the
Vehicle field instead of a second `AlertService.error()` toast — cleared on
vehicle/date change and on modal close.

Like Reports, the `revenue` field on `tiles` is **optional** and the Revenue
tile renders off its **presence** (`showRevenue`), never a client-side role
check — forward-compat for a future viewer (e.g. salesperson) the server
omits `revenue` for. Unlike Reports, "empty" has no date-range guard (there's
no picker — the endpoint is always "today" in Bangkok time) and is defined as
`departuresCount === 0 && bookingCount === 0 && occupancyRatePct === 0`; a day
with departure-date occupancy but zero booking-date bookings is **not**
empty (same divergent-basis reasoning as Reports' `isEmptyRange`, carried
over as `isEmptyDay`).

### Digital weekly vehicle inspection checklist (OBRS-312)

Two surfaces, sharing one backend contract:

**Driver form — `/staff/inspection`** (`InspectionPageComponent`,
`src/app/modules/staff/pages/inspection/`), a sibling route of `/staff/driver` and
`/staff/boarding/:scheduleId`, gated `requiredRoles: ['driver']`. Phone-first
(375–414px primary viewport, desktop is the afterthought) — see
`docs/adr/0023-weekly-vehicle-inspection-mobile-form-and-switchable-window-filter.md`
for the sticky-bar layout rationale. A `position: sticky` top strip (vehicle
`app-admin-dropdown` + `p-inputNumber` odometer + a "ตรวจแล้ว X / 23" progress
pill) and a `position: sticky` bottom bar (the single primary Submit button) keep
both reachable through a 23-row scroll. The strip's `top` is **bound to the
shared shell topbar's measured live height** (`measureTopOffset()`, recomputed
on resize/language change), not a hardcoded `top: 0` — the topbar is itself
sticky at `top: 0` with a higher z-index, so a naive `top: 0` on the strip
renders it invisibly underneath the topbar the moment the page is genuinely
scrolled (worst on a keyboard-squeezed viewport, where the topbar's wrapped
title also grows taller). The bottom bar reserves right-side padding so the
global "Report Issue" FAB (`position: fixed; bottom: 24px; right: 24px`) never
shares a tap target with Submit. Both are owner-review corrections — see ADR
0023 for the full root-cause writeups.

Each checklist row is a card with a plain **`.admin-btn`-based** OK/Needs-repair
toggle (`.inspection-verdict-btn`, ≥44px tap targets) — **not** PrimeNG's
`p-selectButton`** (an owner-review correction: PrimeNG's own `.p-button` has no
dark-mode-aware background, so every unselected segment rendered as a solid
white block in dark mode). `verdict` starts `null` on every row via the
control's initial value (design-system §3.1), and switching a row **away**
from `needs_repair` clears that row's note control **value**, not just hides
it. A repeated tap on the *already-selected* segment is a no-op
(`selectVerdict()`'s same-value guard) rather than a deselect-to-null that
would trigger the same clear-on-switch-away path and silently wipe a just-typed
defect note (see ADR 0023). Submit is never disabled for incompleteness — only
while actually submitting — an incomplete attempt scrolls to and highlights the
first offending row plus a non-blocking toast.

Three root-scoped `AdminCollectionStore` subclasses back the form
(`VehicleInspectionItemsStore`, `InspectableVehiclesStore`, `MyInspectionsStore`,
mirroring `DriverSchedulesStore`) — the vehicle picker is the **whole active
fleet** (`/vehicles/inspectable`), deliberately not derived from
`DriverSchedulesStore`, since an ad-hoc cover driver has no assigned schedule for
the van they're inspecting. Error handling branches on `errorCode`
(`shared/lib/vehicle-inspection-error.ts`, mirroring `change-seat-error.ts`) and is
**non-destructive** — a rejected 4xx never clears the form, since a driver's entries
can represent many minutes of on-site work on a shaky mobile connection. A
dismissible "already inspected this week" banner (`shared/lib/inspection-week.ts`,
ISO week Mon–Sun Bangkok) never gates the form underneath.

**Owner history — a third `/admin/vehicles` tab** (`AppVehicleInspectionPanelComponent`,
`src/app/modules/admin/pages/vehicles/vehicle-inspection/`), reusing the exact
`focusedVehicle` mechanic the Maintenance tab (above) established — same tab-bar
markup, same per-row focus action, same component-scoped-store precedent
(`VehicleInspectionHistoryStore` mirrors `VehicleMaintenanceStore` byte-for-byte).
Read-only: no Add/Edit/Delete, inspections are immutable and only drivers create
them. Defaults to the current + previous Bangkok ISO week via a **switchable**
"Show all" filter, never a hard query bound — see the ADR above for why a rejected
vs. an ignored defect must stay distinguishable. Row click opens a read-only detail
modal (`.admin-modal-backdrop` idiom) optimistically, with the summary fields
already in hand and a spinner over just the items list; a request token guards
against the user opening a different row before the fetch resolves.

### Inspection checklist items master list (`/admin/inspection-items`, OBRS-509)

Owner-facing admin CRUD + reorder for the vehicle-inspection checklist master
list the driver form above (OBRS-312) reads from — `InspectionItemsPageComponent`
(`src/app/modules/admin/pages/inspection-items/`), gated `requiredRoles: ['owner']`
(ADMIN inherits via `ROLE_GRANTS`). One smart page, no dumb children, at the
same scale as `CargoCapacityPageComponent`/`LookupSettingsPageComponent`.
`InspectionItemsStore` follows the `CargoCapacityStore` (OBRS-508) precedent —
root-scoped, real write path via `store.mutate()` at the page's own call
sites — **not** `lookups.store.ts`, whose write path was never wired.

**Reorder is move-buttons, not drag-and-drop**, and **Retire/Restore is a
plain `.admin-icon-btn`, not a switch or a colored button** — both are new
patterns with no local precedent before this card; the full reasoning (and
the two rejected intermediate designs for the second one) is recorded in
`docs/adr/0025-inspection-items-admin-reorder-buttons-and-icon-only-retire-restore.md`.
Reorder fires one `PUT /reorder` per click immediately (no debounce), guarded
against out-of-order **responses** by a monotonic `latestReorderSeq` counter;
a `reorderPending` flag additionally gates the page's `store.data$`
subscription so an unrelated background emission can't clobber the
just-clicked local order before the reorder's own request resolves.

**No delete, anywhere (AC#4).** `AdminApiService` gets no delete method for
this feature and the Actions column renders exactly Edit + Retire/Restore —
copying `LookupSettingsPageComponent`'s modal shell (`admin-modal-backdrop`/
`admin-form-grid`) deliberately excludes its trash icon, delete-confirm modal,
and `isDeleteModalOpen`/`confirmDelete()` members.

**The 3-locale label editor** is a fixed-length (3), always `th, en, zh`,
`FormArray` built once in the constructor and only ever `reset()` (never
rebuilt/torn down) on modal open; the `store.data$` subscription updates only
`rows`, never `itemForm` — the direct fix for the FormArray-orphaning bug this
same feature (OBRS-312) already shipped once. All three languages are
required client-side, mirroring the server's set-equality enforcement.
**Thai comes first** in both the form and the list column: it is the only
locale actually read here (`SNAPSHOT_LOCALE = "th"` writes every history row
from it), so it is the line the eye should land on. `localeLabelKeys` is
index-aligned with the `FormArray` and a spec pins that alignment — reordering
one without the other silently mislabels every field.

### Internal fleet live map — layer 1 (OBRS-424)

`/staff/fleet-map` (`FleetMapPageComponent`, `src/app/modules/staff/pages/fleet-map/`),
gated `requiredRoles: ['salesperson']` (salesperson+owner+admin, driver
excluded), nav entry inside `staff-layout.component.ts`'s `isSalesperson`
branch. Shows every fleet vehicle on one **Leaflet + MapTiler** map
(`docs/adr/0024-leaflet-fleet-live-map.md` — a second, independent mapping
stack alongside `@angular/google-maps`), auto-refreshing every 60s via the
existing `pollWhileVisible()` helper, backed by `FleetMapStore`
(root-scoped `AdminCollectionStore<FleetPositionRespDto[]>`, no route param).

**Status resolution is one ordered ladder, not four independent flag
checks** (`shared/lib/fleet-vehicle-status.ts`, `resolveFleetVehicleStatus()`):
backend `stale` is `true` whenever `positionKnown` is `false` (not a
"don't care"), so checking `stale` before `positionKnown`/`gpsImeiConfigured`
would render every never-reported/not-tracked vehicle as a false "device
offline" state. The five resulting states (`NOT_TRACKED` → `AWAITING_SIGNAL`
→ `OFFLINE` → `GPS_LOST` → `LIVE`) map onto the existing `.admin-status.is-*`
tokens (no new hex); a separate `FLEET_STATUS_HAS_MARKER` predicate (map-only)
decides marker eligibility — `NOT_TRACKED`/`AWAITING_SIGNAL` never get a pin.
`FleetVehicleStatusListComponent` renders every vehicle regardless (it never
reads `FLEET_STATUS_HAS_MARKER`), making it the fallback source of truth when
the map itself can't render at all.

**`FleetMapPanelComponent`** (`components/fleet-map-panel/`) owns the actual
`L.Map` instance. Two hard rules, each tied to a documented failure class in
this codebase: markers are held in a `Map<vehicleId, L.Marker>` field and
mutated in place every poll (`.setLatLng()`/`.setIcon()`/`.setPopupContent()`)
— never rebuilt as a fresh array (`route-map-panel.component.ts:253-256`'s
getter-landmine, same failure shape in the Leaflet world); and `ngOnChanges`
is buffered into a `latestVehicles` field and replayed in `ngAfterViewInit`,
since Angular always calls `ngOnChanges` before `ngAfterViewInit` and the
root-scoped store replays cached data synchronously on every re-subscribe —
so the `@Input` write reliably arrives before the view exists on re-entry.
`ngOnDestroy` calls `this.map?.remove()` (this app has no
`RouteReuseStrategy`, so every route entry builds a fresh map and the old one
leaks without this). Marker fill/halo colors reuse the same
`--admin-*-text`/`--admin-*-bg` CSS vars already bound to each `.admin-status`
role, assigning `-text` to the marker's fill and `-bg` to its halo — legible
in dark mode only because the tiles deliberately stay light in both themes
(same precedent as the Google map, `dark-theme.scss:562-565` — see the ADR).

**No MapTiler key is provisioned yet** — `environment.base.ts` ships
`maptilerKey: ''`, so CI and every fresh clone take the empty-key path by
default: `canShowMap` (mirroring `RouteMapPanelComponent.showMap`) skips
`L.map(...)` entirely and renders the `STAFF.FLEET_MAP.MAP_UNAVAILABLE`
placeholder in place of the canvas. The side list has no dependency on the
map key at all, so the fleet's live/stale/offline/not-tracked status stays
fully readable with zero key configured. `scripts/inject-sit-env.js` /
`inject-prod-env.js` treat `MAPTILER_API_KEY`/`PROD_MAPTILER_API_KEY` as
**optional** (default `''`) — unlike `mapsApiKey`/`googleClientId`/the prod
payment vars, a missing map key costs only a map, never a build failure.

`AdminCollectionStore` gained an additive `lastFetchedAt$` (stamped on every
successful fetch, reset in `clear()`) so the page's
`STAFF.FLEET_MAP.REFRESH_FAILED_BANNER` can honestly say how old the shown
data is — distinct from any per-vehicle staleness the payload itself carries,
the same category error the `stale`/`deviceOnline` split above is designed to
avoid. Every other `AdminCollectionStore` subclass is unaffected.

### Boarding manifest — schedule delay control (OBRS-272)

`BoardingListComponent` (`src/app/shared/components/boarding-list/`) gained a
staff-only "Mark delayed"/"Update ETA" pill in the `.boarding-trip-header`
strip, next to OBRS-256's departed/arrived control — same role gate
(`canControlScheduleStatus`), visible only while the schedule is still
`scheduled`. Opening it shows an inline `*ngIf`-gated `.admin-modal-backdrop`/
`.admin-modal` dialog (component-local `FormGroup`, no separate component, no
NgRx — mirrors every other admin modal and OBRS-256's
`onScheduleStatusAction()`): a split `p-calendar` date + `p-calendar`
`[timeOnly]` pair (combined client-side via `combineBangkokDateTime()`, the
same `shared/lib/api-date-time.ts` helper `SchedulesPageComponent` uses) plus
an optional reason `textarea`. The ETA is client-validated as strictly after
the schedule's original `departureDateTime` before any API call; the backend
re-validates the same rule as `SCHEDULE_DELAY_ETA_INVALID`, which renders as
an inline field error, never a toast (only `SCHEDULE_DELAY_NOT_SCHEDULED`/
generic errors go through `AlertService.error()`).

"Delayed" is a **derived** UI state — `AdminScheduleDto`/
`BoardingManifestHeader.delayedDepartureDateTime` is a sibling field to
`status`, not a new status value (`PATCH .../delay`'s response `status` is
always `"scheduled"`). The on-screen indicator uses a new
`.admin-status.is-delayed` token (`--admin-delayed-bg`/`--admin-delayed-text`,
violet) distinct from the existing scheduled(grey)/departed(blue-grey)/
arrived(blue) pills — see `docs/design-system.md` §2.4.

This is also the first `.admin-modal-backdrop` dialog owned by a component
declared in `SharedModule` rather than a lazy feature module, which required
relocating `AdminModalBackdropDirective` from `AdminModule` into
`SharedModule` (declare + export) — see
`docs/adr/0017-schedule-delay-control-and-modal-backdrop-relocation.md` for
the full rationale (module-cycle avoidance, why `SharedModule` over
`AdminSharedModule`).

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

## E-Ticket — open-seating display (OBRS-325)

Both e-ticket surfaces — the shared `app-e-ticket-card` (used by the My
Bookings ticket modal) and the booking-flow's own `ETicketComponent` page —
swap the seat-cell's *text only* (same label/box, no new styling) when a
ticket's `seatNumber` is null: instead of a blank/`'-'` seat value they show
`E_TICKET.LABEL.SEAT_OPEN` ("ขึ้นนั่งตามที่ว่าง" / "Open seating" / 自由入座).
This is the display side of the open-seating epic (OBRS-318/321) — a
`schedules.seating_mode = OPEN` schedule leaves `tickets.seat_number` null by
design, not as missing data.

The FE has no `seatingMode` field on any read DTO yet (see `docs/handoff.md`
Contract Requests, 2026-07-14), so OPEN is inferred client-side from
`seatNumber == null`, computed once per leg/ticket (`TicketLeg.isOpenSeating`
in `shared/lib/booking-ticket-view.ts`; `TicketPassenger.seatOpen` in
`modules/e-ticket/e-ticket.component.ts`) rather than re-checked ad hoc in the
template — reuse those flags for the next surface that renders a ticket's
seat instead of re-deriving the null check inline.

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

## Authoritative trip distance/duration estimates (OBRS-138)

Customer-facing trip-planning surfaces (the home route map's travel summary,
the schedule-booking list, and the review-schedule-booking summary cards)
show a **free, authoritative** pickup→dropoff distance/duration estimate
derived from the seeded `route_stops` offsets, replacing an earlier
client-side proxy ratio. No Google Distance-Matrix call is made anywhere —
the map keeps its own road-snapped Directions + two-tier cache for drawing
the route line; these estimates are a separate, purely arithmetic derivation
from data already on the page.

- **`tripEstimateFromStops(pickup, dropoff)`** (`src/app/shared/lib/trip-format.ts`)
  is the single pure function every consumer calls: `distanceKm = |Δ
  distanceKmFromOrigin|`, `durationMinutes = |Δ offsetMinutesFromOrigin|`,
  each resolved **independently** — a missing value on either stop yields
  `null` for that one figure rather than fabricating a misleading `0`. Never
  gate distance on duration or vice versa.
- **`RouteMapService.getPickupDropoffCached(slug)`** (`src/app/services/route-map/route-map.service.ts`)
  is a reusable **request-dedup** pattern: a session-scoped in-memory
  `Map<slug, Observable>` plus `shareReplay({ bufferSize: 1, refCount: false })`
  and `catchError(() => of(null))`, so N schedule rows on the same route fire
  exactly one HTTP call and a failure degrades to "chip absent" rather than
  an `AlertService` error. This is intentionally lighter than the map panel's
  two-tier (localStorage + TTL) Directions cache — reach for this pattern
  whenever a list view needs to dedupe repeated lookups of the same
  reference data by key within one page load, without needing persistence
  across reloads.
- **The return-leg swap**: a return schedule's `routeSlug` is the *reverse*
  physical route, so its `pickup[]` holds the destination-city stops and its
  `dropoff[]` holds the origin-city stops. Every consumer resolves
  `fromSlug`/`toSlug` from the search filter's `startStationId`/
  `stopStationId` once, then swaps which slug is searched in `pickup[]` vs
  `dropoff[]` for the return leg only (`pickupSlug = toSlug`, `dropoffSlug =
  fromSlug`). Getting this backwards silently empties every return-leg chip
  (`.find()` never matches), so any new consumer of `getPickupDropoffCached`
  for a return leg must apply the same swap.
- **Slug space**: `StationApi.slug` (from `GET /api/stops`, the schedule
  filter's station store) and `StopEntry.slug` (from `GET
  /api/routes/{slug}/pickup-dropoff`) key off the same underlying
  `stops.slug` column server-side — station ids are resolved to slugs once
  per consumer (`stationSlugById`/`stationSlugById`-style private helpers
  mirroring the existing `getStationLabelById` pattern) and matched directly
  against `RouteStop.slug`, no translation layer needed.

## Seat-scarcity display (OBRS-229)

The schedule-booking list surfaces the exact remaining-seat count **only**
when seats are scarce; otherwise no seat-count text renders at all. This is
scarcity-only by design, not a full available/low/sold-out tri-state — the
search endpoint (`ScheduleRepository.searchSchedulesWithAvailability`)
already filters out any schedule without enough seats for the requested
party (`AND (capacity - occupied) >= :numberOfPassengers`), so a sold-out
row can never reach this component; every row shown here is bookable. A
neutral "seats available" label was considered and dropped as redundant —
the row's mere presence already implies availability.

- **`isLowSeatCount(availableSeats, threshold)`**
  (`src/app/shared/lib/trip-format.ts`) is the single pure predicate:
  `true` for `1..threshold` seats (inclusive), `false` otherwise — including
  `0`/missing, which is deliberately not a "warning" case since it can't
  occur here.
- `ScheduleBookingListComponent.LOW_SEAT_THRESHOLD = 5` is the current
  threshold; `isLowSeats(availableSeats)` wraps the predicate with it. Both
  legs (`departure`/`return`) call the same method — no duplicated logic.
- Template convention (`schedule-booking-list.component.html`): the
  `.availability` **div itself** carries `*ngIf="isLowSeats(...)"` — when
  seats are comfortable the div is absent from the DOM entirely (no empty
  wrapper, no layout gap), and when low it contains only a single
  `seat-status seat-status--low` span rendering `SCHEDULE_BOOKING.SEAT_REMAIN
  {n} SCHEDULE_BOOKING.SEAT_UNIT`. Reuse this pattern (`*ngIf` on the
  container, not the inner text) for any other surface that needs a
  scarcity-only cue rather than re-deriving the threshold check inline.
- `SCHEDULE_BOOKING.SEAT_PER_PASSENGER` (a leading-slash string, e.g.
  `/ที่นั่ง`) lives on the **`.price` line**, not the availability line — a
  `<span class="price-unit">` directly after `BAHT_UNIT` so the price reads
  as one grouped unit ("200 บาท/ที่นั่ง"). It used to sit in `.availability`
  next to a `|` separator; once the neutral/sold-out branches were cut that
  pipe went orphaned, and even conditioned on `isLowSeats(...)` it produced
  a visible "ที่นั่ง" duplicated on the same line as the low-seat warning.
  Grouping the per-seat unit with the price it actually describes removes
  both problems at once.
- Styling: `.seat-status--low` (red, semibold) on the availability span;
  `.price-unit` (small, muted — matches the old availability-line look) on
  the price-line unit. Dark mode re-asserts `.seat-status--low`'s colour in
  `src/styles/dark-theme.scss` §14, next to the existing
  `.text-error`/`.form-required` re-assert block, since the blanket
  `.schedule-item *` dark-mode rule would otherwise wash it out to
  `$dk-text`.
- The select button on both legs has no seat-based disable — every rendered
  row is already bookable per the search filter above, so it's always
  enabled.

## Parcel Consigned Delivery — Staff Intake, Waybill, Handoff, Public Tracking (OBRS-305 Card 2)

Four surfaces, built against
`../OBRS-backend/docs/api/parcels-consigned-delivery.md` (see
`docs/adr/0020-parcel-consigned-delivery-frontend.md` for the frontend-specific
decisions and `docs/handoff.md` for one assumed endpoint + one shape
ambiguity flagged back to the backend).

**1. Staff consigned intake** (`/staff/parcels/consign`, `requiredRoles: ['salesperson']`).
`ParcelConsignPageComponent` (smart) owns every HTTP call; `ParcelConsignFormComponent`
(dumb reactive form) assembles sender/recipient/schedule/pickup/dropoff/weight/
description/optional-dimensions/prohibited-acknowledgement and emits a debounced
(400ms) `quoteParamsChange` the page uses to refetch the live quote (thin service
call) and the cargo-remaining indicator (`ParcelCargoAvailabilityStore`,
component-scoped `AdminCollectionStore` — providers: [], same reasoning as
`BoardingListStore`) independently. Schedule/pickup/dropoff are all
`app-admin-dropdown` (placeholder, no pre-seed, design-system §3.1); dropoff
options are pre-filtered client-side to stops strictly after the chosen
pickup's `stop_order` (the "client pre-check"). On success,
`ParcelIntakeResultPanelComponent` replaces the form and shows the tracking
number/collection code/a link to the waybill. Every documented 409/400
`errorCode` maps to its own inline `STAFF.PARCEL_CONSIGN.ERROR.*` message
(never the raw response message); the form is never reset on error.

**2. Printable waybill** (`/staff/parcels/:id/waybill`, `requiredRoles: ['salesperson']`).
`ParcelWaybillPageComponent` renders `WaybillRespDto` via the dumb
`ParcelWaybillPaperComponent`, reused byte-identical for both the on-screen card
and the CDK-portal print-only template — same
`docs/adr/0015-boarding-manifest-print-isolation.md` idiom as
`BoardingListComponent.printManifest()` (own marker-class pair,
`.parcel-waybill-print-portal`/`body.parcel-waybill-printing`, in
`admin-theme.scss`). The QR (encoding `collectionToken`) is rendered directly via
the existing `qrcode` package (same call shape as `payment-qrcode.component.ts`) —
no new dependency. `collectionToken`/its QR appear on this page ONLY, never on
the public tracking response.

**3. Delivery handoff** (`/staff/parcels/deliveries` → `/staff/parcels/deliveries/:scheduleId`,
`requiredRoles: ['driver','salesperson']` — the role hierarchy note in the API
doc means a salesperson session also satisfies the backend's `hasRole('DRIVER')`
action guard). The entry page (`ParcelDeliveryEntryPageComponent`) mirrors
`BoardingEntryPageComponent` exactly (same driver/staff schedule-store split),
just navigating to the parcels-deliveries route. The list page
(`ParcelDeliveryListPageComponent`, component-scoped `ParcelDeliveryListStore`)
renders one row per consigned parcel with a state-driven action button
(`accepted`→Load, `in_transit`→Mark arrived, `arrived_notified`→Collect via
`ParcelCollectDialogComponent`, an inline `.admin-modal-backdrop` dialog using
the existing `AdminModalBackdropDirective`, OBRS-272). Every action is
**optimistic-disable-only**: the row's button disables while the request is in
flight, but its displayed `deliveryStatus` only changes once the actual 200
body's `deliveryStatus` is known — never guessed client-side. A wrong-state 409
shows an `AlertService.toast()` and re-syncs the row via `store.refresh()`
rather than trusting the stale local guess. The collect dialog ships a
code-only input for MVP (see ADR 0020 Decision 2 for why the existing
`BoardingListComponent` camera QR scanner isn't reused here).

**4. Public tracking** (`/track-parcel`, `/track-parcel/:trackingNumber` — own
lazy `ParcelTrackingModule`, `customerArea: true`, no `requireAuth`, same
precedent as `/refund-policy`). `ParcelTrackingService.track()` sets
`SKIP_AUTH_LOGOUT` (in addition to the usual `SKIP_GLOBAL_ERROR_ALERT`/
`SKIP_GLOBAL_LOADING_ALERT`) — a logged-in staff member browsing this public,
`permitAll` page with an expired token must never be force-logged-out by a bare
401 on a page that never required auth. A deep-linked tracking number
auto-runs the lookup on load; a 404 and any other failure both render the same
neutral "not found" state (the API doc: "no distinction between not-found and
any other state"). The status chip reuses the exact same `.admin-status.is-*`
markup as the staff delivery-list even though this customer-shell page has no
`.admin-shell` ancestor — see `docs/design-system.md` §12's new-pattern-log
entry and ADR 0020 Decision 1 for the cross-shell token-reuse rationale.

**Status-color mapping**: all 7 renderable `parcel_delivery_status` slugs map
onto the existing `.admin-status.is-*` tokens (no new hex) — see
`docs/design-system.md` §2.4.1 for the full slug→token table and
`shared/lib/parcel-delivery-status.ts`/its spec for the implementation + lock.

**DRY notes**: no new global NgRx slice was added (per the locked spec — thin
service calls for quote/tracking, component-scoped `AdminCollectionStore`
subclasses for cargo-availability/delivery-list). `StaffApiService` gained 8
new methods rather than a new staff-domain service (existing domain service,
same file). `RouteStopTimeDto.stop` gained an optional `id` field (additive) so
the consign form can resolve numeric `pickupStopId`/`dropoffStopId` from the
already-called `/private/route-stops/{slug}` endpoint, instead of adding a
second stop-lookup call.
