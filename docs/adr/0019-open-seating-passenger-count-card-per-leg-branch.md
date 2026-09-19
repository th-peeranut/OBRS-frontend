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
  different contract). ⛔ **Withdrawn — see the amendment below.**

## Amendment (2026-09-19, OBRS-1988) — the card reports the count, it does not edit it

**Why:** the owner asked why /passenger-info makes the customer state the
headcount a second time. It does not — the number is seeded from the search
page (`scheduleFilter.passengerInfo` → `insertPassenger()`). What the card
added was a second *edit* point for it, and that point was wrong twice over:
an ASSIGNED leg has no such control at all (its headcount is locked to the
search page), and `addOpenSeatPassenger()`/`removeOpenSeatPassenger()` wrote
only to the passenger-info store, never back to `scheduleFilter`, so going
back to the search page showed a different number.

**Changes:** `openSeatCountCard` renders the count as read-only text in all
three outlets; `addOpenSeatPassenger`/`removeOpenSeatPassenger` and
`openSeatMaxCount$` are deleted (`insertPassenger()`/`deletePassenger()` stay
— the seed path and the store rebuild still use them); the `OPEN_SEAT_MAX_HINT`
key is gone from th/en/zh; the card's own 1px border is gone, because in the
all-legs-OPEN case it sat alone inside `.card-container` and read as an empty
box-in-a-box. The per-leg branch and the ASSIGNED path in the sections above
are otherwise untouched.

**Standing rule this replaces:** a screen that needs to *change* a passenger
count belongs on the search filter, not on a booking step downstream of it —
one source of truth for the number that multiplies the fare.
