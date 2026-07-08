# My Bookings change-seat dialog: modal chrome reuse, seat-component reuse, and the SELECTED marker

## Context

OBRS-110 (wave 1) adds a **Change seat** action to My Bookings, alongside the
existing Reschedule (OBRS-83) action. The backend contract
(`GET/POST /api/private/bookings/{id}/change-seat*`, see
`../OBRS-backend/docs/api/booking.md`) is a simpler shape than reschedule's:
one seat map, one confirm, always `CONFIRMED` — no payment step, no
date/options steps. Two implementation questions had no existing precedent
and needed an explicit decision; a third (reusing the seat components) was
already precedented but needed a small, additive extension.

## Decision 1: reuse the reschedule dialog's modal chrome, not `p-dialog`

Same rationale as `docs/adr/0008-my-bookings-reschedule-dialog.md` Decision 1:
`ChangeSeatDialogComponent` reuses the hand-rolled backdrop + `role="dialog"`
+ floating `×` + `HostListener('document:keydown.escape')` pattern rather
than introducing PrimeNG's `p-dialog` a second time in the same module.
`RescheduleDialogComponent` already proved this pattern satisfies every
requirement (backdrop click-to-close, Escape, close button, optimistic
open) with zero new dependencies — a third, inconsistent modal chrome next
to two consistent ones would be strictly worse (design-system §12).

## Decision 2: reuse `app-passenger-seat-bus`/`app-passenger-seat-van` in the walk-in flow's multi-select mode

The change-seat seat map branches on `vehicleType` between the existing
fixed-layout seat components — the same reuse `passenger-info-form.component.ts`
(`isVanVehicle$`) and `WalkInCenterPanelComponent` (`isVan`) already
establish. Specifically, it reuses the **multi-select mode** those
components already gained for the walk-in sell flow (`[seatGenders]` +
`(seatClicked)`, `seatGenders !== null` bypassing the single-`gender`
click-guard) rather than the customer passenger-info flow's single-select
mode — because, like walk-in, change-seat needs to mark seats **taken by
other tickets in the same booking** as disabled while still letting the
active ticket's own (already-taken-by-itself) seat register as clickable.

**New, additive input, not a fork:** `passenger-seat-box.component.html`
gained a `gender === 'SELECTED'` branch rendering a neutral
`check_circle` Material Symbol instead of a MALE/FEMALE/MONK image — for the
one thing change-seat needs that walk-in doesn't: showing "this is your
picked seat" **without** implying a passenger gender. Every existing call
site (passenger-info's single-select renders, walk-in's real gender tokens)
passes `MALE`/`FEMALE`/`MONK`/`''` and is untouched; `SELECTED` is a new,
purely additive branch (design-system §10).

**`rowIndex`/`columnIndex` are unused.** The backend's
`ChangeSeatAvailabilityRespDto.seats[]` carries a row/column position per
seat, but the app's seat components render a **fixed layout keyed off
`vehicleType` alone** (bus = B1..B21, van = a fixed A-series grid) — there is
no generic "render seats from a row/column array" renderer in this codebase,
and building one for this one screen would duplicate the existing
Reschedule/passenger-info/walk-in convention instead of reusing it. Only
`vehicleType`, `occupiedSeatNumbers`, and `currentSeatNumbers` are consumed;
`seats[].rowIndex/columnIndex` are carried in the TS interface for contract
parity but intentionally dead client-side.

## Decision 3: no estimate/payment step — `changeSeatSettled` fires straight off `CONFIRMED`

Unlike reschedule (`RescheduleResult.status` can be `CONFIRMED` **or**
`PENDING_PAYMENT`, requiring an embedded payment step), the change-seat
contract states the result is **always** `CONFIRMED` with
`paymentIntentId: null` — changing a seat never changes the fare. The effect
(`ChangeSeatEffect.confirmChangeSeatConfirmed$`) therefore has no
`PENDING_PAYMENT` branch to mirror `RescheduleEffect.confirmReschedulePending$`;
it goes straight from `confirmChangeSeatSuccess` to `changeSeatSettled`
(success toast + list refresh + close, never gated behind the refresh —
same acceptance shape as reschedule's).

## Decision 4: non-terminal confirm errors re-fetch availability and stay on the map (learned from the OBRS-83 NO_SEATS regression)

`RESCHEDULE_ERROR_NO_SEATS` taught a specific lesson (see
`reschedule-dialog.component.spec.ts`'s "NO_SEATS confirm failure
(regression)" describe block): bouncing back to a list step must **not**
re-dispatch the list's own load action, because that reducer case resets
both the loading flag (re-arming a spinner nothing needs) and the error
message (wiping the very banner meant to explain what went wrong).

Change-seat's `SEAT_UNAVAILABLE`/`NO_SEATS`/`SEAT_NOT_IN_MAP`/`TICKET_MISMATCH`
codes hit the same class of problem from the opposite direction: these
codes mean "the seat map moved under you" and **do** warrant a fresh
`loadChangeSeatAvailability` (unlike reschedule's NO_SEATS, which just
re-shows the already-loaded, still-valid options list). The fix is on the
**reducer** side instead: `loadChangeSeatAvailability`'s case only touches
`changeSeatAvailability`/`changeSeatAvailabilityLoading`/`changeSeatAvailabilityError`
— it never resets `changeSeatConfirmError`/`changeSeatConfirmErrorCode`. And
on the **component** side, `ChangeSeatDialogComponent`'s combined-state
subscriber short-circuits (`if (this.step === 'map') return;`) once the map
has been reached once, so a later `changeSeatAvailabilityLoading` flip
during the background re-fetch can never bounce `step` back to `'loading'`.
The banner and the (silently refreshing) map both stay visible — no
perpetual spinner, no dropped error, matching the design-system §11 rubric's
optimistic-open pristine-guard rule in spirit.

## Considered alternatives

- **A generic row/column seat-map renderer** driven by
  `seats[].rowIndex/columnIndex` — rejected: no existing renderer of this
  shape exists in the codebase (every seat surface is a fixed
  `vehicleType`-keyed layout), and building one for this single screen would
  both duplicate three existing call sites' convention and leave the
  contract's row/column data doing real work in exactly one place, which
  invites drift the next time a vehicle type's physical layout changes
  outside this one row/column projection.
- **A gender-repurposing hack** (e.g. passing `gender='MALE'` for "picked")
  — rejected: would render a male passenger icon for every seat pick
  regardless of the actual passenger, which is actively misleading, not just
  cosmetically wrong.
- **Re-dispatching `loadChangeSeatAvailability` from the component** instead
  of the effect on a non-terminal confirm failure — rejected in favor of
  keeping the re-fetch trigger inside `ChangeSeatEffect`
  (`confirmChangeSeatReturnToMap$`), consistent with "effects own
  cross-action orchestration, components own local UI state" already
  established by `RescheduleEffect`.
