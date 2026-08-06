import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  ParcelShareOwnerConfigDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

/** OBRS-960 — SWR store for `ParcelShareConfigPageComponent` (owner
 * settings tab), mirrors `BookingPolicyConfigStore` exactly: a single record,
 * `fetch()` throws on a missing response so the page's pristine-only
 * patch-on-later-emission contract can distinguish "still loading" from
 * "load failed". */
@Injectable({ providedIn: 'root' })
export class ParcelShareConfigAdminStore extends AdminCollectionStore<ParcelShareOwnerConfigDto> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<ParcelShareOwnerConfigDto> {
    const response = await firstValueFrom(this.adminApiService.getParcelShareOwnerConfig());
    if (!response?.data) {
      throw new Error('Parcel share config not found');
    }
    return response.data;
  }
}
