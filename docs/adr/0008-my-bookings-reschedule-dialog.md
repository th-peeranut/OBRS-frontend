# My Bookings reschedule dialog: modal chrome, payment-leaf reuse, and stop-id-via-slug resolution

## Context

OBRS-83 surfaces the existing reschedule backend endpoints
(`GET/POST /api/private/bookings/{id}/reschedule*`, see
`../OBRS-backend/docs/api/booking.md`) in the customer My Bookings page. Three
implementation questions had no existing precedent in this codebase and needed
an explicit decision.

## Decision 1: hand-rolled modal chrome, not PrimeNG `p-dialog`

The reschedule flow is a multi-step dialog (date → options → estimate →
optional payment). We reuse the **hand-rolled modal chrome** from
`my-booking-ticket-modal` (a fixed backdrop `<div>`, `role="dialog"`, a
floating top-right `×` button, `HostListener('document:keydown.escape')`) —
see `reschedule-dialog.component.html`/`.scss`.

**Rationale:** `p-dialog` (PrimeNG) is used **nowhere** in the customer shell
today — introducing it here would add a second, inconsistent modal chrome
right next to the ticket modal on the same page. The ticket modal's pattern
already satisfies every requirement (backdrop click-to-close, Escape,
close button, optimistic open) with zero new dependencies. New/touched UI
should read an existing pattern before introducing one (design-system §12).

## Decision 2: reuse the payment leaf components as an inline dialog step

When `POST .../reschedule` returns `PENDING_PAYMENT` (a top-up is owed), the
dialog's payment step embeds the **existing** `app-payment-creditcard` /
`app-payment-qrcode` components rather than navigating to `/payment`.

**Rationale:** `/payment` (`PaymentComponent`) reads its summary from the
`scheduleBooking`/`scheduleFilter` NgRx stores populated by the *original*
schedule-booking flow. Navigating there mid-reschedule would show a stale or
empty summary unrelated to the reschedule's actual fare. The leaf payment
components' own charge flow doesn't depend on that context either — `POST
/api/private/payments` is keyed by `bookingId` alone (no client-submitted
amount), so the backend resolves and settles the correct pending `Payment`
record regardless of how the customer got there.

**Extension, not fork** (design-system §10): both leaf components gained two
optional, null-default members so every existing call site
(`payment.component.html`) stays byte-identical:
- `@Input() successRedirect: string[] | null = ['/e-ticket']` — the default
  reproduces today's hardcoded `this.router.navigate(['/e-ticket'])`; the
  reschedule dialog passes `null` to suppress navigation.
- `@Output() paymentCompleted = new EventEmitter<void>()` — emitted
  unconditionally right before the redirect decision, so the dialog can react
  regardless of `successRedirect`.

**Known limitation (flagged for follow-up, not fixed here):** both leaf
components' templates also render `<app-payment-summary variant="inline">`,
which reads `scheduleBooking`/`scheduleFilter` — the *original* booking flow's
state, not the reschedule's fare. Embedded in the reschedule dialog this
renders a stale/zeroed summary (cosmetic only — it does not affect the amount
actually charged, which the backend resolves from the pending `Payment`
row). The dialog compensates with its own
`MY_BOOKINGS.RESCHEDULE.PAYMENT_REQUIRED_NOTE` line showing the real
`netAmount` from the estimate. A proper fix would give `PaymentSummaryComponent`
a reschedule-aware data source (an optional `@Input()` override), which is a
larger change than this ticket's minimal, source-verified reuse contract
authorized — tracked as follow-up debt, not blocking.

**Module-boundary corollary:** `payment.module.ts` has its own routed
children (`RouterModule.forChild([{path:'result',...}, {path:'',...}])`).
Importing it directly into `my-bookings.module.ts` (also lazily routed) would
fold those routes into `my-bookings`'s own router config and collide with its
`{path: ''}` route. The three leaf components (`payment-creditcard`,
`payment-qrcode`, `payment-summary`) were therefore **extracted** to
`shared/components/payment-methods/` behind a new, routeless
`PaymentMethodsModule`, which both `payment.module.ts` and
`my-bookings.module.ts` import. `PaymentMethodsModule` also registers the
`scheduleBooking`/`scheduleFilter` NgRx feature state these components read —
NgRx supports the same feature key being registered from more than one lazy
module (see `station.effect.spec.ts`'s cross-module-instance test for a
worked example of this pattern already in the codebase).

## Decision 3: resolve numeric stop IDs via the stops lookup + slug match

`newFromStopId`/`newToStopId` (required by the reschedule endpoints) are
numeric `Stop` IDs, but `GET /bookings/me`'s `BookingRespDto` only carries
`LookupResponse.code` (a slug) for each leg's `fromStop`/`toStop` — no numeric
ID. Rather than adding a new backend field (a cross-repo contract change), the
frontend loads `StationService.getAll()` (`GET /api/stops`, already existing,
returns `StationApi { id, slug }`) once per dialog session and builds a
`Record<slug, id>` (`stopsLookup`, cached in the `myBookings` NgRx state),
matching `booking.route.fromStop.code === station.slug`.

**Rationale:** `/api/stops` is a small, already-public endpoint; loading it
once per dialog open is cheap and avoids a backend contract change for a
purely client-side resolution need. This mirrors the "don't work around a
missing field silently" rule (`CLAUDE.md` §"Contract Requests") in spirit —
the field genuinely isn't missing, it's just not the shape this screen wants,
and the existing `/api/stops` endpoint already resolves it without needing
backend involvement.

## Considered alternatives

- **Add `fromStopId`/`toStopId` to `BookingRespDto`** — rejected: would be a
  cross-repo contract change for data already derivable client-side from an
  existing endpoint; not worth the coordination cost for this one screen.
- **`p-dialog` for the reschedule flow** — rejected (see Decision 1).
- **Navigate to `/payment` for the top-up step** — rejected (see Decision 2).
- **Fork `PaymentCreditcardComponent`/`PaymentQrcodeComponent` into
  reschedule-specific copies** — rejected: violates design-system §10 and
  would drift from the original components' Omise/idempotency-key logic
  (R0-adjacent payment code) over time.
