import { ReportsRangeDto } from './reports-summary.interface';

/**
 * `GET /api/private/admin/reports/route-performance?from&to` response shape (OBRS-153).
 * `netRevenue` is a decimal string; `revenueSharePct` is server-computed. See docs/api/reports.md.
 */
export interface RoutePerformanceRowDto {
  routeId: number;
  routeSlug: string;
  departures: number;
  ticketsSold: number;
  netRevenue: string;
  currency: string;
  revenueSharePct: number;
}

export interface RoutePerformanceTotalsDto {
  departures: number;
  ticketsSold: number;
  netRevenue: string;
  currency: string;
}

export interface RoutePerformanceDto {
  range: ReportsRangeDto;
  routes: RoutePerformanceRowDto[];
  totals: RoutePerformanceTotalsDto;
}
