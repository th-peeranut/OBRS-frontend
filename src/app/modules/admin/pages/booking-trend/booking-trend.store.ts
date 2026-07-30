import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { BookingTrendDto } from '../../../../shared/interfaces/booking-trend.interface';

/**
 * SWR cache for `/admin/booking-trend` (OBRS-152). A sibling of ReportsStore/RevenueAnalyticsStore:
 * one root-scoped cache parameterized by an admin-chosen `[from, to]` range, re-fetched in place by
 * `setRange()`.
 */
@Injectable({ providedIn: 'root' })
export class BookingTrendStore extends AdminCollectionStore<BookingTrendDto> {
  private fromDate: string;
  private toDate: string;
  private lastErrorCodeValue: string | null = null;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    const today = new Date();
    this.toDate = BookingTrendStore.toDateInputValue(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    this.fromDate = BookingTrendStore.toDateInputValue(from);
  }

  get range(): { from: string; to: string } {
    return { from: this.fromDate, to: this.toDate };
  }

  get lastErrorCode(): string | null {
    return this.lastErrorCodeValue;
  }

  setRange(from: string, to: string): void {
    this.fromDate = from;
    this.toDate = to;
    void this.refresh();
  }

  protected async fetch(): Promise<BookingTrendDto> {
    try {
      const response = await firstValueFrom(
        this.adminApiService.getBookingTrend(this.fromDate, this.toDate)
      );
      this.lastErrorCodeValue = null;
      return response.data ?? this.emptyTrend();
    } catch (error) {
      this.lastErrorCodeValue = BookingTrendStore.extractErrorCode(error);
      throw error;
    }
  }

  private emptyTrend(): BookingTrendDto {
    return {
      range: { from: this.fromDate, to: this.toDate, timezone: '' },
      series: [],
      previousPeriod: {
        range: { from: this.fromDate, to: this.toDate, timezone: '' },
        totalBookings: 0,
        changePct: null,
      },
      byDayOfWeek: Array.from({ length: 7 }, (_, i) => ({ dow: i + 1, bookingCount: 0, sharePct: 0 })),
      peak: null,
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
