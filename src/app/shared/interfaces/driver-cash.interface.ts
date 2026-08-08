/**
 * OBRS-960 — Driver Cash Ledger + Parcel Revenue Share. Shared across the
 * staff driver-cash panel (`StaffApiService`) and the owner-facing
 * settlements/system-settings surfaces (`AdminApiService`), per CLAUDE.md §8
 * ("interface shared across modules" -> `shared/interfaces/`).
 *
 * ⚠️ CORRECTED against the real backend (OBRS-backend `ao/obrs-960-driver-cash`
 * `afb440d4`, `DriverCashController.java` + its DTOs) — the FIRST version of
 * this file guessed a URL segment order and a nested `summary` sub-object
 * that don't exist. Every URL below is now pinned to the real controller;
 * the DTOs below — INCLUDING `DriverCashEntryRespDto`, confirmed
 * field-for-field on a second reconciliation pass after the first pass's
 * `{label, amount, fromUnmappedSalesPoint}` guess turned out to have no
 * `label` field at all (would have rendered `undefined` in every entry
 * row) — are the real, complete shapes. Nothing in this file remains
 * unverified against source.
 */

/** One route stop's per-head rate, as carried on the schedule's driver-cash
 * day response — drives the "rate not configured" pre-emptive warning on
 * the per-head form BEFORE submit. There is no separate per-action response
 * type — all four driver-cash POSTs return the full, refreshed
 * `DriverCashDayRespDto`, so the "rate actually applied" is read back from
 * THAT response's `perHeadRates[]` entry for the submitted `stopId`.
 * Confirmed field-for-field against the backend's `PerHeadRateStatusDto`. */
export interface DriverCashPerHeadRateLineDto {
  stopId: number;
  stopName: string;
  /**
   * OBRS-1073 — the counter this stop belongs to, or `null` when it belongs
   * to none. Read this BEFORE reacting to `configured: false`: only 10 of the
   * 101 seeded stops sit at a counter, so `configured === false` on its own
   * would raise "rate not set" on almost every stop of every route. A null
   * `salesPointId` means "no counter here, 0 is the right answer"; a non-null
   * one with `configured: false` is the real warning.
   */
  salesPointId: number | null;
  salesPointName: string | null;
  ratePerHead: string;
  configured: boolean;
}

/**
 * The four values of the backend's `ck_driver_cash_entries_type` CHECK
 * constraint. `PARCEL_SHARE` was deliberately removed from that constraint
 * and will never appear on the wire — do not add a branch for it.
 */
export type DriverCashEntryType = 'ADVANCE' | 'PER_HEAD' | 'EXPENSE_PAID' | 'RETURN';

/**
 * One itemized cash entry on a driver-cash day. Confirmed field-for-field
 * against the real backend `DriverCashEntryRespDto` class — the FIRST
 * version of this interface invented a `label: string` field that does not
 * exist on the wire (every entry row would have rendered the string
 * `"undefined"`, uncaught by TypeScript because the response was typed by
 * this file's own — wrong — interface, not the server's). There is no
 * display label on the wire at all: the frontend derives one from `type`
 * (+ `expenseCategory` for `EXPENSE_PAID`) via i18n — see
 * `DriverCashDayReturnModalComponent.entryTypeLabel()`.
 */
export interface DriverCashEntryRespDto {
  id: number;
  type: DriverCashEntryType;
  amount: string;
  scheduleId: number | null;
  stopId: number | null;
  headCount: number | null;
  expenseCategory: string | null;
  expenseId: number | null;
  note: string | null;
  fromUnmappedSalesPoint: boolean;
  createdAt: string;
}

export type DriverCashDayStatus = 'OPEN' | 'RETURNED';

/**
 * `GET /api/private/driver-cash/schedules/{scheduleId}/day`,
 * `GET /api/private/driver-cash/days/{dayId}`, AND the response of all four
 * driver-cash POSTs (`advance`, `per-head`, `expense-paid`, `return`) — ONE
 * flat DTO, confirmed field-for-field against the backend's
 * `DriverCashDayRespDto`. There is NO nested `summary` object (the first
 * version of this file invented one) and NO separate per-action response
 * type (the first version invented `DriverCashPerHeadRespDto` with an extra
 * `perHeadRateApplied`/`perHeadRateConfigured` pair that does not exist).
 */
