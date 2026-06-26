# ADR 0004: In-Context Schedule Management in Sell Trip Browser

## Status
Accepted

## Context
Salespersons need to create, edit, and delete schedules without leaving the walk-in Sell screen. The existing `/staff/schedules` page is the canonical management view; this feature re-surfaces the same CRUD logic in-context inside the trip browser column.

## Decision

### Two Edit Paths Coexist by Design

| Path | Trigger | Fields | Purpose |
|---|---|---|---|
| 6-field schedule modal | Trip browser "Add schedule" / hover "+" on route header / "..." → Edit | departureDateTime, route, vehicleType, vehicle, driver | Schedule reconfiguration — moving a trip to a different time, route, vehicle, or driver |
| Center-panel "Trip Details" tab | Select a trip → Trip Details tab → Edit | capacity, seat plan, driver (limited) | Capacity and seat-plan adjustments for an existing trip |

These paths are complementary. Do NOT consolidate them — the center-panel path is optimised for fast on-day capacity tweaks, while the modal path is for structural changes.

### Hover + Keyboard Affordance

Action buttons (route "+" and trip "...") use opacity to avoid visual noise:
- Default: `opacity: 0.2` (barely visible, no distraction)
- On hover / `focus-visible`: `opacity: 1`
- Touch devices (`hover: none` media query): `opacity: 0.55` baseline so the buttons are discoverable without hover

### Optimistic Delete

When staff confirms deletion:
1. `routeGroups` is immediately reassigned to a NEW array (no mutation) with the deleted trip removed and empty groups dropped.
2. If the deleted trip was selected, `selectedTrip`, `selectedSeats`, `seatPassengerTypes`, and `idempotencyKey` are all cleared before the API call so that an in-flight checkout cannot POST against a deleted schedule.
3. The API call is then made. On success, a reconciliation `loadTrips()` call runs in the background. On failure, `loadTrips()` also runs to restore the deleted trip in the UI.

### Store Loading Strategy

`StaffSchedulesStore` is lazy-loaded: `ensureScheduleStoreLoaded()` is called only when the first modal is opened, not on page load. This avoids an unnecessary 6-request prefetch for users who never use schedule management on the Sell page.

## Consequences
- The trip browser (`WalkInTripBrowserComponent`) gains 4 new `@Output()` events and 1 new `@Input()` (`canManageSchedules`). It remains a dumb component — no store injection.
- `SellPageComponent` owns the modal state and orchestrates all CRUD calls via `AdminApiService`. It shares `StaffSchedulesStore` with the schedules page (root-scoped singleton, no double-fetch).
- PrimeNG `p-menu` (popup) is added to `StaffModule` via `MenuModule`.
