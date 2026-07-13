/**
 * `GET /api/private/admin/reports/refund-void?from&to` response shape (OBRS-98).
 *
 * Money fields are DECIMAL STRINGS (e.g. "3200.00"), matching the convention already
 * used by `ReportsMoneyDto` (OBRS-40) and `EodMethodBreakdownDto` (OBRS-97/OBRS-231) —
 * never do arithmetic on them client-side, only format for display.
 */
export interface RefundVoidAmountDto {
  count: number;
  amount: string;
}

/**
 * `voided` extends the plain count/amount shape with its `cancelled`/`expired`
 * sub-partition — `cancelled.amount + expired.amount == amount` (server-reconciled).
 */
export interface RefundVoidVoidedDto extends RefundVoidAmountDto {
  cancelled: RefundVoidAmountDto;
  expired: RefundVoidAmountDto;
}

export interface RefundVoidSummaryDto {
  refunded: RefundVoidAmountDto;
  manualRefundPending: RefundVoidAmountDto;
  voided: RefundVoidVoidedDto;
  currency: string;
}

/**
 * One calendar day's row. Dense, zero-filled — one row per day in `[from, to]`,
 * inclusive (same convention as `ReportsDailyRowDto`), unlike the EOD report's
 * salespersons array which is sparse.
 */
export interface RefundVoidDailyRowDto {
  date: string;
  refunded: RefundVoidAmountDto;
  manualRefundPending: RefundVoidAmountDto;
  voided: RefundVoidVoidedDto;
}

export interface RefundVoidReportDto {
  range: { from: string; to: string; timezone: string };
  summary: RefundVoidSummaryDto;
  daily: RefundVoidDailyRowDto[];
}
