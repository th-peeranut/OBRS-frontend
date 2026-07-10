# ADR 0013 — Rebase `/admin/dashboard` onto `AdminCollectionStore`

**Date:** 2026-07-10
**Status:** Accepted
**Branch:** `ao/starter-dashboards`

## Context

OBRS-129 ("starter operational dashboards") rebuilds the existing
`/admin/dashboard` page in place, backed by a new single endpoint,
`GET /api/private/admin/dashboard/today` (`DashboardTodayDto`: today's
departure count, seat occupancy %, booking count, optional revenue, and a
today's-departures table). It is a straight port of the pattern OBRS-40
established for `/admin/reports` (`ReportsStore` extending
`AdminCollectionStore<ReportsSummaryDto>`), applied to the second page.

Before this change, `AdminDashboardStore` was a **bespoke** cache that:

- Fetched from **two** unrelated endpoints (`getBookings()` +
  `getVehicles()`) via `Promise.all`, tracking each source's success/failure
  independently.
- Hand-rolled its own `BehaviorSubject<DashboardSnapshot | null>` +
  `BehaviorSubject<boolean>` (refreshing) pair, a `partialFailure` flag, and
  its own dedupe-concurrent-refresh logic — duplicating what
  `AdminCollectionStore` (extracted from this very store, per that class's
  own doc comment: "Generalised from the original `AdminDashboardStore`")
  already provides generically.
- Derived its tiles (`totalBookings`, `pendingPayments`, `revenue`,
  `activeVehicles`) and `recentBookings` client-side from raw booking/vehicle
  rows — status-string matching (`PENDING`/`PARTIAL`/`REFUND_REQUIRED`,
  `ACTIVE`/`ONLINE`/`AVAILABLE`) and revenue summation done in the frontend,
  duplicating business logic that now lives server-side in the new endpoint.

## Decision

Re-point `AdminDashboardStore` at `AdminCollectionStore<DashboardTodayDto>`,
deleting the bespoke two-source merge entirely — the same move `ReportsStore`
already made for `/admin/reports`. `fetch()` is a single
`firstValueFrom(adminApiService.getDashboardToday())` call; `emptySnapshot()`
covers the "API returned no `data`" edge (zeroed tiles/basis, empty
departures), mirroring `ReportsStore.emptySummary()` exactly.

This is a **rebuild-in-place**: the route, the sidebar nav entry, the shell
topbar title mechanism (`data.titleKey` / `subtitleKey` — no in-body `<h3>`),
and `pollWhileVisible` auto-refresh (departures/bookings change through the
day, unlike Reports' picked date range) are all kept as-is. Only the store's
internals and the page's rendering (tiles + a departures table instead of
bookings/vehicles tiles + a recent-bookings table) change.

### Why not keep the two-source merge and just add a third source?

The new `/admin/dashboard/today` endpoint already aggregates departures,
occupancy, bookings, and revenue server-side — this is the whole point of
OBRS-129's backend work (avoid re-deriving cross-cutting business rules,
like what counts as a "pending payment" or an "active vehicle", independently
on the frontend). Keeping the old bespoke merge alongside the new endpoint
would mean carrying two parallel dashboards' worth of client logic for data
the server now computes once, correctly, in one place. There is no forward
value in the old derived tiles (`pendingPayments`, `activeVehicles`) once the
new contract exists — they are direct product surface, not an
implementation detail worth preserving separately.

### Content-state model diverges slightly from Reports

Reports has a `'invalid'` content state (client-side date-range guard,
since the user picks `[from, to]`). The dashboard has **no date picker** —
the endpoint is always "today" in Bangkok time — so its `contentState` is
`'loading' | 'error' | 'empty' | 'data'` only, one fewer branch than
`ReportsPageComponent`. The "empty" definition is likewise adapted:
`departuresCount === 0 && bookingCount === 0 && occupancyRatePct === 0`
(Reports uses `bookingCount`/`ticketsSold`/`occupancyRatePct`) — carrying
forward the same "occupancy and booking count can legitimately diverge
because they key on different basis dates" reasoning from the OBRS-40
`e41e88e` fix, renamed `isEmptyDay` for this page.

## Consequences

- `AdminDashboardStore` drops to ~35 lines (was ~150), all business logic
  (pending-payment detection, active-vehicle detection, revenue summation)
  moves server-side where it can be tested and changed once instead of
  duplicated per-consumer.
- `DashboardSnapshot` / `RecentBookingRow` (the old bespoke types) are
  deleted; `DashboardTodayDto` (`shared/interfaces/dashboard-today.interface.ts`)
  is the new shared contract type, following the `ReportsSummaryDto` shape
  convention (decimal-string money, numeric percentage).
- The dashboard is now the **second** consumer of the
  `.admin-card.admin-kpi` tile markup pattern Reports established — still
  copy-pasted rather than extracted into a shared stat-tile component (see
  `README.md` "Admin UI Conventions → Dashboard"); tracked as consolidation
  debt, not actioned in this change.
- Cross-reference: backend endpoint contract lives in
  `../OBRS-backend/docs/api/` (dashboard doc to be added alongside the
  backend implementation — see `docs/handoff.md` if it lags this change).
