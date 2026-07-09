import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { ReportsSummaryDto } from '../../../../shared/interfaces/reports-summary.interface';

/**
 * Stale-while-revalidate cache for `/admin/reports` (OBRS-40).
 *
 * This is the first `AdminCollectionStore` subclass whose fetch is
 * parameterized by admin-chosen input (a `[from, to]` date range) rather than
 * a single fixed query per page. It stays a single root-scoped cache — not one
 * cache entry per range — because only one range is ever being viewed at a
 * time: `setRange()` updates the range and re-fetches in place. The SWR
 * contract from the base class still holds across navigation: re-entering
 * `/admin/reports` renders the LAST-FETCHED range's data immediately (not a
 * reset to the default range), then `refresh()` revalidates that same range
 * in the background.
 */
@Injectable({ providedIn: 'root' })
export class ReportsStore extends AdminCollectionStore<ReportsSummaryDto> {
  private fromDate: string;
  private toDate: string;
  /**
   * `errorCode` from the most recent failed fetch (e.g. `REPORT_RANGE_INVALID`
   * / `REPORT_RANGE_TOO_LARGE`), so the component can show the specific
   * server-driven message instead of a generic one. `error$` only carries a
   * boolean, so this is exposed alongside it rather than changing the shared
   * base class's contract.
   */
  private lastErrorCodeValue: string | null = null;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    // Default range: last 7 days inclusive of today.
    const today = new Date();
    this.toDate = ReportsStore.toDateInputValue(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    this.fromDate = ReportsStore.toDateInputValue(from);
  }

  /** The range currently cached/being fetched, as `yyyy-MM-dd` strings. */
  get range(): { from: string; to: string } {
    return { from: this.fromDate, to: this.toDate };
  }

  get lastErrorCode(): string | null {
    return this.lastErrorCodeValue;
  }

  /**
   * Switch to a new date range and revalidate. The caller (the page
   * component) is responsible for client-side range validation before
   * calling this — this method assumes `from`/`to` are already valid
   * `yyyy-MM-dd` strings with `from <= to`.
   */
  setRange(from: string, to: string): void {
    this.fromDate = from;
    this.toDate = to;
    void this.refresh();
  }

  protected async fetch(): Promise<ReportsSummaryDto> {
    try {
      const response = await firstValueFrom(
        this.adminApiService.getReportsSummary(this.fromDate, this.toDate)
      );
      this.lastErrorCodeValue = null;
      return response.data ?? this.emptySummary();
    } catch (error) {
      this.lastErrorCodeValue = ReportsStore.extractErrorCode(error);
      throw error;
    }
  }

  private emptySummary(): ReportsSummaryDto {
    return {
      range: { from: this.fromDate, to: this.toDate, timezone: '' },
      basis: { volume: 'booking_date', revenue: 'booking_date', occupancy: 'departure_date' },
      tiles: { bookingCount: 0, ticketsSold: 0, occupancyRatePct: 0 },
      daily: [],
    };
  }

  private static extractErrorCode(error: unknown): string | null {
    const httpError = error as { error?: { errorCode?: string } };
    return httpError?.error?.errorCode ?? null;
  }

  private static toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
