# The e-ticket page finds the data; `<app-e-ticket-card>` is the ticket's only markup (OBRS-1510)

## Context

Two components drew the same `.ticket-paper` surface for the same booking:
`modules/e-ticket/e-ticket.component` (the booking-flow page a guest lands on
after checkout) and `shared/components/e-ticket-card` (used by the my-bookings
"My booking" modal). They started life as one copy-pasted into the other
(OBRS-254) and, being two copies of the same visual contract, drifted three
times in ways that shipped a real defect each time:

- **OBRS-1219** — the route line's fallback ladder (route name → province pair
  → stop pair) was fixed on `mapBookingTicketsToCard`, the modal's own mapper.
  The page built its own route line by hand and needed a *second*,
  independently-written fix (`refreshRouteLine`) to catch up.
- **OBRS-1502** — the arrival-date cell (a trip that lands on a later Bangkok
  day) was added to the page's own template and `TicketLegView` type. The card
  had no such field at all until this ticket.
- **OBRS-260** — the round-trip leg split (one booking-level `outbound/return`
  scalar → one `TicketLeg` per leg) had to be implemented once for the page's
  own `TicketLegView[]` and once for the card's `TicketLeg[]`, by hand, in the
  same sitting, because nothing enforced they describe the booking the same
  way.

Each fix landed on one surface and had to be separately re-derived (never
copied) for the other, because the two components did not share a type, a
mapper, or a markup source — only a visual resemblance and, increasingly, a
set of comments cross-referencing "the shared card" as a future TODO.

## Decision

Collapse to **one owner of markup**: `<app-e-ticket-card>`. The page keeps
exactly the job neither component can delegate — **finding the data** for its
two render passes (the booking-flow store, then an authenticated overlay from
the tickets API) — and hands the result to the card as `TicketLeg[]` (the
type the card already defined and the modal's mapper already produced).
`ETicketComponent.legs` is now literally `shared/interfaces/e-ticket.interface.ts`'s
`TicketLeg[]`, not a page-local lookalike type.

Concretely:

- `TicketLeg` gains `arrivalDate: string` and `TicketPassenger` gains
  `seatOpen: boolean` — both **members of an existing `@Input()`** (`legs`),
  not new inputs on the card. This is what makes the card's own boarding-QR
  and per-passenger rendering apply to whichever page mounts it, guest or
  modal, with no branch in the card for "which page am I in."
- The page's `.ticket-paper` markup, its `downloadTicketImage()`/html2canvas
  wiring, and its own `BoardingQrService` usage are deleted outright — not
  duplicated-then-deprecated. `<app-e-ticket-card>` already owned a correct,
  tested copy of all three (OBRS-96/221/866).
- The **TICKET_NO row is gated inside the card's own template**
  (`@if (ticketNumber !== '-')`), not behind a new `@Input()` flag. A flag
  would have been a second lever controlling the same surface — exactly the
  kind of extra degree of freedom that let the page and the card disagree
  before. Guest still sees no row (its default is `'-'`, unchanged); a
  signed-in customer on `/e-ticket` now sees one, which is new and intended —
  the modal already showed it for every logged-in customer, so this closes
  the last visible gap between the two surfaces instead of opening one.
- The store-only pre-API pass (the only render a **guest** ever gets —
  `loadTicketFromApi` returns early without a token, OBRS-858) has no
  leg-dimension for its passenger data; it is placed on `legs[0]` only
  (`buildLegsFromSchedules`), matching the pre-existing `passengerGroups`
  behavior byte-for-byte (a single unlabelled list, never a false
  outbound/return split invented from data that does not carry one).
- The distance chip (`TicketLeg.distanceKm`) stays `null` always on this page
  (`legFromJourney` sets it explicitly) — the chip has never appeared on
  `/e-ticket`, only in the modal (whose mapper derives a real value from
  `RouteStop.distanceKmFromOrigin`), and consolidating markup is not license
  to add a new visible element to a screen that never asked for one.

## Consequences

- **A fix now has exactly one place to land.** The next arrival-date-shaped or
  round-trip-shaped defect gets fixed once, in the card or its shared mapper,
  and both surfaces pick it up — there is no second copy left to forget.
- **The page's own spec had zero DOM assertions before this change** (1,104
  lines / 54 `it()`, all against the component class via `new
  ETicketComponent(...)`, never `TestBed`) — meaning the OLD suite could have
  stayed fully green through this exact refactor even if the template had
  been left broken. `e-ticket.component.spec.ts` now carries a
  `TestBed`-compiled template describe block asserting the card actually
  renders and is wired correctly, and the retained markup
  (station-load-error slot, ticket-incomplete banner, retrieval note) still
  does. The per-cell rendering rules the card owns (TICKET_NO gate,
  arrival-date cell, per-passenger SEAT cell) are pinned once, on
  `e-ticket-card.component.spec.ts`, where that logic actually lives, rather
  than duplicated behind a `NO_ERRORS_SCHEMA` stub that would only prove the
  stub echoes its inputs back.
- **The modal gains two fields it never had**: the arrival-date cell (AC-2)
  and a per-passenger SEAT cell (AC-8). Both are the direct, intended result
  of one card now serving both surfaces — noted here so a future reviewer
  reads them as this ADR's consequence, not as scope creep on a "just move
  the markup" ticket.
- **The e-ticket card stays outside dark theming** (`dark-theme.scss` §15,
  "left white on purpose") — the two new cells use the same static tokens
  (`$text-lightblack`/`$text-softblack`) as every other cell on this surface,
  not a `--accent*` custom property, so they do not reintroduce the exemption
  the rest of the card already respects.
- **The page module now imports `ETicketCardModule` directly.** `SharedModule`
  deliberately excludes it (its `html2canvas`/`qrcode` dependencies stay out
  of the eager bundle) — this page joins `my-bookings.module.ts` as its second
  consumer.

## Considered alternatives

- **Keep two components, sync fields by convention/comment** — rejected: this
  is the status quo that produced three drifts. A comment is not a compiler
  error; nothing stopped a fourth.
- **New `@Input()` flags on the card per page-specific difference** (e.g. a
  `hideTicketNumber` flag instead of the `ticketNumber !== '-'` gate) —
  rejected: a flag is a second surface for the SAME behavior to be set
  wrong on, which is exactly the shape of bug this consolidation exists to
  retire. Deriving the gate from data already flowing through the `@Input()`
  the card already has keeps the card's contract the same size.
- **Move the card's markup INTO the page instead** (page owns markup, card
  becomes the page's private partial) — rejected: the modal is the card's
  only other consumer and has no page of its own to inline into; the card
  would still need to exist as a separate component, and the page would gain
  back the QR-fetch/html2canvas wiring this ticket removes.
