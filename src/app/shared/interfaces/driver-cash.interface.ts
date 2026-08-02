/**
 * OBRS-960 — Driver Cash Ledger + Parcel Revenue Share. Shared across the
 * staff driver-cash panel (`StaffApiService`) and the owner-facing
 * settlements/system-settings surfaces (`AdminApiService`), per CLAUDE.md §8
 * ("interface shared across modules" -> `shared/interfaces/`).
 *
 * ⚠️ Endpoint paths for the per-round staff panel (surface 1) and the
 * owner settings tabs (surfaces 4/5/7/8) are pinned exactly to the card
 * brief. The owner's **daily-return close** list/detail/return endpoints
 * (surface 3, `/admin/settlements`) were NOT given an explicit path in the
 * brief — those three (`getDriverCashDays`, `getDriverCashDayDetail`,
 * `returnDriverCashDay`) are a best-effort naming under
 * `/api/private/owner/driver-cash/days...`, consistent with the sibling
 * per-head-rates path the brief DID pin
 * (`/api/private/owner/driver-cash/per-head-rates`). Flagged as a Contract
 * Request in `docs/handoff.md` — verify against the real backend route
 * before relying on this in a live smoke test.
 */

/** One route stop's per-head rate, as carried on the schedule's driver-cash
 * day response — drives the "rate not configured" pre-emptive warning on
 * the per-head form BEFORE submit (the POST response's own
 * `perHeadRateApplied`/`perHeadRateConfigured` remain the source of truth
 * afterwards, per the card). */
export interface DriverCashPerHeadRateLineDto {
  stopId: number;
  stopName: string;
  ratePerHead: string;
  configured: boolean;
}

/** Running totals for the schedule's driver-cash day, all money as decimal
 * STRINGS (never float-parsed beyond the shared `toCents()` convention). */
export interface DriverCashDaySummaryDto {
  advanceTotal: string;
  perHeadTotal: string;
  expenseTotal: string;
  netCash: string;
}

/** `GET /api/private/schedules/{scheduleId}/driver-cash/day` — component-
 * scoped `DriverCashDayStore`'s payload (mirrors `ParcelCargoAvailabilityStore`'s
 * `data:null` contract when nothing has been fetched yet). */
export interface DriverCashDayRespDto {
  scheduleId: number;
  routeLabel: string;
  departureDateTime: string;
  currency: string;
  summary: DriverCashDaySummaryDto;
  perHeadRates: DriverCashPerHeadRateLineDto[];
}

export interface DriverCashAdvanceReqDto {
  amount: string;
}

export interface DriverCashPerHeadReqDto {
  stopId: number;
  headCount: number;
}

/** POST .../driver-cash/per-head response — the day's totals PLUS the rate
 * actually applied to this submission (the post-submit source of truth the
 * card calls out, distinct from the pre-submit `perHeadRates[].configured`
 * hint on the day response). */
export interface DriverCashPerHeadRespDto extends DriverCashDayRespDto {
  perHeadRateApplied: string;
  perHeadRateConfigured: boolean;
}

export interface DriverCashExpenseReqDto {
  category: string;
  amount: string;
  note?: string;
}

// ── Owner: daily-return close (`/admin/settlements`, surface 3) ───────────

export type DriverCashDayStatus = 'PENDING' | 'RETURNED';

export interface DriverCashDayListItemDto {
  dayId: number;
  scheduleId: number;
  routeLabel: string;
  departureDateTime: string;
  netCash: string;
  currency: string;
  status: DriverCashDayStatus;
  /** True when ANY remit line on this day came from a stop not yet mapped
   * to a sales point — surfaces the same warning as the parcel-intake one
   * (card §3), driven by the day's own entries. */
  hasUnmappedSalesPointRemit: boolean;
}

export interface DriverCashDayPageDto {
  range: { from: string; to: string; timezone: string };
  items: DriverCashDayListItemDto[];
}

export interface DriverCashDayEntryDto {
  label: string;
  amount: string;
  fromUnmappedSalesPoint: boolean;
}

export interface DriverCashDayDetailDto {
  dayId: number;
  scheduleId: number;
  routeLabel: string;
  departureDateTime: string;
  currency: string;
  /** The amount the driver is expected to hand back — counted-cash's
   * "expected" role from `SettlementDetailModalComponent`, renamed per the
   * card ("copies the sign-off form verbatim ... with the new field names"). */
  expectedAmount: string;
  entries: DriverCashDayEntryDto[];
  hasUnmappedSalesPointRemit: boolean;
  status: DriverCashDayStatus;
}

export interface DriverCashDayReturnReqDto {
  returnedAmount: string;
  discrepancyReason?: string;
}

// ── Owner settings: driver-cash per-head rates (`/admin/settings`, surface 5) ──

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
