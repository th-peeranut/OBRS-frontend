# OBRS-96 e-ticket: one QR per ticket (not per booking), and the boarding-scan error contract

## Context

Before OBRS-96, `ETicketComponent` rendered **one QR code per booking**: all
ticket numbers in the booking were comma-joined
(`collectTicketNumbers()`/`buildTicketNumber()`) into a single string, encoded
as a single QR in a footer block (`updateQrCode(this.ticketNumber)`). A
booking with 4 passengers produced one QR that encoded 4 ticket numbers at
once — there was no way for a boarding-scan to validate or board an
*individual* passenger, and a cancelled/refunded/rescheduled-away leg inside
an otherwise-active booking had no way to be excluded from that shared code.

OBRS-96 adds real per-ticket boarding validation
(`POST /api/private/tickets/boarding-scan`, see
`docs/adr` sibling files and `docs/handoff.md`), which requires the QR to
carry a **signed, single-ticket token** (`boardingToken`, from
`GET /api/private/tickets/{id}/boarding-token`), not a human-readable ticket
number. This forces the one-QR-per-booking model to become one-QR-per-ticket.

## Decision 1: one QR per ticket, fetched via N independent GETs, not a batch endpoint

Each ticket gets its own `boardingToken` fetched individually
(`TicketService.getBoardingToken(ticketId)`), rather than requesting a
"booking's tickets + tokens" batch shape. This mirrors the existing contract
split in this codebase: `BookingService` owns booking-scoped operations
(reschedule, change-seat, change-stop, `getBookingTickets` for the
already-existing ticket *listing*), while a new `TicketService` owns
single-ticket, customer-authenticated operations. Introducing a batch
"tokens for booking X" endpoint would require a backend contract addition
outside what OBRS-96 specifies; N independent GETs (issued via `forkJoin`,
see Decision 2) reuse the already-defined per-ticket endpoint and keep the
service boundary consistent with the rest of the codebase (`docs/handoff.md`
tracks the parallel backend implementation on `ao/obrs-96-eticket-qr`).

## Decision 2: `forkJoin` + a **per-inner** `catchError`, not a single `catchError` on the joined stream

A booking can be in a **mixed state**: e.g. 3 confirmed tickets and 1
cancelled/refunded/rescheduled-away ticket in the same booking. The
cancelled ticket's `boarding-token` GET returns `409 TICKET_NOT_CONFIRMED` —
that failure must not blank the other 3 tickets' QR codes.

`forkJoin` normally rejects (and never emits) the instant *any* inner
observable errors. The fix is to put `catchError` **inside** each inner
pipe, not around the outer `forkJoin`:

```ts
forkJoin(
  pendingTicketIds.map((ticketId) =>
    this.ticketService.getBoardingToken(ticketId).pipe(
      map((response) => ({ ticketId, boardingToken: response?.data?.boardingToken ?? '' })),
      catchError(() => of({ ticketId, boardingToken: '' }))
    )
  )
)
```

Every inner observable is guaranteed to emit (either a real token or the
empty-token sentinel), so `forkJoin` always completes with one result per
ticket. `applyBoardingTokenResults` then renders a placeholder
(`qrUnavailable: true`, `E_TICKET.QR_UNAVAILABLE`) for any ticket whose
sentinel came back empty — regardless of *why* it failed (409, 404, or a
transient network error) — because the page's job is "don't blank", not "show
a different message per failure reason" on this surface (contrast with the
boarding-scan surface, Decision 4, where the failure reason **is** the point).

## Decision 3: QR state keyed by `ticketId` outside the `passengers` array, not embedded and rebuilt each time

`ETicketComponent.mapTicketFields`/`applyApiOverrides` re-run on **every**
`combineLatest` emission, including a bare language switch
(`translateService.onLangChange`) — that already existed before OBRS-96.
`buildPassengersFromApi` therefore constructs a **fresh** `TicketPassenger[]`
on every locale change. If the resolved QR data lived only on those
transient objects, a locale switch would silently wipe already-fetched QR
images and either blank them or (worse) re-trigger a duplicate
`boarding-token` GET per ticket on every language toggle.

