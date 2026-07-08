# My Bookings change-stop dialog: route-stop-list reuse, estimate-summary `hideFee`, and the confirm-error persistence rule

## Context

OBRS-110 wave 2 adds a **Change stop** action to My Bookings, the 5th
action-menu item (after Reschedule, Change seat; before Cancel booking). The
backend contract (`GET/POST /api/private/bookings/{id}/change-stop/*`, see
`../OBRS-backend/docs/api/booking.md`) is closer to reschedule's shape than
change-seat's: a cost estimate, an embedded payment step for a top-up, and a
`CONFIRMED`/`PENDING_PAYMENT` branch — but the thing being changed is the
pickup/drop-off **stops**, not the schedule or the seats. Three reuse
questions and one state-persistence decision needed an explicit call.

## Decision 1: reuse `RescheduleDialogComponent`'s modal chrome and payment handoff, not a third pattern

Same rationale as `docs/adr/0008-my-bookings-reschedule-dialog.md` and
`docs/adr/0009-change-seat-dialog.md`: `ChangeStopDialogComponent` reuses the
hand-rolled backdrop + `role="dialog"` + floating `×` +
`HostListener('document:keydown.escape')` chrome, and — because change-stop
*can* require a top-up, unlike change-seat — reuses reschedule's exact
payment-step handoff too: `BookingService.setActiveBookingId(bookingId)`
fires before the dialog switches to the embedded step, and
`app-payment-creditcard`/`app-payment-qrcode` are embedded with
`[successRedirect]="null"` + `(paymentCompleted)`, identical to
`reschedule-dialog.component.html`. A third, inconsistent modal/payment
pattern next to two consistent ones would be strictly worse
(design-system §12).

## Decision 2: reuse `app-route-stop-list` as-is, extracted into its own module

The pickup/drop-off pickers are the **exact same** `RouteStopListComponent`
the home route map already uses (`stops`/`type`/`selectedSlug`/`province`
inputs, `stopSelected`/`confirmClicked` outputs) — no fork, no new picker.
The one wrinkle: `RouteStopListComponent` was declared directly in
`HomeModule`, which has its own `RouterModule.forChild([{ path: '', ... }])`
route. Importing `HomeModule` into `my-bookings.module.ts` (also lazily
routed) would fold that `''` route into `my-bookings`'s own route config and
collide with it — the exact trap `payment-methods.module.ts`'s own doc
comment already names for `PaymentModule`. The fix is the same one already
applied there: extract the component into its own thin
`RouteStopListModule` (`route-stop-list.module.ts`, declaring + exporting
just this component), imported by both `HomeModule` and
`my-bookings.module.ts`. `RouteStopListComponent` itself is untouched.

## Decision 3: `RescheduleEstimateSummaryComponent` gains `hideFee` + `i18nPrefix`, not a forked copy

Change-stop's estimate (`ChangeStopEstimate`) has `oldFare`/`newFare`/
`fareDiff`/`netAmount`/`paymentDirection` but **no fee field** — change-stop
charges no fee, only the fare difference. Rather than duplicating
`RescheduleEstimateSummaryComponent` for a near-identical layout minus one
row, it gained two optional inputs (design-system §10 — extend, don't fork):

- **`hideFee` (default `false`)** — hides the fee `<dt>/<dd>` row entirely.
  The reschedule call site doesn't pass it, so its render is unchanged.
- **`i18nPrefix` (default `'MY_BOOKINGS.RESCHEDULE'`)** — every label the
  component renders (`OLD_FARE`, `NEW_FARE`, `FEE`, the loading copy,
  `TOP_UP`/`REFUND`/`NO_PAYMENT`, `CONFIRM_BUTTON`, `BACK_BUTTON`) resolves
  under this prefix instead of a hardcoded `MY_BOOKINGS.RESCHEDULE.*`
  literal. Without this, the change-stop dialog would render reschedule's
  own strings ("Confirm reschedule", "Looking for available departures…")
  in a screen that isn't rescheduling anything — a real i18n leak, not just
  a naming nicety. `MY_BOOKINGS.CHANGE_STOP.ESTIMATE.*` /
  `.CONFIRM_BUTTON` / `.BACK_BUTTON` are populated in full (en/th/zh) as
  their own, independently-translatable copy — the same "each feature owns
  its full key set" convention `CHANGE_SEAT` already established rather
  than reaching into `RESCHEDULE`'s namespace.

  The component's `@Input() estimate` type also widened from
  `RescheduleEstimate` to a local structural `EstimateSummaryEstimate`
  (`rescheduleFee?:` optional) so a `ChangeStopEstimate` — which has no
  `rescheduleFee` at all — is still assignable without a cast. Every
  existing property access stays exactly as before.

## Decision 4: confirm-error persistence mirrors change-seat's rule, not reschedule's

Reschedule's reducer resets `rescheduleConfirmError`/
`rescheduleConfirmErrorCode` on every new `loadRescheduleEstimate` dispatch
(picking a different candidate supersedes the old failure). Change-seat's
`loadChangeSeatAvailability` reducer case deliberately does **not** touch
`changeSeatConfirmError`/`changeSeatConfirmErrorCode` (the OBRS-83 NO_SEATS
lesson: re-fetching to reflect reality must never silently wipe the banner
explaining what just went wrong).

Change-stop follows change-seat's rule, not reschedule's:
`loadChangeStopEstimate`'s reducer case resets only
`changeStopEstimate`/`changeStopEstimateLoading`/`changeStopEstimateError` —
never `changeStopConfirmError`/`changeStopConfirmErrorCode`. Only a fresh
`confirmChangeStop` dispatch clears those. This matters because change-stop
has no reschedule-style "candidate list" to bounce back to on a non-terminal
failure — every non-terminal `errorCode` just stays on the same estimate
step with its banner, so that banner must survive whatever re-estimate the
traveler triggers next (e.g. going back to drop-off and picking a different
stop). Locked in `my-bookings.reducer.spec.ts` and
`change-stop-dialog.component.spec.ts`.

## Considered alternatives

- **Importing `HomeModule` directly** for `app-route-stop-list` — rejected
  per Decision 2 (route collision).
- **A forked `ChangeStopEstimateSummaryComponent`** — rejected per Decision
  3: it would drift from `RescheduleEstimateSummaryComponent` the first time
  either flow's estimate layout changes, for a difference (one hidden row +
  a translation namespace) two optional inputs already express.
- **Reusing reschedule's `rescheduleConfirmError` reset-on-reload
  behavior** — rejected per Decision 4: change-stop's estimate step is the
  *only* place a non-terminal error can be shown (no options-list
  equivalent to bounce back to), so wiping the banner on the very reload
  that's supposed to reflect the new reality would recreate the OBRS-83
  regression in a new flow.
