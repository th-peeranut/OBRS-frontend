import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import {
  PerHeadEarningsGranularity,
  PerHeadEarningsRespDto,
} from '../../../../shared/interfaces/driver-cash.interface';

/**
 * OBRS-1147 — the caller's own ค่าหัว. Component-scoped rather than
 * `providedIn: 'root'`, for the same reason `DriverCashDayStore` is: this holds
 * ONE person's pay, and a root singleton would survive a logout/login on a
 * shared counter machine and show the previous person's money to the next one.
 *
 * Range + granularity live here (not in the component) so a change to either
 * goes through one `refresh()` — the `ExpensesStore.setVehicleFilter()` shape
 * the rest of the app already uses.
 */
@Injectable()
export class MyEarningsStore extends AdminCollectionStore<PerHeadEarningsRespDto | null> {
  private from = '';
  private to = '';
  private granularity: PerHeadEarningsGranularity = 'MONTH';

  constructor(
    private readonly staffApiService: StaffApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  get query(): { from: string; to: string; granularity: PerHeadEarningsGranularity } {
    return { from: this.from, to: this.to, granularity: this.granularity };
  }

  setQuery(from: string, to: string, granularity: PerHeadEarningsGranularity): void {
    this.from = from;
    this.to = to;
    this.granularity = granularity;
    void this.refresh();
  }

  protected async fetch(): Promise<PerHeadEarningsRespDto | null> {
    if (!this.from || !this.to) {
      return null;
    }
    const response = await firstValueFrom(
      this.staffApiService.getDriverCashMyEarnings(this.from, this.to, this.granularity)
    );
    return response?.data ?? null;
  }
}
