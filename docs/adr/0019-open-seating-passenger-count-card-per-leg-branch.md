# 0019. OPEN-seating: per-leg passenger-count card instead of a seat map

## Status

Accepted (OBRS-323, "318-c" — customer online booking OPEN-seating flow).

## Context

OBRS-321 ("318-a") introduced a per-schedule `seatingMode` (`OPEN` | `ASSIGNED`) on
the backend — see `../../../OBRS-backend/docs/adr/0044-per-schedule-seating-mode-open-vs-assigned.md`.
An `OPEN` schedule sells seats with no fixed seat number; the customer online
booking flow (`PassengerInfoFormComponent`) previously always rendered a seat
map (`app-passenger-seat-van`/`app-passenger-seat-bus`) per leg, fed by
`ScheduleBooking.schedule` (an array — one entry per leg, index 0 = outbound,
index 1 = return on a round trip).

Two things are true at once here that a naive "hide the map when OPEN" change
misses:

1. **The two legs are independent.** A round trip can mix an `OPEN` outbound
   with an `ASSIGNED` return (or vice versa) — the seatingMode is set per
   schedule row, not per booking. The template has to branch per leg, not
   once for the whole card.
2. **A local FormArray mutation is not a store write.** `passengerData` is
   normally seeded once from the `passenger-info` store and otherwise driven
   by user input inside the form; nothing previously mutated its *length*
   outside of the initial seed. A `+`/`-` control changes the length directly
   via the existing `insertPassenger()`/`deletePassenger()`, but
   `setPassengerData()` (the store-driven rebuild triggered by every
   `passengerInfo` store emission) would silently revert that change on the
   next re-emit if the mutation isn't also persisted back to the store.

## Decision

- Each leg gets its own `isOpenSeatingOutbound$`/`isOpenSeatingReturn$`
  observable (derived off `scheduleBooking$`, `shareReplay(1)`). The template
  hides only that leg's map/active-passenger-chip-row/leg-label and renders an
  inline passenger-count card in its place — reusing the `.count-section`
  +/- markup and disabled-state pattern from `DropdownObrsPassengerComponent`
  (visual consistency only; it stays bound to `passengerData`, not a
  `DropdownPassenger[]` — the two controls are not merged into one component,
  since one drives a FormArray length and the other drives a
  `ControlValueAccessor` value).
- When **every** leg on the booking is OPEN (both legs on a round trip, or the
  single leg on a one-way), the shared "Seat selection" card title/hint is
  dropped entirely and replaced by a single passenger-count card — there is no
  leg left to give it a map-picking framing.
- The count is capped at `Math.min(availableSeats of each OPEN leg,
  MAX_PASSENGERS_PER_BOOKING)` — the latter promoted out of
  `DropdownObrsPassengerComponent.maxPassengers` into a shared
  `MAX_PASSENGERS_PER_BOOKING` constant (`shared/constants/passenger-limits.ts`)
  so the two controls agree on the ceiling instead of each re-declaring it.
- Every `+`/`-` click immediately dispatches `invokeSetPassengerInfo` with the
  FormArray's current raw values (same call
  `PassengerInfoComponent.onSubmitPassengerInfo()` already makes on submit),
  so the store and the FormArray never fall out of sync — closing the gap in
  point 2 above.

## Consequences

- The ASSIGNED path is unchanged — a schedule with no `seatingMode` (or
  `'ASSIGNED'`) renders exactly as it did before this card; every branch here
  is additive (`*ngIf="!(isOpenSeating...$ | async)"` guards the existing
  markup, `else` guards the new).
- The next feature needing a passenger-count stepper outside the home-page
  search filter should reuse this pattern (the `openSeatCountCard`
  `ng-template` + `addOpenSeatPassenger`/`removeOpenSeatPassenger` shape),
  not re-derive it or reach for `DropdownObrsPassengerComponent` directly
  (that component is adult/kid-split and `ControlValueAccessor`-shaped, a
  different contract).
