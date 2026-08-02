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
 * the DTOs below are the real, flat shapes. See `docs/handoff.md` for what
 * is still unverified (`DriverCashEntryRespDto`'s own field shape beyond
 * `fromUnmappedSalesPoint`, which the card names but the backend
 * reconciliation did not spell out further).
 */

/** One route stop's per-head rate, as carried on the schedule's driver-cash
 * day response — drives the "rate not configured" pre-emptive warning on
 * the per-head form BEFORE submit. There is no separate per-action response
 * type — all four driver-cash POSTs return the full, refreshed
 * `DriverCashDayRespDto`, so the "rate actually applied" is read back from
 * THAT response's `perHeadRates[]` entry for the submitted `stopId`. */
export interface DriverCashPerHeadRateLineDto {
  stopId: number;
  stopName: string;
  ratePerHead: string;
  configured: boolean;
}

/**
 * One itemized cash entry on a driver-cash day. The backend confirmed the
 * `entries: List<DriverCashEntryRespDto>` field NAME and TYPE on
 * `DriverCashDayRespDto`; the card independently names
 * `fromUnmappedSalesPoint` as a per-entry field. This shape is NOT
 * otherwise confirmed field-for-field against the real `DriverCashEntryRespDto`
 * class — flagged in `docs/handoff.md`.
 */
export interface DriverCashEntryRespDto {
  label: string;
  amount: string;
  fromUnmappedSalesPoint: boolean;
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
