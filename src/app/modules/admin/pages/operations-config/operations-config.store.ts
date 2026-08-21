import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, OwnerOperationsConfigDto } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

/** OBRS-703 — SWR store for `OperationsConfigPageComponent` (owner settings
 * tab), mirrors `CancelReschedulePolicyConfigStore` exactly: a single record,
 * `fetch()` throws on a missing response so the page's pristine-only
 * patch-on-later-emission contract can distinguish "still loading" from
 * "load failed". */
@Injectable({ providedIn: 'root' })
export class OperationsConfigStore extends AdminCollectionStore<OwnerOperationsConfigDto> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<OwnerOperationsConfigDto> {
    const response = await firstValueFrom(this.adminApiService.getOperationsOwnerConfig());
    if (!response?.data) {
      throw new Error('Operations config not found');
    }
    return response.data;
  }
}
