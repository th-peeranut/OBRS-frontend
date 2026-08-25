import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { PayeeSpendReportDto } from '../../../../shared/interfaces/payee-spend-report.interface';

/**
 * Stale-while-revalidate cache for `/admin/reports/expense-by-payee` (OBRS-1578).
 *
 * Mirrors `VehiclePlReportStore` (OBRS-841), with one deliberate difference: the filter is a
 * YEAR, and it starts at **every year** rather than at the current one.
 *
 * That default is the owner's ruling of 2026-08-25 and it is not a convenience. Measured on his
 * own six bills, five are 2026 and one is 2025 — and the 2025 one is the second-largest payee on
 * record (฿5,530, more than the busiest garage's entire 2026). A screen that opened on "this year"
 * would hide it on first paint, with nothing visible to say that anything had been hidden. Opening
 * on everything and letting him narrow makes every later number one he chose.
 *
 * `month` is only meaningful inside a year: "January of every year" reads two ways, so selecting
 * every year clears it (and the backend refuses the combination outright).
 */
@Injectable({ providedIn: 'root' })
export class PayeeSpendReportStore extends AdminCollectionStore<PayeeSpendReportDto> {
  private selectedYear: number | null = null;
  private selectedMonth: number | null = null;
  private selectedCategory: string | null = null;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  get filter(): { year: number | null; month: number | null; category: string | null } {
    return {
      year: this.selectedYear,
      month: this.selectedMonth,
      category: this.selectedCategory,
    };
  }

  /**
   * Switch year and revalidate. Leaving a year for "every year" CLEARS the month rather than
   * carrying it: a stale month would otherwise sit in a disabled control and silently reappear the
   * next time a year is picked, narrowing a report the reader thought was whole.
   */
  setYear(year: number | null): void {
    this.selectedYear = year;
    if (year === null) {
      this.selectedMonth = null;
    }
    void this.refresh();
  }

  setMonth(month: number | null): void {
    this.selectedMonth = this.selectedYear === null ? null : month;
    void this.refresh();
  }

  setCategory(category: string | null): void {
    this.selectedCategory = category;
    void this.refresh();
  }

  protected async fetch(): Promise<PayeeSpendReportDto> {
    const response = await firstValueFrom(
      this.adminApiService.getPayeeSpendReport(
        this.selectedYear,
        this.selectedMonth,
        this.selectedCategory
      )
    );
    return response.data ?? this.emptyReport();
  }

  private emptyReport(): PayeeSpendReportDto {
    return {
      year: this.selectedYear,
      month: this.selectedMonth,
      category: this.selectedCategory,
      yearOptions: [],
      rows: [],
      unassigned: null,
      assignedBillCount: 0,
      assignedTotalAmount: '0.00',
      totalBillCount: 0,
      totalAmount: '0.00',
    };
  }
}
