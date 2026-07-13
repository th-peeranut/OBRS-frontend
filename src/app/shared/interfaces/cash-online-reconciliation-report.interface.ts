/**
 * `GET /api/private/admin/reports/cash-online-reconciliation?from&to` response shape
 * (OBRS-99).
 *
 * Same reporting-query layer and DTO/partition-note style as `RefundVoidReportDto`
 * (OBRS-98) — three EXHAUSTIVE, mutually-exclusive buckets (cash / online / other,
 * split by `payment_method.slug`, "other" is the ELSE/default bucket) instead of
 * refund/void's three partitions. Money fields are DECIMAL STRINGS — never do
 * arithmetic on them client-side, only format for display.
 */
export interface CashOnlineBucketDto {
  count: number;
  collected: string;
  refunded: string;
  net: string;
}

export interface CashOnlineSummaryDto {
  cash: CashOnlineBucketDto;
  online: CashOnlineBucketDto;
  other: CashOnlineBucketDto;
  /** Sum of all three buckets' `collected` (server-reconciled full partition). */
  totalCollected: string;
  currency: string;
}

/**
 * One calendar day's row. Dense, zero-filled — one row per day in `[from, to]`,
 * inclusive (same convention as `RefundVoidDailyRowDto`).
 */
export interface CashOnlineDailyRowDto {
  date: string;
  cash: CashOnlineBucketDto;
  online: CashOnlineBucketDto;
  other: CashOnlineBucketDto;
}

export interface CashOnlineReconciliationReportDto {
  range: { from: string; to: string; timezone: string };
  summary: CashOnlineSummaryDto;
  daily: CashOnlineDailyRowDto[];
}
