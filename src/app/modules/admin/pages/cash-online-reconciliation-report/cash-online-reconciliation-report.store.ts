import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import {
  CashOnlineBucketDto,
  CashOnlineReconciliationReportDto,
} from '../../../../shared/interfaces/cash-online-reconciliation-report.interface';

/**
 * Stale-while-revalidate cache for `/admin/reports/cash-online-reconciliation`
 * (OBRS-99).
 *
 * Mirrors `RefundVoidReportStore` (OBRS-98) 1:1: parameterized by a `[from, to]`
 * date range — `setRange()` updates the range and re-fetches in place. Root-scoped
 * and outlives the component (`AdminCollectionStore`'s SWR contract) — re-entering
 * the page renders the LAST-FETCHED range's data immediately, then `refresh()`
 * revalidates in the background.
 */
@Injectable({ providedIn: 'root' })
export class CashOnlineReconciliationReportStore extends AdminCollectionStore<CashOnlineReconciliationReportDto> {
  private fromDate: string;
  private toDate: string;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    // Default range: last 7 days inclusive of today (same convention as RefundVoidReportStore).
    const today = new Date();
    this.toDate = CashOnlineReconciliationReportStore.toDateInputValue(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    this.fromDate = CashOnlineReconciliationReportStore.toDateInputValue(from);
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

  protected async fetch(): Promise<CashOnlineReconciliationReportDto> {
    const response = await firstValueFrom(
      this.adminApiService.getCashOnlineReconciliationReport(this.fromDate, this.toDate)
    );
    return response.data ?? this.emptyReport();
  }

  private emptyReport(): CashOnlineReconciliationReportDto {
    const zeroBucket = (): CashOnlineBucketDto => ({
      count: 0,
      collected: '0.00',
      refunded: '0.00',
      net: '0.00',
    });
    return {
      range: { from: this.fromDate, to: this.toDate, timezone: '' },
      summary: {
        cash: zeroBucket(),
        online: zeroBucket(),
        other: zeroBucket(),
        totalCollected: '0.00',
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
