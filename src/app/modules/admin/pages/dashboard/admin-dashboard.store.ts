import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { DashboardTodayDto } from '../../../../shared/interfaces/dashboard-today.interface';

/**
 * Stale-while-revalidate cache for `/admin/dashboard/today` (OBRS-129).
 *
 * Re-based onto `AdminCollectionStore`, following the same pattern as
 * `ReportsStore` (OBRS-40): a single root-scoped cache, no client-chosen
 * parameters (the endpoint is always "today" in Bangkok time), so `fetch()`
 * takes no arguments. Re-entering `/admin/dashboard` renders the
 * last-fetched snapshot immediately, then `refresh()` revalidates in the
 * background — the same SWR contract as every other `AdminCollectionStore`
 * subclass.
 */
@Injectable({ providedIn: 'root' })
export class AdminDashboardStore extends AdminCollectionStore<DashboardTodayDto> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<DashboardTodayDto> {
    const response = await firstValueFrom(this.adminApiService.getDashboardToday());
    return response.data ?? this.emptySnapshot();
  }

  private emptySnapshot(): DashboardTodayDto {
    return {
      date: '',
      timezone: '',
      basis: { volume: 'booking_date', revenue: 'booking_date', occupancy: 'departure_date' },
      tiles: { departuresCount: 0, occupancyRatePct: 0, bookingCount: 0 },
      departures: [],
    };
  }
}