export interface DriverCashDayRespDto {
  dayId: number;
  /**
   * OBRS-1073 — the CASH HOLDER, who may be a salesperson. The `driver*`
   * names are a knowingly accepted misnomer (the rename is OBRS-1080); read
   * `holderRole` before labelling this person a driver in the UI.
   */
  driverId: number;
  driverName: string;
  holderRole: DriverCashHolderRole;
  /** `LocalDate` on the wire — `yyyy-MM-dd`. */
  businessDate: string;
  vehicleId: number;
  status: DriverCashDayStatus;
  entries: DriverCashEntryRespDto[];
  advanceTotal: string;
  /**
   * The per-head fee this holder EARNED that day, as a positive magnitude.
   *
   * ⛔ OBRS-1145 — it is NOT inside `expectedReturnAmount` and must not be
   * rendered with a minus sign. The owner nets ค่าหัว at the counter: the
   * round's settlement expects `ticket cash − ค่าหัว` and the seller keeps the
   * fee, so deducting it here as well would credit the same fee twice. Show it
   * as a record of earnings, never as a term of what is still owed.
   */
  perHeadTotal: string;
  expensePaidTotal: string;
  parcelRemitTotal: string;
  /**
   * OBRS-992 — shares this driver owes back on parcels that were cancelled
   * and refunded. Already INSIDE `expectedReturnAmount`, so it must never be
   * added to it again: it is shown (OBRS-1053) only so the amount being
   * collected today can explain why it is higher than the day's own takings.
   */
  parcelClawbackTotal: string;
  expectedReturnAmount: string;
  returnedAmount: string | null;
  returnedAt: string | null;
  returnedByUserId: number | null;
  returnedByName: string | null;
  discrepancy: string | null;
  discrepancyReason: string | null;
  perHeadRates: DriverCashPerHeadRateLineDto[];
  hasUnmappedSalesPointRemit: boolean;
}

export interface DriverCashAdvanceReqDto {
  amount: string;
}

/**
 * The request still names the STOP — that is what the person at the counter
 * can see. OBRS-1073 resolves its sales point server-side, so this shape did
 * not change even though the rate is no longer keyed by stop.
 */
export interface DriverCashPerHeadReqDto {
  stopId: number;
  headCount: number;
}

export interface DriverCashExpenseReqDto {
  category: string;
  amount: string;
  note?: string;
}

export interface DriverCashDayReturnReqDto {
  returnedAmount: string;
  discrepancyReason?: string;
}

/**
 * `GET /api/private/driver-cash/days?from=&to=&status=` — OBRS-960's ONE
 * genuine contract gap (the SA never specified a list endpoint; the first
 * version of this file guessed a path/shape and both were wrong). Confirmed
 * against the backend's `DriverCashDaySummaryRespDto`: a LIST ROW, distinct
 * from the full `DriverCashDayRespDto` above — no `entries`, no
 * `perHeadRates`, and money is only the three totals a list needs. The
 * response is a **flat array**, not a `{range, items}` page wrapper (the
 * first version of this file invented that wrapper too).
 */
export interface DriverCashDaySummaryRespDto {
  dayId: number;
  driverId: number;
  driverName: string;
  holderRole: DriverCashHolderRole;
  businessDate: string;
  vehicleId: number;
  vehiclePlate: string;
  status: DriverCashDayStatus;
  expectedReturnAmount: string;
  returnedAmount: string | null;
  discrepancy: string | null;
  hasUnmappedSalesPointRemit: boolean;
  /**
   * OBRS-1073 — a SALESPERSON row still OPEN on a business date that has
   * already passed. The owner's rule is that a salesperson never holds cash
   * overnight, so this is a broken rule, not a slow day. Never true for a
   * DRIVER row: his sign-off is the NEXT morning by design.
   */
  overdueOpen: boolean;
}

// ── Owner settings: driver-cash per-head rates (`/admin/settings`, surface 5) ──
// Endpoint paths unaffected by the backend reconciliation.

/**
 * OBRS-1073 — a rate belongs to a SALES POINT (the counter), not to a bus
 * stop. บ้านบึง alone covers 7 stops, so the old per-stop key meant 10
 * hand-keyed rows that all had to agree; this is 3.
 */
export interface DriverCashRateRowDto {
  id: number;
  salesPointId: number;
  salesPointCode: string;
  salesPointName: string;
  effectiveFrom: string;
  ratePerHead: string;
}

export interface DriverCashRateReqDto {
  salesPointId: number;
  effectiveFrom: string;
  ratePerHead: string;
}

/** OBRS-1073 — `GET /api/private/owner/driver-cash/sales-points`, the picker source. */
export interface SalesPointOptionDto {
  id: number;
  code: string;
  name: string;
}

/** OBRS-1073 — whose cash box a `driver_cash_days` row is. */
export type DriverCashHolderRole = 'DRIVER' | 'SALESPERSON';

export const DRIVER_CASH_RATE_DUPLICATE_ERROR_CODE = 'PER_HEAD_RATE_DUPLICATE';
