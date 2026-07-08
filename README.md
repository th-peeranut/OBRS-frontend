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

## My Bookings — Reschedule dialog

`/my-bookings` (`src/app/modules/my-bookings/`) renders a **Reschedule**
action on every booking card, alongside the existing "View e-ticket" /
"Cancel booking" actions. Per design-system §6/§11, the button is **always
present in the DOM** — it is `[disabled]` (with a `.tooltip-container`/
`.tooltip-box` reason, same convention as `register.component.html`) rather
than `*ngIf`'d away, whenever any client-side eligibility check fails:
status isn't `confirmed`, the booking isn't one-way/single-leg, it has
already been rescheduled once (`rescheduleCount >= 1`), or the departure is
inside the 4h reschedule window. These mirror the backend's own prerequisites
(`../OBRS-backend/docs/api/booking.md`, `POST .../reschedule`) so the action
is never presented as available when the server would reject it — the server
remains the final authority.

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

**Testing note:** `MockStore.overrideSelector()` (`@ngrx/store/testing`)
permanently pins the shared, module-singleton selector's memoized result
(`resultSelector.setResult(value)`) until `store.resetSelectors()` is called.
Because Karma bundles every spec file into one run, an override left
un-reset in one spec's `beforeEach` can leak into a completely unrelated spec
file that happens to import the same selector later in the same run. Any new
spec using `overrideSelector` should pair it with `afterEach(() =>
store.resetSelectors())` — see `reschedule.effect.spec.ts` and
`my-bookings.component.reschedule-dom.spec.ts` for the pattern.
