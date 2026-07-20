import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';

/**
 * OBRS-416: component-scoped (`providers: [ParcelVerifyListStore]` on
 * `ParcelVerifyListPageComponent`), NOT `providedIn: 'root'` — identical
 * reasoning to `ParcelDeliveryListStore`: a schedule-scoped manifest must not
 * leak into the next mount.
 *
 * Calls the dedicated `getParcelsPendingVerification(scheduleId)` endpoint,
 * NOT the sibling delivery-handoff list's `getConsignedParcelsForSchedule`.
 * That sibling endpoint's backing query deliberately EXCLUDES
 * `deliveryStatus === 'created'` rows (OBRS-415/OBRS-348), so an earlier
 * version of this store that called it and then filtered the response down
 * to `'created'` client-side could never show a row — the intersection of
 * "excluded server-side" and "the only status we want" is always empty. That
 * was OBRS-416's P0 (fixed here). The filtering is the server's job now;
 * this store trusts the response as-is.
 */
@Injectable()
export class ParcelVerifyListStore extends AdminCollectionStore<ParcelDeliveryListItemDto[]> {
  private currentScheduleId: number | null = null;

  constructor(
    private readonly staffApiService: StaffApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  setScheduleId(id: number): void {
    if (this.currentScheduleId !== id) {
      this.currentScheduleId = id;
      this.clear();
    }
  }

  protected async fetch(): Promise<ParcelDeliveryListItemDto[]> {
    if (this.currentScheduleId === null) {
      return [];
    }
    const response = await firstValueFrom(
      this.staffApiService.getParcelsPendingVerification(this.currentScheduleId)
    );
    return response?.data ?? [];
  }
}
