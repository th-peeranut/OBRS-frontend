import { ReportsRangeDto } from './reports-summary.interface';

/**
 * `GET /api/private/admin/reports/booking-trend?from&to` response shape (OBRS-152).
 * Counts are plain integers; every derived metric (`movingAvg7`, `barPct`, `sharePct`,
 * `changePct`) is server-computed so the UI does no arithmetic. See docs/api/reports.md.
 */
export interface BookingTrendPointDto {
  date: string;
  bookingCount: number;
  ticketsSold: number;
  /** Trailing 7-day inclusive average of bookingCount (server-computed). */
  movingAvg7: number;
  /** 0–100: this day's count as a percentage of the max daily count (server-computed). */
  barPct: number;
}

export interface BookingTrendDayOfWeekDto {
  /** ISO-8601: 1 = Monday … 7 = Sunday. */
  dow: number;
  bookingCount: number;
  sharePct: number;
}

export interface BookingTrendPreviousPeriodDto {
  range: ReportsRangeDto;
  totalBookings: number;
  /** Signed % change; null when the previous window had no bookings (undefined). */
  changePct: number | null;
}

export interface BookingTrendPeakDto {
  date: string;
  bookingCount: number;
}

export interface BookingTrendDto {
  range: ReportsRangeDto;
  /** Dense — one entry per day in [from, to], inclusive. */
  series: BookingTrendPointDto[];
  previousPeriod: BookingTrendPreviousPeriodDto;
  /** Dense — always all 7 ISO weekdays. */
  byDayOfWeek: BookingTrendDayOfWeekDto[];
  /** Null when the range has no bookings. */
  peak: BookingTrendPeakDto | null;
}
