import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { FleetPositionRespDto, StaffApiService } from '../../../../services/staff/staff-api.service';

/**
 * OBRS-424 — root-scoped stale-while-revalidate cache for the fleet-map
 * page's positions (UX-OBRS-424-fleet-live-map.md §2). No route param — a
 * single global fleet, identical shape every entry — so `fetch()` takes no
 * arguments, same shape as `AdminDashboardStore`.
 */
@Injectable({ providedIn: 'root' })
export class FleetMapStore extends AdminCollectionStore<FleetPositionRespDto[]> {
  constructor(
    private readonly staffApiService: StaffApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<FleetPositionRespDto[]> {
    const response = await firstValueFrom(this.staffApiService.getFleetPositions());
    return response.data ?? [];
  }
}
