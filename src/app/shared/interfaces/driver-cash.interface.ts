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
  driverId: number;
  driverName: string;
  /** `LocalDate` on the wire — `yyyy-MM-dd`. */
  businessDate: string;
  vehicleId: number;
  status: DriverCashDayStatus;
  entries: DriverCashEntryRespDto[];
  advanceTotal: string;
  perHeadTotal: string;
  expensePaidTotal: string;
  parcelRemitTotal: string;
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
  businessDate: string;
  vehicleId: number;
  vehiclePlate: string;
  status: DriverCashDayStatus;
  expectedReturnAmount: string;
  returnedAmount: string | null;
  discrepancy: string | null;
  hasUnmappedSalesPointRemit: boolean;
}

// ── Owner settings: driver-cash per-head rates (`/admin/settings`, surface 5) ──
// Endpoint paths unaffected by the backend reconciliation.

export interface DriverCashRateRowDto {
  id: number;
  stopId: number;
  stopSlug: string;
  effectiveFrom: string;
  ratePerHead: string;
}

export interface DriverCashRateReqDto {
  stopId: number;
  effectiveFrom: string;
  ratePerHead: string;
}

export const DRIVER_CASH_RATE_DUPLICATE_ERROR_CODE = 'PER_HEAD_RATE_DUPLICATE';
