import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, AdminExpenseDto } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

/**
 * Stale-while-revalidate cache for `/admin/expenses` (OBRS-685).
 *
 * Mirrors `RefundVoidReportStore`'s parameterized-fetch shape (`setRange()`)
 * — here the mutable field is the vehicle filter instead of a date range.
 * `null` fetches every expense (`GET /expenses`, no query param); a number
 * scopes the fetch to `?vehicleId=`. Root-scoped and outlives the component
 * (SWR contract) — re-entering the page renders the last-fetched filter's
 * data immediately, then `refresh()` revalidates in the background.
 */
@Injectable({ providedIn: 'root' })
export class ExpensesStore extends AdminCollectionStore<AdminExpenseDto[]> {
  private vehicleFilter: number | null = null;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  /** The vehicle filter currently cached/being fetched — `null` means
   * unfiltered (either "ทั้งหมด" or the "central only" client-side option,
   * which reuses the SAME unfiltered fetch — see
   * `expenses-page.mappers.ts`'s `filterExpensesByCategoryAndRange`). */
  get vehicleFilterId(): number | null {
    return this.vehicleFilter;
  }

  /** Switch the server-side vehicle filter and revalidate. */
  setVehicleFilter(vehicleId: number | null): void {
    this.vehicleFilter = vehicleId;
    void this.refresh();
  }

  protected async fetch(): Promise<AdminExpenseDto[]> {
    const response = await firstValueFrom(this.adminApiService.getExpenses(this.vehicleFilter));
    return response?.data ?? [];
  }
}
