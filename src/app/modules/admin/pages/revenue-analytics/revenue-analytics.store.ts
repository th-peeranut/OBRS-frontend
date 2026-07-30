import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { RevenueAnalyticsDto } from '../../../../shared/interfaces/revenue-analytics.interface';

/**
 * Stale-while-revalidate cache for `/admin/revenue-analytics` (OBRS-151). A direct sibling of
 * `ReportsStore` (OBRS-40): one root-scoped cache parameterized by an admin-chosen `[from, to]`
 * range, re-fetched in place by `setRange()`. Re-entering the page renders the last-fetched
 * range immediately, then revalidates in the background.
 */
@Injectable({ providedIn: 'root' })
export class RevenueAnalyticsStore extends AdminCollectionStore<RevenueAnalyticsDto> {
  private fromDate: string;
  private toDate: string;
  private lastErrorCodeValue: string | null = null;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    // Default range: last 7 days inclusive of today (mirrors the backend default + ReportsStore).
    const today = new Date();
    this.toDate = RevenueAnalyticsStore.toDateInputValue(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    this.fromDate = RevenueAnalyticsStore.toDateInputValue(from);
  }

  get range(): { from: string; to: string } {
    return { from: this.fromDate, to: this.toDate };
  }

  get lastErrorCode(): string | null {
    return this.lastErrorCodeValue;
  }

  /** Switch range and revalidate. The component validates `from <= to` before calling. */
  setRange(from: string, to: string): void {
    this.fromDate = from;
    this.toDate = to;
    void this.refresh();
  }

  protected async fetch(): Promise<RevenueAnalyticsDto> {
    try {
      const response = await firstValueFrom(
        this.adminApiService.getRevenueAnalytics(this.fromDate, this.toDate)
      );
      this.lastErrorCodeValue = null;
      return response.data ?? this.emptyAnalytics();
    } catch (error) {
      this.lastErrorCodeValue = RevenueAnalyticsStore.extractErrorCode(error);
      throw error;
    }
  }

  private emptyAnalytics(): RevenueAnalyticsDto {
    const zero = { net: '0.00', paid: '0.00', refunded: '0.00', currency: '' };
    return {
      range: { from: this.fromDate, to: this.toDate, timezone: '' },
      totals: { ...zero },
      previousPeriod: {
        range: { from: this.fromDate, to: this.toDate, timezone: '' },
        totals: { ...zero },
        netChangePct: null,
      },
      dailyTrend: [],
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
