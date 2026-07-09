/**
 * `GET /api/private/admin/reports/summary?from&to` response shape (OBRS-40).
 *
 * Money fields are DECIMAL STRINGS (e.g. "184250.00"), matching the pattern
 * already used for booking/payment amounts elsewhere in the admin API — never
 * do arithmetic on them client-side, only format for display.
 */
export interface ReportsMoneyDto {
  net: string;
  paid: string;
  refunded: string;
  currency: string;
}

export interface ReportsRangeDto {
  from: string;
  to: string;
  timezone: string;
}

/**
 * Which calendar date each aggregate is bucketed by. Values are stable
 * server-driven strings (e.g. "booking_date" / "departure_date") — the UI
 * does NOT interpolate these directly; it maps them to static i18n captions
 * (ADMIN.REPORTS.BASIS.*) keyed by column, not by this string's content.
 */
export interface ReportsBasisDto {
  volume: string;
  revenue: string;
  occupancy: string;
}

export interface ReportsTilesDto {
  bookingCount: number;
  ticketsSold: number;
  occupancyRatePct: number;
  /**
   * Omitted entirely (not zeroed, not null) for a viewer without revenue
   * visibility. The UI renders the Revenue tile/column off the PRESENCE of
   * this field, never a client-side role check — see reports-page.component.ts.
   */
  revenue?: ReportsMoneyDto;
}

export interface ReportsDailyRowDto {
  date: string;
  bookingCount: number;
  ticketsSold: number;
  occupancyRatePct: number;
  seatsSold: number;
  seatCapacity: number;
  revenue?: ReportsMoneyDto;
}

export interface ReportsSummaryDto {
  range: ReportsRangeDto;
  basis: ReportsBasisDto;
  tiles: ReportsTilesDto;
  /** Dense, zero-filled — one row per day in [from, to], inclusive. */
  daily: ReportsDailyRowDto[];
}
