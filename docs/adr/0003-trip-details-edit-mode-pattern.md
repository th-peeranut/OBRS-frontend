# Trip Details edit-mode page pattern

**Date**: 2026-06-25
**Status**: Accepted

## Context

The Walk-in POS sell page (`/staff/sell`) shows trip details in a read-only `dl` list in the "Trip Details" tab
(`WalkInCenterPanelComponent`). A salesperson occasionally needs to correct a schedule's time, vehicle, driver, or
seating capacity without leaving the sell screen.

The backend provides `PUT /api/private/schedules/{id}` accepting `{route, vehicleType, vehicleId, driverId,
departureDateTime, seatingCapacity}` and returns only `{status, message}` — the frontend must refetch detail after
save. See `../OBRS-backend/docs/api/scheduling.md` and the companion backend ADR for the capacity validation rules.

## Decision

### 1. View↔edit toggle inside the tab — no new route

A single boolean flag (`isEditMode`) on `WalkInCenterPanelComponent` switches between:

- **Read-only** — `app-trip-details-view` (dumb), a replica of the existing `dl` rows, plus an "Edit" button.
- **Edit form** — `app-trip-details-edit-form` (dumb), a `FormGroup` with time/vehicleType/vehicle/capacity/seatPlan/driver.

No new route, no new NgRx slice. All edit state is local to `WalkInCenterPanelComponent`.

### 2. Optimistic-open with untouched-guard (SWR) patch

When the user clicks Edit:

1. `isEditMode = true` is set **synchronously**; the form resets to fallback values derived from the current trip row
   (`resetToFallback`). The form is visible and interactive immediately.
2. A `forkJoin` fires `getScheduleById` + `getVehicleTypes` + `getVehicles` + `getDrivers` in parallel.
3. When the responses arrive, `applyUntouchedPatch` updates only controls the user **has not yet touched** (field
   is `untouched`). This means arriving server data never clobbers in-progress edits.
4. `isEditLoading` drives a thin Bootstrap progress bar while loading; controls are enabled from the start.

The guard uses `control.untouched` (not `control.pristine`) because `setValue(…, {emitEvent:false})` doesn't flip
`dirty`, so a pristine check would incorrectly clobber typed values.

### 3. app-admin-dropdown reuse with `valueKey="code"`

The same `Option { code:string; label:string }` shape and `app-admin-dropdown valueKey="code"` wiring that the
admin schedules page uses (see `schedules-page.component.html:410-412, 543-545`) is reused here. `AdminSharedModule`
(which declares `app-admin-dropdown`) is already imported in `StaffModule`.

### 4. Driver endpoint: StaffApiService.getDrivers() — NOT AdminApiService.getUsers()

`GET /api/private/users` (`AdminApiService.getUsers`) is OWNER-only and returns 403 for salesperson users.
A new `StaffApiService.getDrivers()` method calls `GET /api/private/users/drivers`, which the backend exposes
as salesperson-readable. This endpoint returns `{id, name}[]` (matches the new `DriverDto` interface).

### 5. Save flow

On a valid form submit:

1. Build `UpdateSchedulePayload` and call `AdminApiService.updateSchedule(id, payload)`.
2. On 200: emit `(tripDetailsUpdated)` to `SellPageComponent` (optimistic patch), close edit mode,
   `alertService.success`, then emit `(refreshTripsRequested)` → `SellPageComponent.loadTrips(selectedDate)`.
3. On 400: map the backend error keys `schedule.error.capacity.exceeds-type-max` and
   `schedule.error.capacity.below-occupied` to localized **inline** messages on the capacity field. Other errors
   → `alertService.error`. The edit form stays open.

### 6. Seat-map preview is read-only

`app-passenger-seat-van` / `app-passenger-seat-bus` render inside a `position-relative` container.
An absolutely-positioned transparent `div` with `pointer-events:all; cursor:default; z-index:1` overlays the seat
component so no seats can be clicked. This avoids relying on the components' internal "empty gender" guard — see
ADR-0002 which notes the gate is fragile.

### 7. vehicleId / driverId handled as string control values

`app-admin-dropdown` stores the selected value as a string. Vehicle ID and driver ID are stringified for the
dropdown (`code: String(v.id)`) and converted back (`Number(value) || null`) when building the PUT payload.

## Consequences

- Salesperson can edit trip details in-place without leaving the sell screen.
- The optimistic-open pattern means the form is usable immediately; the SWR patch silently improves it when the
  server detail arrives (typically <500 ms on SIT).
- `WalkInCenterPanelComponent` is no longer purely dumb — it injects `AdminApiService`, `StaffApiService`,
  and `AlertService`. This is a deliberate exception: the spec requires no new route and no NgRx slice, so the
  centre panel is the appropriate smart component for this scoped edit flow.
- `SellPageComponent` gained two new outputs: `(tripDetailsUpdated)` and `(refreshTripsRequested)`, keeping the
  authoritative trip list in the smart parent.

## Cross-references

- Backend capacity validation rules: `../OBRS-backend/docs/adr/` (schedule capacity ADR).
- Admin schedules edit pattern (precedent for `app-admin-dropdown` reuse): `src/app/modules/admin/pages/schedules/`.
- ADR-0002 (Walk-in POS single-screen): covers the original smart-parent/dumb-children architecture this extends.
