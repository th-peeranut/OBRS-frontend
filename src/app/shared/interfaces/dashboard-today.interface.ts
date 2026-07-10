/**
 * `GET /api/private/admin/dashboard/today` response shape (OBRS-129).
 *
 * Mirrors the pattern established by `reports-summary.interface.ts` (OBRS-40):
 * money fields are DECIMAL STRINGS (e.g. "18425.00") — never do arithmetic on
 * them client-side, only format for display. `occupancyRatePct` is a JSON
 * NUMBER (1dp) both at the tile level and per departure row.
 */
export interface DashboardMoneyDto {
  net: string;
  paid: string;
  refunded: string;
  currency: string;
}

/**
 * Which calendar date each aggregate is bucketed by. Values are stable
 * server-driven strings (e.g. "booking_date" / "departure_date") — the UI
 * does NOT interpolate these directly; it maps them to static i18n captions
 * (ADMIN.DASHBOARD.BASIS.*) keyed by tile, not by this string's content.
 */
export interface DashboardBasisDto {
  volume: string;
  revenue: string;
  occupancy: string;
}

export interface DashboardTilesDto {
  departuresCount: number;
  occupancyRatePct: number;
  bookingCount: number;
  /**
   * Omitted entirely (not zeroed, not null) for a viewer without revenue
   * visibility — forward-compat for a future salesperson role. The UI
   * renders the Revenue tile off the PRESENCE of this field, never a
   * client-side role check — see dashboard-page.component.ts.
   */
  revenue?: DashboardMoneyDto;
}

export interface DashboardDepartureRowDto {
  scheduleId: number;
  routeLabel: string;
  departureTime: string;
  seatsSold: number;
  capacity: number;
  occupancyRatePct: number;
}

export interface DashboardTodayDto {
  date: string;
  timezone: string;
  basis: DashboardBasisDto;
  tiles: DashboardTilesDto;
  /** Already ordered by departureTime asc — trust server order, don't re-sort. */
  departures: DashboardDepartureRowDto[];
}
