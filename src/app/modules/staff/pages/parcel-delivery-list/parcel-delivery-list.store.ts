import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';

/**
 * OBRS-305: component-scoped (`providers: [ParcelDeliveryListStore]` on
 * `ParcelDeliveryListPageComponent`), NOT `providedIn: 'root'` — same
 * reasoning as `BoardingListStore`: this is a driver/salesperson's
 * schedule-scoped delivery manifest, and a root-scoped singleton would leak
 * one schedule's cached list into the next mount.
 */
@Injectable()
export class ParcelDeliveryListStore extends AdminCollectionStore<ParcelDeliveryListItemDto[]> {
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
    return response?.data ?? [];
  }
}
