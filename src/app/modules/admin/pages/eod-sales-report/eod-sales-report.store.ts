import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { EodSalesReportDto } from '../../../../shared/interfaces/eod-sales-report.interface';

/**
 * Stale-while-revalidate cache for `/admin/reports/eod-salesperson` (OBRS-97/OBRS-231).
 *
 * Mirrors `ReportsStore` (OBRS-40) but is parameterized by a single day, not a `[from, to]`
 * range: `setDate()` updates the day and re-fetches in place. Root-scoped and outlives the
 * component (`AdminCollectionStore`'s SWR contract) — re-entering the page renders the
 * LAST-FETCHED day's data immediately, then `refresh()` revalidates in the background.
 */
@Injectable({ providedIn: 'root' })
export class EodSalesReportStore extends AdminCollectionStore<EodSalesReportDto> {
  private dateValue: string;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    // Default day: today, client-local `yyyy-MM-dd` — same convention ReportsStore uses for
    // its default range. The backend's own `timezone` field confirms server-side (Asia/Bangkok)
    // bucketing; the store does not attempt its own TZ conversion client-side.
    this.dateValue = EodSalesReportStore.toDateInputValue(new Date());
  }

  /** The day currently cached/being fetched, as a `yyyy-MM-dd` string. */
  get date(): string {
    return this.dateValue;
  }

  /** Switch to a new report day and revalidate. */
  setDate(date: string): void {
    this.dateValue = date;
    void this.refresh();
  }

  protected async fetch(): Promise<EodSalesReportDto> {
    const response = await firstValueFrom(
      this.adminApiService.getEodSalesReport(this.dateValue)
    );
    return response.data ?? this.emptyReport();
  }

  private emptyReport(): EodSalesReportDto {
    return {
      date: this.dateValue,
      timezone: '',
      salespersons: [],
      grandTotal: {
        bookingCount: 0,
        ticketsSold: 0,
        cashAmount: '0.00',
        nonCashAmount: '0.00',
        byMethod: {},
        revenue: { net: '0.00', paid: '0.00', refunded: '0.00', currency: 'THB' },
      },
    };
  }

  private static toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
