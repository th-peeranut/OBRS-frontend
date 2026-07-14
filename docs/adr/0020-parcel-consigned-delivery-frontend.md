# ADR 0020 — Parcel consigned intake + delivery handoff + public tracking (OBRS-305 Card 2), frontend decisions

**Date:** 2026-07-14
**Status:** Accepted
**Branch:** `ao/obrs-305-parcel-consigned-delivery`

## Context

OBRS-305 Card 2 MVP adds four frontend surfaces: a staff consigned-intake
form, a printable waybill, a driver/salesperson delivery-handoff flow
(load → arrived → collect), and a public parcel-tracking page. Built against
the locked API contract in
`../OBRS-backend/docs/api/parcels-consigned-delivery.md`. This ADR records
three decisions that are surprising or hard to reverse; the rest of the
implementation follows existing conventions directly (see
`docs/design-system.md` §12 "new pattern log" entries for the shorter,
in-context notes).

## Decision 1: the public tracking page's status chip re-declares `.admin-status` token VALUES in its own scope, rather than forking a second chip look

The 7 renderable `parcel_delivery_status` slugs map onto the existing
`.admin-status.is-*` classes (design-system.md §2.4.1) — the same markup used
by the staff delivery-list. But `ParcelTrackingPageComponent` is a
customer-shell page with no `.admin-shell` ancestor, and the CSS custom
properties those classes read (`--admin-success-bg`, etc.) are only ever
*defined* inside `.admin-shell` (`admin-theme.scss`). Reusing the classes
verbatim on this page would render an unstyled (transparent) chip.

Two alternatives considered and rejected:
- **Wrap the page (or the chip) in `.admin-shell`.** Rejected: `.admin-shell`
  carries unrelated layout rules (`display: flex; min-height: 100vh; …`) that
  would fight the customer page's own layout, and pulls in every other
  `.admin-shell`-scoped rule as an unintended side effect.
- **Fork a second `.parcel-tracking-status` chip class with its own hex
  values.** Rejected outright by design-system.md §2.2 ("MUST NOT introduce a
  new raw hex") — and it would also mean two independently-maintained color
  legends for the same 7 semantic states.

Chosen: the component's `:host` re-declares the exact same custom-property
*values* already bound to these roles in `admin-theme.scss`, scoped to the
component instead of `.admin-shell`, with the dark-mode overrides gated on
this app's actual public dark-mode class (`body.is-dark`, `dark-theme.scss`)
via `:host-context()`, mirroring `admin-theme.scss`'s own
`.admin-shell.is-dark` overrides for the same tokens. The `.admin-status.is-*`
markup itself is untouched and reused byte-identical. This is the smallest
change that keeps exactly one status-color legend for
`parcel_delivery_status` across both the staff and public surfaces.

## Decision 2: the collect dialog ships a code-only input for MVP; the existing camera QR scanner (`BoardingListComponent`, ADR 0017) is not reused

The locked UX spec allows either reusing the existing boarding-scan camera or
a code-only text input "if no shared scanner component exists." One does
exist — `BoardingListComponent`'s `@zxing/browser`-based camera mode — but per
its own ADR (`0017-boarding-list-camera-qr-scanner.md`), it was built "purely
additive to `BoardingListComponent`, not a new component": the device
enumeration, dynamic-import lazy-loading, and `cameraStatus` state machine all
live inline on that one component, not as an extractable shared unit.
Extracting it into a reusable component/service is a real refactor (new
public API, new lazy-chunk boundary, re-verifying the OBRS-266 bundle-size
fix still holds) — out of scope for this card, whose own spec explicitly
permits the simpler path.

`ParcelCollectDialogComponent` therefore ships a single `collectionCode` text
input (the driver/salesperson types in the code the recipient provides,
matching how `POST /parcels/{id}/collect` already accepts a bare
`collectionCode` with no token). A follow-up card can extract
`BoardingListComponent`'s scanner into a shared component and wire it into
this dialog as a second input mode without changing the dialog's
`(confirm)`/`(dismiss)` output contract.

## Decision 3: `getConsignedParcelsForSchedule()` (the delivery-list source) targets an ASSUMED endpoint, not yet in the written contract

`../OBRS-backend/docs/api/parcels-consigned-delivery.md` documents per-parcel
action endpoints (`/load`, `/arrived`, `/collect`, `/waybill`) but no
"list consigned parcels for a schedule" GET — needed to populate
`/staff/parcels/deliveries/:scheduleId`. Assumed
`GET /api/private/schedules/{scheduleId}/parcels/consigned` →
`ParcelDeliveryListItemDto[]`, following this codebase's established
parallel-lane pattern for building against a locked UX spec ahead of the
paired backend endpoint landing (see `docs/handoff.md`'s OBRS-96/OBRS-129/
OBRS-130 precedents) rather than blocking. Flagged in `docs/handoff.md`
Contract Requests; do not merge/deploy until the backend confirms this shape
(or a corrected one).

## Consequences

- One status-color legend for `parcel_delivery_status`, reused (not forked)
  across the staff delivery-list and the public tracking page.
- The collect dialog is intentionally MVP-scoped (code-only); a follow-up
  card is the natural place to add camera-scan support once the scanner is
  extracted from `BoardingListComponent`.
- The delivery-list page is functionally inert against the current backend
  until `GET /api/private/schedules/{scheduleId}/parcels/consigned` (or a
  corrected shape) lands — tracked in `docs/handoff.md`.
