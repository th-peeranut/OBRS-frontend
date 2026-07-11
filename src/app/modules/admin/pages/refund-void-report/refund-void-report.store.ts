import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import {
  RefundVoidAmountDto,
  RefundVoidReportDto,
} from '../../../../shared/interfaces/refund-void-report.interface';

/**
 * Stale-while-revalidate cache for `/admin/reports/refund-void` (OBRS-98).
 *
 * Mirrors `ReportsStore` (OBRS-40): parameterized by a `[from, to]` date range —
 * `setRange()` updates the range and re-fetches in place. Root-scoped and outlives
 * the component (`AdminCollectionStore`'s SWR contract) — re-entering the page
 * renders the LAST-FETCHED range's data immediately, then `refresh()` revalidates
 * in the background.
 */
@Injectable({ providedIn: 'root' })
export class RefundVoidReportStore extends AdminCollectionStore<RefundVoidReportDto> {
  private fromDate: string;
  private toDate: string;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    // Default range: last 7 days inclusive of today (same convention as ReportsStore).
    const today = new Date();
    this.toDate = RefundVoidReportStore.toDateInputValue(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    this.fromDate = RefundVoidReportStore.toDateInputValue(from);
  }

  /** The range currently cached/being fetched, as `yyyy-MM-dd` strings. */
  get range(): { from: string; to: string } {
    return { from: this.fromDate, to: this.toDate };
  }

  /**
   * Switch to a new date range and revalidate. The caller (the page component) is
   * responsible for client-side range validation before calling this — this method
   * assumes `from`/`to` are already valid `yyyy-MM-dd` strings with `from <= to`.
   */
  setRange(from: string, to: string): void {
    this.fromDate = from;
    this.toDate = to;
    void this.refresh();
  }

  protected async fetch(): Promise<RefundVoidReportDto> {
    const response = await firstValueFrom(
      this.adminApiService.getRefundVoidReport(this.fromDate, this.toDate)
    );
    return response.data ?? this.emptyReport();
  }

  private emptyReport(): RefundVoidReportDto {
    const zeroAmount = (): RefundVoidAmountDto => ({ count: 0, amount: '0.00' });
    return {
      range: { from: this.fromDate, to: this.toDate, timezone: '' },
      summary: {
        refunded: zeroAmount(),
        manualRefundPending: zeroAmount(),
        voided: { ...zeroAmount(), cancelled: zeroAmount(), expired: zeroAmount() },
        currency: 'THB',
      },
      daily: [],
    };
  }

  private static toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
