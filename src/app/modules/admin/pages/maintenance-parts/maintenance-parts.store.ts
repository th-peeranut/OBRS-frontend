import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminMaintenancePartDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

/**
 * Stale-while-revalidate cache for the parts/labour registry (OBRS-1613).
 *
 * <p><b>It always fetches `includeInactive=true`, for the reason `ExpensePayeesStore` spells out and
 * this store inherits unchanged.</b> The consumers want different subsets — a picker must never
 * offer a retired entry, the registry screen must show one so it can be un-retired — and giving the
 * store a mutable flag would let whichever screen set it last decide what the OTHER one sees. Both
 * can be alive at once here too: the registry screen is one navigation away from the maintenance
 * plan panel. One fetch of the superset, filtered per consumer, costs nothing at this size — 13
 * seeded rows plus whatever the operator has typed, tens not thousands.
 */
@Injectable({ providedIn: 'root' })
export class MaintenancePartsStore extends AdminCollectionStore<AdminMaintenancePartDto[]> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<AdminMaintenancePartDto[]> {
    const response = await firstValueFrom(this.adminApiService.getMaintenanceParts(null, true));
    return response?.data ?? [];
  }
}
