# ADR-0037: Driver cash panel as a new component family + fail-safe parcel-share warnings

## Status
Accepted

## Context
OBRS-960 introduces a driver-facing "cash ledger" at the vehicle
(`/staff/boarding/:scheduleId`, gated to a salesperson viewer) and an
owner-facing daily-return close, plus two new parcel-revenue-share
warnings shown at the moment they matter (intake, not an end-of-day
summary).

Two decisions here are hard to reverse or easy to get wrong the second time,
so they are recorded rather than left implicit in the diff:

1. **A new, phone-first component family**, not a reuse/extension of an
   existing modal or form pattern.
2. **A store's `error$` outcome must fail SAFE** — the opposite of every
   other `AdminCollectionStore` consumer in this codebase, which treats an
   error as "keep showing the last good cache, don't alarm the user."

## Decision 1 — `app-driver-cash-panel` is a new component family

No existing staff surface fit the constraints this panel operates under:
used standing at the vehicle, at departure, on a phone, in a hurry, once per
round. Concretely this ruled out:

- **A modal.** Every existing action-form pattern in this codebase
  (`settlement-detail-modal`, `expense-form-modal`, the parcel dialogs) is a
  centered dialog over a backdrop — reasonable at a desk, wrong for a
  driver's thumb on a moving platform. No navigation either (`design-system.md`
  §6's "never gate on an awaited fetch" logic applies here too, just for a
  different reason — a route change here would lose the sticky context).
- **`p-selectButton`/PrimeNG for the accordion.** `FRONTEND-GOTCHAS.md`
  records `p-selectButton`'s unselected-segment dark-mode gap as a
  *confirmed, recurring* defect (OBRS-312, 3rd occurrence before this card).
  The three action buttons reuse the plain `.admin-btn` primitive instead —
  same reasoning `InspectionPageComponent`'s verdict toggle already settled.
- **A brand-new expand/collapse mechanism.** The OBRS-231
  `.admin-icon-btn` chevron-toggle idiom (design-system.md §12) is reused
  directly: each of the 3 action buttons IS the toggle (a chevron glyph
  inside a full-width `.admin-btn`, not a separate small icon button next to
  static content — the touch-target constraint here is stricter than a
  desktop table row).

So the panel is a genuinely new family: `DriverCashPanelComponent` (smart,
owns a **component-scoped** `DriverCashDayStore` — same reasoning
`ParcelCargoAvailabilityStore`/`BoardingListStore` already established, a
root singleton would leak one driver's cached day into the next boarding
round) driving 3 dumb inline-form components, one open at a time, no modal,
no navigation. The sticky context strip reuses the OBRS-312/ADR-0023
measured-topbar-height pattern verbatim (`.admin-topbar`'s live rendered
height, never a second hardcoded `top: 0`).

**Alternative considered and rejected:** extending
`SettlementDetailModalComponent` with a "cash advance" mode. Rejected
because the modal's entire interaction model (open → fill one form → close)
doesn't fit "open once, do 1-3 of 3 possible actions across a boarding
round, keep the running total visible the whole time."

## Decision 2 — `ParcelShareConfigStore` fails SAFE on error, not soft

Every other `AdminCollectionStore` subclass in this codebase treats
`error$` as "the background revalidate failed, keep showing the cached
value" (the base class's own doc comment: "the cached value stays visible
throughout"). That is the right default for a report or a list.

It is the WRONG default here: the parcel-share amount is snapshotted at
intake and freezes at whatever percentage was configured (or 0%) at that
moment. If a transient GET failure hid the "not configured" warning instead
of showing it, every parcel accepted during that outage silently freezes
at 0% — the exact failure mode the warning exists to prevent, and the one
this card is explicit about: "if that GET fails, fail safe to SHOWING the
warning... never silently hide it."

So `ParcelConsignPageComponent.shareNotConfigured` defaults to `true` (shown)
and is only ever cleared by a **successful** fetch that returns
`configured: true`; any `error$` emission — even over a previously-good
cached value — re-asserts `true`. This is a deliberate, narrow exception to
the SWR-cache-stays-visible convention, scoped to this one boolean; the
store's cached DATA (driver%/salesperson% for display elsewhere) still
follows the normal stale-while-revalidate contract.

## Consequences
- The next phone-first, at-the-vehicle data-entry surface should reuse the
  `app-driver-cash-panel` family (component-scoped store + accordion of
  `.admin-btn`-toggled inline forms + measured sticky strip) rather than
  reaching for a modal.
- The next "warning derived from a config GET that gates a money-freezing
  action" should default its local flag to the WORST case and only clear it
  on a proven-good fetch — copy `ParcelShareConfigStore`'s pattern rather
  than the default AdminCollectionStore error-hides-behind-cache one.
- `shared/lib/money-cents.ts` is now the ONE `toCents()`/`centsToDecimalString()`
  implementation — `SettlementDetailModalComponent` delegates to it
  (unchanged call sites), and every new money field in this card
  (advance/per-head/expense/return forms) uses it directly. The next
  money-parsing need should import from there, not re-derive the regex.
- The settlement sign-off form's shared CSS classes
  (`.settlement-detail-*`, `.settlement-field-*`, `.settlement-signoff-title`,
  `.settlement-reconcile`, `.settlement-nt-negative`) now live in
  `src/app/modules/admin/pages/settlements/_cash-signoff-form.scss`, `@use`d
  by both `settlement-detail-modal.component.scss` and
  `driver-cash-day-return-modal.component.scss` — the next "counted/returned
  cash sign-off" surface should `@use` this partial rather than
  hand-copying the class block a third time.

## Addendum (2026-08-02) — backend reconciliation

The two decisions above are unaffected, but every URL and DTO shape this
card guessed for the driver-cash surfaces was wrong once checked against
the real `DriverCashController` (`OBRS-backend` `ao/obrs-960-driver-cash`
`afb440d4`): segment order was inverted on all four staff endpoints, the
owner day endpoints were guessed under `/owner/` (they aren't), and
`DriverCashDayRespDto` is flat where this card's first pass invented a
nested `summary` object. See `docs/handoff.md`'s now-RESOLVED Contract
Request entry for the full list and the fix commit. No spec had asserted
the literal request URL for any of these calls — every driver-cash spec
mocked the service layer — which is why the wrong guesses compiled and
tested green. `staff-api.service.spec.ts` / `admin-api.service.spec.ts` now
carry `HttpTestingController` assertions for the real paths; the next
service method added to either file should get one too, not just a
component-level mock.

**Second pass, same day:** `DriverCashEntryRespDto` — confirmed field-for-field
only in the first pass's URL/DTO check — still had an invented `label: string`
field that does not exist on the wire (the real fields are `id, type, amount,
scheduleId, stopId, headCount, expenseCategory, expenseId, note,
fromUnmappedSalesPoint, createdAt`). Every entry row would have rendered the
literal string `"undefined"`, uncaught by TypeScript because the response was
typed by this repo's own interface, not the server's. The generalizable lesson:
"reconciled against source" is a claim about the fields actually checked, not
the whole DTO tree reachable from that check — a nested list-item type needs
its OWN field-by-field pass, not an assumption that the container type being
right means its children are too. Fixed by deriving the display label from
`type` (+ `expenseCategory` for `EXPENSE_PAID`, reusing
`ADMIN.EXPENSES.CATEGORIES.*`) instead of reading a field that was never
there — see `DriverCashDayReturnModalComponent.entryTypeLabel()` — and locked
with a spec whose fixture is built from the backend's field names rather than
this repo's own interface, so a future missing/renamed field renders as
detectably empty/`"undefined"` instead of silently typing away the bug.
