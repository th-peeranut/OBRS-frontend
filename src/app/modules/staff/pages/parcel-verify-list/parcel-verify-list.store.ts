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
 * Calls the SAME `getConsignedParcelsForSchedule(scheduleId)` endpoint the
 * sibling delivery-handoff list store already calls (no new list endpoint —
 * per the UX spec's contract note, the backend extended that one response
 * row additively with `lengthCm`/`widthCm`/`heightCm`/`amount` rather than
 * standing up a second endpoint) and filters to `deliveryStatus === 'created'`
 * client-side: this screen's whole job is checking parcels nobody has
 * physically inspected yet, and every other status belongs on the sibling
 * `ParcelDeliveryListStore`'s list instead. Same client-side status-driven
 * branching idiom `ParcelDeliveryListPageComponent` already uses off the same
 * one list response.
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
      this.staffApiService.getConsignedParcelsForSchedule(this.currentScheduleId)
    );
    return (response?.data ?? []).filter((p) => p.deliveryStatus === 'created');
  }
}
