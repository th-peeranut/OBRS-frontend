import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, AdminInspectionItemDto } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

/**
 * Stale-while-revalidate cache for the inspection-items admin page (OBRS-509).
 * PRECEDENT: `CargoCapacityStore` (OBRS-508) — root-scoped, OWNER-only page,
 * real write path via `store.mutate()` at the page component's create/edit/
 * retire/reorder call sites. NOT `lookups.store.ts` — its write path was
 * never wired (SPEC §0), not a usable precedent.
 */
@Injectable({ providedIn: 'root' })
export class InspectionItemsStore extends AdminCollectionStore<AdminInspectionItemDto[]> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<AdminInspectionItemDto[]> {
    const response = await firstValueFrom(this.adminApiService.getInspectionItemsForManage());
    return response?.data ?? [];
  }
}
