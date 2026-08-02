# ADR 0036 — One cancel screen for every refund method

**Date:** 2026-08-01
**Status:** Accepted
**Branch:** `ao/obrs-942-one-cancel-screen`

## Context

`MyBookingsEffect.requestCancel$` chose between two entirely different cancel
surfaces based on `GET /cancel-policy`'s `refundMethod`:

| `refundMethod` | screen |
| --- | --- |
| `MANUAL_REFUND_REQUIRED` | `CancelRefundDestinationModalComponent` — a real modal, and the only place OBRS-813's "reschedule instead of cancelling" offer existed |
| anything else (card/gateway auto-refund, `CASH`) | a plain `AlertService.confirm()` SweetAlert, built inline in the effect's `confirmCancellation()` — never mentioned reschedule |

The customer-facing numbers (refund %, penalty, original amount) are identical
on both lanes — they come from the same `cancellation_policies` row. Only
*who* moves the money differs (the payment gateway automatically vs. the
owner by hand), which is irrelevant to the traveler's decision between
cancelling and rescheduling. A card payer who cancels still loses 20% where a
free reschedule would have kept 100%, and the screen that would have told
them that never rendered on their lane. OBRS-813 closed half of this problem
(it added the offer, but only where the modal already existed); this card
closes the other half.

## Decision: delete the second screen — one modal, one lane predicate

`CancelRefundDestinationModalComponent` is renamed to `CancelBookingModalComponent`
and now opens for **every** resolved `refundMethod`. A single getter,

```ts
protected get isManualRefund(): boolean {
  return this.policy?.refundMethod === MANUAL_REFUND_METHOD;
}
```

gates the two pieces of UI that are genuinely manual-only: the refund
destination form (`<app-refund-destination-fields>`) and the
`MANUAL_REFUND_NOTE` line. Everything else — the cancel/refund/penalty lines,
the OBRS-813 reschedule offer (gated on `booking.rescheduleEligible`,
unchanged), the Cancel/Confirm buttons — renders identically on both lanes.
`requestCancel$`'s fork and the Swal-only `confirmCancellation()` /
`cancelConfirmed$()` helpers are deleted outright rather than kept as a
fallback: keeping both paths alive is exactly the two-screens problem this
card exists to close, just moved one layer down.

`confirmCancelWithDestination`'s `refundDestination` becomes optional
end-to-end (action props, the modal's `confirmed` output,
`MyBookingsComponent.onConfirmCancelWithDestination`) — the non-manual lane's
Confirm never collects a destination, so `toRefundDestinationPayload` always
returns `undefined` there, and `undefined` (never `null`) is what reaches the
wire: `CancelBookingReqDto.refundDestination` was already optional
(OBRS-766), so the non-manual POST body is `{}`, byte-identical to what
`cancelConfirmed$()` used to send.

### What deliberately keeps its old name

The component's own naming is now a lie fixed by this card
(`CancelRefundDestinationModalComponent` → `CancelBookingModalComponent`,
`app-cancel-refund-destination-modal` → `app-cancel-booking-modal`), but four
things that are *still accurate* were left alone rather than renamed for
symmetry:

- The `crdm-*` SCSS class prefix. Three files outside `ng test`'s reach depend
  on it literally: `e2e/tests/obrs-813-cancel-offers-reschedule.spec.ts`,
  `e2e/tests/obrs766-counter-cancel.spec.ts`, `e2e/scripts/capture-obrs813.js`.
  `npm run e2e:gate` is a separate CI job and the merge gate — renaming the
  prefix here would compile clean and pass `ng test` while breaking that job
  on the next run nobody watching this commit would see.
- The NgRx names (`openCancelRefundDestinationModal`,
  `closeCancelRefundDestinationModal`, `confirmCancelWithDestination`,
  `selectCancelRefundDestinationModal`, the `refundDestinationModal` state
  slice). The modal still *optionally* carries a refund destination, so the
  names remain true; renaming them would multiply this diff for no
  user-facing change.
- `MY_BOOKINGS.CANCEL.DESTINATION_DIALOG_TITLE`. Still literally true — it is
  now only ever rendered when `isManualRefund`.

### Lane source: the pre-cancel policy preview, not `refundLane()`

`isManualRefund` reads `this.policy.refundMethod` — the `CancellationPolicy`
the modal was opened with. `shared/interfaces/my-booking.interface.ts` already
exports a `refundLane()` helper, but its own docstring requires the lane be
read from the **cancel response**, never the pre-cancel preview, because the
two can disagree (a payment can flip method between preview and submit).
`refundLane()` stays scoped to its existing use — the post-cancel
`SUCCESS`/`SUCCESS_MANUAL` split in `MyBookingsEffect.showCancelSuccess()` —
and is not reused here; using it here would launder a pre-cancel value through
a helper documented to require a post-cancel one.

## Alternatives rejected

- **A third button on `AlertService.confirm()`, keeping the Swal lane for
  card/gateway/CASH.** Rejected by the user up front. It would still be two
  screens with the same information duplicated (and prone to drifting) across
  both, and SweetAlert's confirm dialog has no natural place for a tinted
  "reschedule instead" panel with its own CTA — the offer would need to
  become a `window.confirm`-style three-way choice, a worse interaction than
  the modal already has.
- **Keep two screens, just add the reschedule offer to the Swal text.** Closes
  the messaging gap but not the inconsistency gap — the two surfaces would
  still be two implementations of one decision, with the destination-form
  gating logic duplicated as an `if` inside `confirmCancellation()`'s string
  building instead of unified in one template.

## Consequences

- One template, one component, one set of unit/E2E specs to keep correct
  going forward — the next change to the cancel screen (copy, a new line, a
  new gate) touches one file instead of needing to remember a second one
  exists.
- The non-manual lane gets OBRS-813's reschedule offer for free, and gets its
  first E2E coverage (`e2e/tests/obrs-942-non-manual-cancel.spec.ts`) — every
  cancel spec before this card exercised `MANUAL_REFUND_REQUIRED` only.
- `MY_BOOKINGS.CANCEL.COMPARE.INSTANT` no longer promises "no staff transfer"
  unconditionally (untrue on the card/gateway lane, where there was never a
  staff transfer to wait on) — reworded in all three locales to "no waiting
  for the refund to land", true on both lanes.
