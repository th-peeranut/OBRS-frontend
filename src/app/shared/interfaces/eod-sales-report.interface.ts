import { ReportsMoneyDto } from './reports-summary.interface';

/**
 * `GET /api/private/admin/reports/eod-salesperson?date` response shape (OBRS-97/OBRS-231).
 * See `../OBRS-backend/docs/api/reports.md` and ADR-0037.
 *
 * Money fields are DECIMAL STRINGS (e.g. "3200.00") — the same convention as
 * `ReportsMoneyDto` (OBRS-40's `/summary` revenue shape), which this file reuses for
 * `revenue` rather than duplicating a second `{net,paid,refunded,currency}` interface.
 * Never do arithmetic on them client-side, only format for display.
 */
export interface EodMethodBreakdownDto {
  amount: string;
  count: number;
}

/**
 * One salesperson's row. `salespersonId` is `null` for the single "Unassigned" row that
 * collects staff-sold bookings with no recorded actor (e.g. a kiosk self-service sale) —
 * `salespersonName` is then the server-provided literal `"Unassigned"`. A non-null
 * `salespersonId` with no resolvable profile gets `"Staff #<id>"` instead. Neither of these
 * is a translation key — both are raw server strings, rendered as-is (like a person's name
 * elsewhere in the admin UI).
 */
export interface EodSalespersonRowDto {
  salespersonId: number | null;
  salespersonName: string;
  /**
   * `salesPointStopLabel` is the Stop's raw `slug` (e.g. "bkk_hub"), NOT a translated
   * display name — this is an internal operational report. Both are `null` when the
   * salesperson's profile has no sales-point stop set.
   */
  salesPointStopId: number | null;
  salesPointStopLabel: string | null;
  bookingCount: number;
  ticketsSold: number;
  /**
   * Decimal strings, net of paid - refunded, derived server-side from `byMethod` (the
   * single source of truth). Invariant: `cashAmount + nonCashAmount == revenue.net`.
   */
  cashAmount: string;
  nonCashAmount: string;
  /** Keyed by `payment_method` lookup slug (e.g. "cash", "card", "bank_transfer"). */
  byMethod: Record<string, EodMethodBreakdownDto>;
  revenue: ReportsMoneyDto;
}

/**
 * Grand total across every `EodSalespersonRowDto` (including the "Unassigned" row, if
 * present) — the plain sum of every field, reconciling exactly with `salespersons[]`.
 */
export interface EodSalespersonTotalDto {
  bookingCount: number;
  ticketsSold: number;
  cashAmount: string;
  nonCashAmount: string;
  byMethod: Record<string, EodMethodBreakdownDto>;
  revenue: ReportsMoneyDto;
}

export interface EodSalesReportDto {
  date: string;
  timezone: string;
  /**
   * Never sparse but also never dense — unlike `/summary`'s per-day rows, there is no
   * zero-filled row per possible salesperson; only salespeople (and the "Unassigned"
   * bucket) with at least one staff-sold booking/payment that day appear. Empty array on
   * a day with no staff-sold activity (200 OK, not 404).
   */
  salespersons: EodSalespersonRowDto[];
  grandTotal: EodSalespersonTotalDto;
}
