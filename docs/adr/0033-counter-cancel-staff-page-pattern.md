# ADR 0033 — Counter (staff act-on-behalf) cancel: a new staff page family, and its two-state-machine modal

**Date:** 2026-07-28
**Status:** Accepted
**Branch:** `ao/obrs-766-counter-cancel`

## Context

OBRS-661 (backend) shipped an ordinary act-on-behalf cancel for counter
staff, and OBRS-669 shipped a cash second-person approval on top of it.
Neither had a frontend caller — before this card, `grep`ping `approver`/
`stepUp`/`step-up` across this repo returned 0 hits, and
`BookingService.cancelBooking()` had exactly one caller repo-wide
(`my-bookings.effect.ts`, the customer module). A salesperson at the counter
had no in-system way to cancel a walk-in customer's ticket at all.

This card builds `/staff/cancel-booking`: search a booking by exact phone or
booking number, then cancel it through the same policy-preview → confirm
flow the customer's own My Bookings page uses — with a mandatory second-person
approval layered on top when the refund settles in cash.

## Decision 1 — component-local state, no NgRx

`CounterCancelPageComponent`/`CounterCancelModalComponent` hold state as
plain component fields (`FormBuilder` + service calls), the same shape
`OverrideCancelModalComponent` (OBRS-690, admin override-cancel) already
established. This is a new, isolated staff page with nothing to plug a store
into — unlike the customer `my-bookings` cancel flow, which is NgRx only
because it plugs into a pre-existing feature store. Reaching for NgRx here
would add a slice, actions, an effect, and a reducer to move state that never
leaves this one page.

## Decision 2 — two INDEPENDENT state machines in the modal, not one

`CounterCancelModalComponent` opens **optimistically**: the booking summary
renders immediately from the search-result row already in hand (design-system
§6). A **separate** `previewState` (`'loading' | 'blocked' | 'error' |
'resolved'`) tracks the refund-policy fetch. Collapsing these into one state
would force the summary to wait on the network for no reason — the row is
already correct data, just not yet policy-priced.

`previewState === 'blocked'` (`cancel.error.window-closed`) is **terminal**
per ADR-0103: no retry, no override affordance. That escape hatch is the
OWNER-only override-cancel modal (`OverrideCancelModalComponent`), a
different, more privileged surface — this screen must not grow a rate picker
or a full-refund button of its own.

`previewState === 'error'` (any other fetch failure) gets a Retry button and
blocks Confirm. This is a **deliberate divergence** from
`OverrideCancelModalComponent`'s own refund-method check: there, a failed
check degrades to "ask for the destination anyway, mark it optional" because
the destination is secondary information. Here the policy preview **is** the
modal's primary content — the operator must see the refund amount before
committing to a cancel on someone else's behalf — so a fetch failure blocks
Confirm outright instead of assuming a value.

## Decision 3 — the cash approval is three enforced layers, not one flag

The whole point of OBRS-669's control is worthless if the UI makes
self-approval feel like the normal path. `CounterCancelModalComponent`
implements all three layers the UX spec called for, and none is optional:

1. **Visual weight** — the cash-approval block is a bordered, tinted section
   (`.ccm-cash-approval`, `border: 1px solid var(--admin-warning-fg)` +
   `background: var(--admin-surface-soft)`), not two more fields blended
   into the form. `--admin-warning-fg` (not `--admin-warning-text`, which is
   chip text only and measures 1.53–1.86:1 standalone in dark mode per its
   own comment in `admin-theme.scss`) is the correct standalone-text/border
   token for this role (design-system §2.4/§11, OBRS-726 family).
