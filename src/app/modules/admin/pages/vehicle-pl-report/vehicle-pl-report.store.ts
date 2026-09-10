import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { VehiclePlReportDto } from '../../../../shared/interfaces/vehicle-pl-report.interface';

/**
 * Stale-while-revalidate cache for `/admin/reports/pl-per-vehicle` (OBRS-841).
 *
 * Mirrors `RefundVoidReportStore` (OBRS-98): parameterized by a `[from, to]` date range —
 * `setRange()` updates the range and re-fetches in place.
 *
 * The default range is the CURRENT MONTH, not the last 7 days the other report stores use:
 * a P&L is read a month at a time (that is the grain of the spreadsheet this screen
 * replaces), and a 7-day window would show a month's instalment or insurance line only if
 * it happened to fall inside it — the exact "this bus looks profitable" misreading the
 * report exists to prevent.
 */
@Injectable({ providedIn: 'root' })
export class VehiclePlReportStore extends AdminCollectionStore<VehiclePlReportDto> {
  private fromDate: string;
  private toDate: string;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
    const today = new Date();
    this.fromDate = VehiclePlReportStore.toDateInputValue(
      new Date(today.getFullYear(), today.getMonth(), 1)
    );
    this.toDate = VehiclePlReportStore.toDateInputValue(today);
  }

  /** The range currently cached/being fetched, as `yyyy-MM-dd` strings. */
  get range(): { from: string; to: string } {
    return { from: this.fromDate, to: this.toDate };
  }

  /**
   * Switch to a new date range and revalidate. The caller (the page component) validates
   * the range first — this method assumes `from`/`to` are valid `yyyy-MM-dd` with
   * `from <= to`.
   */
  setRange(from: string, to: string): void {
    this.fromDate = from;
    this.toDate = to;
    void this.refresh();
  }

  protected async fetch(): Promise<VehiclePlReportDto> {
    const response = await firstValueFrom(
      this.adminApiService.getVehiclePlReport(this.fromDate, this.toDate)
    );
    return response.data ?? this.emptyReport();
  }

  private emptyReport(): VehiclePlReportDto {
    return {
      from: this.fromDate,
      to: this.toDate,
      vatIncludedInAmounts: true,
      rows: [],
      totals: {
        revenue: '0.00',
        expenses: '0.00',
        vat: '0.00',
        margin: '0.00',
        currency: 'THB',
        pendingExpenses: '0.00',
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
