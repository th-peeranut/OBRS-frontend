import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { ParcelShareConfigDto } from '../../../../shared/interfaces/parcel.interface';

/**
 * OBRS-960 — root-scoped single-record SWR store, shaped like
 * `JumpSeatConfigStore` (`admin/pages/jump-seat-config/jump-seat-config.store.ts`):
 * no mutable filter state, `fetch()` throws on a missing/failed response so
 * `AdminCollectionStore.error$` fires.
 *
 * ⚠️ **Fail-safe is the whole point of this store.** The card requires: if
 * the config GET fails, the banner must still SHOW (treat unknown as
 * unconfigured) — never silently hide it, because the parcel-share amount is
 * snapshotted at intake and freezes at 0% until a repair runs. `fetch()`
 * therefore throws on any transport/deserialization problem (same as
 * `JumpSeatConfigStore`), and the CONSUMER (`ParcelConsignPageComponent`)
 * reads `error$` to decide the warning is shown — never reads `value ===
 * null` as "no opinion, hide it". See that component + this store's own
 * spec for the fail-safe assertion.
 */
@Injectable({ providedIn: 'root' })
export class ParcelShareConfigStore extends AdminCollectionStore<ParcelShareConfigDto> {
  constructor(
    private readonly staffApiService: StaffApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<ParcelShareConfigDto> {
    const response = await firstValueFrom(this.staffApiService.getParcelShareConfig());
    if (!response?.data) {
      throw new Error('Parcel share config not found');
    }
    return response.data;
  }
}