2. **Copy that names the physical hand-off** ("Hand the device to an owner
   or manager...") — this is what makes typing your own credentials read as
   the wrong motion, not a technicality.
3. **Never-pre-filled fields** with `autocomplete="off"`
   (`approverEmail`) and `autocomplete="new-password"` (`approverPassword`)
   — the latter specifically defeats the browser silently offering the
   *salesperson's own* saved password, which would otherwise be the easiest
   way to self-approve by accident.

On top of those three, a **soft client-side check** (`approverNotSelfValidator`,
a `ValidatorFn` closed over `AuthService.getUsername()`) disables Confirm the
instant the typed email case-insensitively matches the logged-in salesperson.
This is implemented as a form validator (not a separate getter gating a
button) so `canSubmit`'s stated contract — `!isSubmitting && form.valid &&
previewState === 'resolved'` — stays literally true instead of growing a
fourth ad-hoc condition. It is explicitly a **nudge, not the control**: it
only catches the single-account case. The backend's `cancel.error.approver-self`
is the real gate, and when it fires, the modal shows the **same copy** as the
client-side hint (`STAFF.CANCEL_BOOKING.MODAL.APPROVER_SELF` ===
`.APPROVER_IS_SELF_HINT`, byte-identical in all three locale files) so the
rejection reads as confirmation of a stated rule, not a new surprise.

## Decision 4 — extend `CancelBookingReqDto`, reuse the endpoint and the `CancellationPolicy` interface, don't fork them

`approverEmail?`/`approverPassword?` are additive, optional fields on the
**existing** `CancelBookingReqDto` (`shared/interfaces/my-booking.interface.ts`),
the same additive pattern OBRS-286 already used to add `refundDestination?`
to this interface. `StaffApiService.getCancelPolicy()` and
`.cancelCounterBooking()` call the exact same two endpoints
(`GET/POST /api/private/bookings/{id}/cancel-policy|cancel`) the customer path
already calls via `BookingService`, and reuse `CancellationPolicy` verbatim —
the counter-cancel modal renders the **identical** policy preview the
customer sees on their own booking, not a second copy of that UI.

The one asymmetry worth naming: `StaffApiService` gets its **own** thin
wrapper methods around those two endpoints rather than the page injecting
`BookingService` directly. This mirrors the rest of `staff-api.service.ts`
(`getMe()`, `getDrivers()`, `getScheduleById()`, etc. all have staff-scoped
equivalents rather than reaching into the admin/customer services), keeping
one feature module's HTTP surface self-contained in its own service file.

## FE-1's byte-identical body requirement, and why the test is structured the way it is

The request body for a non-cash, non-manual-refund cancel **must** stay
`{}` — byte-identical to what every existing caller of this endpoint already
sends — because widening a shared DTO is a change every caller inherits
whether it wants to or not. `CounterCancelModalComponent.submit()` builds the
payload as a genuinely empty object literal and only assigns a key inside the
branch that applies to the booking's own resolved `refundMethod`; it never
defaults an unused field to `''`/`null`.

The regression test for this (`counter-cancel-modal.component.spec.ts`,
"cancel body byte-identity" describe block) deliberately does **not** use a
spied `StaffApiService` with `toHaveBeenCalledWith(id, {})` — some Jasmine
matcher configurations treat an `undefined`-valued key as equal to an absent
one, which would let an accidental `{ approverEmail: undefined }` pass
silently. Instead it runs the **real** `StaffApiService` against
`HttpClientTestingModule` and asserts
`JSON.stringify(req.request.body) === '{}'` at the actual wire layer.

## Consequences

- The next staff page needing an isolated confirm-with-server-preview modal
  (no store to plug into) has a worked pattern: optimistic summary + an
  independent preview state machine + a byte-identity-tested payload builder.
- `AppRefundDestinationFieldsComponent` (ADR-0032) now has its third,
  previously-anticipated consumer, mounted with zero component changes —
  the staff shell already wraps its pages in `.admin-shell`, so ADR-0032's
  rule 3 (`:host-context(.admin-shell)`) applies without a new override block.
- `--admin-warning-fg` gets a second real call site (`.parcel-intake-result-icon`
  was the only one recorded as intended-but-unmounted in the token's own
  comment); this card mounts it for real.

Cross-links: backend ADR-0113 (OBRS-backend, act-on-behalf cancel + cash
second-person approval contract); ADR-0103 (override-cancel is a separate,
OWNER-only surface — the "no override affordance here" boundary this card
respects); ADR-0032 (`AppRefundDestinationFieldsComponent`, this card's third
consumer, anticipated there by name).
