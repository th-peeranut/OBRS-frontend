import { ReportsMoneyDto, ReportsRangeDto } from './reports-summary.interface';

/**
 * `GET /api/private/admin/reports/revenue-analytics?from&to` response shape (OBRS-151).
 *
 * The deep revenue view over the Lane-A reporting foundation. Money fields are DECIMAL STRINGS
 * (reused `ReportsMoneyDto`) — never do arithmetic on them; only format for display. Every
 * percentage is server-computed (`netBarPct`, `netChangePct`) precisely so the UI does not have
 * to. See docs/api/reports.md and the OBRS-151 contract request in docs/handoff.md.
 */
export interface RevenueTrendPointDto {
  date: string;
  net: string;
  paid: string;
  refunded: string;
  currency: string;
  /** 0–100: this day's net as a percentage of the max daily net in range (server-computed). */
  netBarPct: number;
}

export interface RevenuePreviousPeriodDto {
  range: ReportsRangeDto;
  totals: ReportsMoneyDto;
  /**
   * Signed period-over-period % change of net revenue (server-computed).
   * `null` when the previous window's net is zero (the change is undefined, not "0%").
   */
  netChangePct: number | null;
}

export interface RevenueAnalyticsDto {
  range: ReportsRangeDto;
  totals: ReportsMoneyDto;
  previousPeriod: RevenuePreviousPeriodDto;
  /** Dense, zero-filled — one entry per day in [from, to], inclusive. */
  dailyTrend: RevenueTrendPointDto[];
}
