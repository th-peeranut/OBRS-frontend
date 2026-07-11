# ADR-0016: EOD Sales Report — right-aligned money columns + expandable per-row detail

- **Status**: Accepted
- **Date**: 2026-07-11
- **Related**: OBRS-231 (FE), OBRS-97 (BE, `GET /api/private/admin/reports/eod-salesperson`),
  ADR-0037 (backend), `docs/design-system.md` §12

## Context

OBRS-231 adds an admin/owner-only End-of-day Sales Report by Salesperson page, built as a
near 1:1 mirror of `ReportsPageComponent` (OBRS-40): same `admin-page-filters` →
state-card/empty-note → `admin-card` + `admin-table` skeleton, same `AdminCollectionStore<T>`
SWR-cache pattern via a new `EodSalesReportStore`. Two aspects of the table have no existing
precedent in the admin UI and needed an explicit decision rather than ad hoc styling:

1. The table's purpose is cash-drawer reconciliation (Bookings / Tickets / Cash / Non-cash /
   Net per salesperson, plus a grand total) — a shape none of the existing admin tables have.
2. Each row has a `byMethod` breakdown (per payment-method amount + count) that is useful but
   would clutter the primary row if always visible.

## Decision

**1. Right-aligned money columns.** Added a scoped `.eod-report-money { text-align: right;
font-variant-numeric: tabular-nums; }` class, applied only to the Cash/Non-cash/Net columns
(not the Bookings/Tickets counts). Rejected copying Reports' own left-aligned Revenue column
verbatim — that convention is fine for a single money column read alongside text, but this
table's entire purpose is columns of numbers that need to scan and sum vertically, which
left-aligned text defeats. No new color or token; `docs/design-system.md` §12 logs this so the
next reconciliation-style table reuses the class instead of inventing a second convention.

**2. Expandable per-row detail, not a new control.** The `byMethod` breakdown expands from a
chevron button (`.admin-icon-btn` + `material-symbols-outlined` `expand_more`/`expand_less` —
the same chevron shape already used for pagination) into a sibling `<tr>` spanning every
column (`[attr.colspan]="6"`), styled with the existing `var(--admin-surface-soft)` surface
(already used for `admin-table thead` — reused, not a new role). Rejected a modal/detail-panel
(too heavy for a few chips of data) and a second navigation level (breaks the single-table
mental model of an EOD reconciliation view). Expand state:
- lives on the page component (`Set<number>`), not the store — the store's `AdminCollectionStore`
  cache is data, this is transient view state, and the page is destroyed/recreated on every
  navigation anyway (no `RouteReuseStrategy`), so it naturally starts empty on (re-)entry;
- uses a synthetic key (`-1`) for the single "Unassigned" row (`salespersonId: null`), since a
  `Set<number>` can't key on `null`;
- is explicitly cleared whenever the `salespersons` array's identity changes (a new fetch from
  a date change), so a stale expand/collapse state can never survive onto different rows.

**Grand-total emphasis intentionally does not use `--accent*`.** The admin shell's
`--accent*` resolves to orange (`theme-admin`) and already marks the table's `:hover`/selection
state — tinting the grand-total row with it would misread the static summary as interactive.
The grand-total row instead reuses `var(--admin-surface-soft)` (background) and
`var(--admin-outline)` (top border, both tokens already defined in light and dark), and the
grand-total Cash cell gets a dedicated `.eod-report-grand-cash` class (font-weight 800,
~1.15rem, `color: var(--admin-text)`) — heavier than the per-row `.admin-emphasis` (700 weight)
so it reads as *the* number, using only existing text tokens (no new hex/color role).

## Consequences

- Two new scoped classes (`.eod-report-money`, `.eod-report-detail-row` /
  `.eod-report-method-list` / `.eod-report-grand-cash`) live in
  `eod-sales-report-page.component.scss`, composed entirely from existing `--admin-*` tokens —
  no raw hex, themes correctly in light/dark for free.
- The next table needing right-aligned money or per-row drill-down reuses these patterns
  (logged in `docs/design-system.md` §12) rather than re-deriving them.
- Row-expand state resetting on array-identity change is a convention worth remembering for
  any future expandable-row table: it's cheap correctness, not a performance optimization.