The fix: `qrStateByTicketId: Map<number, {qrDataUrl, qrUnavailable}>` and
`fetchedTicketIds: Set<number>` are both **component-level, keyed by
`ticketId`**, independent of the `passengers` array's lifetime.
`buildPassengersFromApi` reads the current QR state from the map when
constructing each row (falling back to the not-yet-fetched empty state), and
`fetchBoardingTokensForPassengers` only issues a GET for a `ticketId` not
already in `fetchedTicketIds` — so a locale switch reflows labels/names
without re-fetching or losing already-resolved QR codes.

## Decision 4: the boarding-scan error contract branches on 7 distinct `errorCode`s, not a generic pass/fail

`POST /api/private/tickets/boarding-scan` (staff-side manual validation) can
fail for materially different reasons that call for different staff-facing
guidance — a forged/tampered token is not the same problem as a valid ticket
scanned at the wrong schedule, which is not the same problem as a ticket
that was already boarded five minutes ago. `boarding-scan-error.ts` mirrors
the existing `reschedule-error.ts`/`change-seat-error.ts` pattern: map each
of the 7 documented codes (`INVALID_TICKET_TOKEN`, `EXPIRED_TICKET_TOKEN`,
`WRONG_SCHEDULE_TICKET`, `BOARDING_WINDOW_NOT_OPEN`, `TICKET_NOT_CONFIRMED`,
`ALREADY_BOARDED`, `TICKET_ERROR_ID_NOT_FOUND`) plus `GENERIC` to its own
i18n key, severity (`danger`/`warning`), and Material Symbol icon — never
branching on `error.message` (design-system §9). Severity is `warning` for
timing/already-settled states (`EXPIRED_TICKET_TOKEN`, `WRONG_SCHEDULE_TICKET`,
`BOARDING_WINDOW_NOT_OPEN`, `ALREADY_BOARDED`) and `danger` for a hard-invalid
token, a non-boardable ticket, an unknown id, or the generic fallback — and
every severity also carries a distinct icon, so the result banner is never
color-only (design-system §11).

`TICKET_ERROR_ID_NOT_FOUND` is kept exactly as specified (not tidied to
`TICKET_NOT_FOUND`) since it must match the backend's stable code verbatim.

## Decision 5: `SKIP_AUTH_LOGOUT` is asymmetric between the two surfaces

- The customer-side `GET /tickets/{id}/boarding-token` (e-ticket page)
  deliberately does **not** set `SKIP_AUTH_LOGOUT` — a 401 here is the
  customer's own expired session and should force-logout like any other
  authenticated customer call.
- The staff-side `POST /tickets/boarding-scan` **does** set
  `SKIP_AUTH_LOGOUT`, mirroring `booking.service.ts`/`promotion.service.ts` —
  defense-in-depth against the OBRS-187 force-logout bug, even though the
  backend guarantees a domain `400`/`409` (never a bare `401`) for every
  rejected scan. A staff operator mid-boarding-queue should never get bounced
  to `/login` by a scan-box interaction.

## Considered alternatives

- **A single booking-level "tokens" endpoint** (`GET
  /bookings/{id}/boarding-tokens` returning all tickets' tokens in one call)
  — rejected: not part of the OBRS-96 contract as specified, and the existing
  per-ticket `getBookingTickets` already gives the customer-facing page the
  ticket list; adding N small GETs (isolated via `forkJoin`) reuses the
  already-defined single-ticket endpoint instead of requesting a second,
  overlapping batch shape.
- **One `catchError` around the whole `forkJoin`** — rejected per Decision 2:
  it would make one ticket's 409 blank every other ticket's QR, which is
  exactly the regression this feature must avoid on a mixed-status booking.
- **Storing QR state inline on each `TicketPassenger` row** — rejected per
  Decision 3: the array is rebuilt on every locale switch, so state living
  only there gets silently lost or re-fetched needlessly.
- **A single generic "scan failed" message** for the boarding-scan box —
  rejected per Decision 4: `WRONG_SCHEDULE_TICKET` and `ALREADY_BOARDED` call
  for materially different staff action than `INVALID_TICKET_TOKEN`, so
  collapsing them into one message would make the box less useful than the
  existing check-in button's behavior it sits next to.
