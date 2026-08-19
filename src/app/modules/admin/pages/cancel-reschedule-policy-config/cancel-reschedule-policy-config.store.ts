import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  OwnerCancelReschedulePolicyDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

/** OBRS-699 — SWR store for `CancelReschedulePolicyConfigPageComponent` (owner
 * settings tab), mirrors `ParcelShareConfigAdminStore` exactly: a single
 * record, `fetch()` throws on a missing response so the page's pristine-only
 * patch-on-later-emission contract can distinguish "still loading" from
 * "load failed". */
@Injectable({ providedIn: 'root' })
export class CancelReschedulePolicyConfigStore extends AdminCollectionStore<OwnerCancelReschedulePolicyDto> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<OwnerCancelReschedulePolicyDto> {
    const response = await firstValueFrom(
      this.adminApiService.getCancelReschedulePolicyOwnerConfig()
    );
    if (!response?.data) {
      throw new Error('Cancel/reschedule policy config not found');
    }
    return response.data;
  }
}
