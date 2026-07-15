import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { CargoAvailabilityRespDto } from '../../../../shared/interfaces/parcel.interface';

/**
 * OBRS-305: component-scoped (`providers: [ParcelCargoAvailabilityStore]` on
 * `ParcelConsignPageComponent`), NOT `providedIn: 'root'` — same reasoning as
 * `BoardingListStore` (shared/components/boarding-list/boarding-list.store.ts):
 * the cargo-remaining indicator is scoped to whichever schedule is currently
 * selected on the consign form, and a root-scoped singleton would leak one
 * mount's cached figure into the next.
 */
@Injectable()
export class ParcelCargoAvailabilityStore extends AdminCollectionStore<CargoAvailabilityRespDto> {
  private currentScheduleId: number | null = null;

  constructor(
    private readonly staffApiService: StaffApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  setScheduleId(id: number | null): void {
    if (this.currentScheduleId !== id) {
      this.currentScheduleId = id;
      this.clear();
    }
  }

  protected async fetch(): Promise<CargoAvailabilityRespDto> {
    if (this.currentScheduleId === null) {
      return { cargoCapacityKg: 0, bookedKg: 0, remainingKg: 0 };
    }
    const response = await firstValueFrom(
      this.staffApiService.getCargoAvailability(this.currentScheduleId)
    );
    return (
      response?.data ?? { cargoCapacityKg: 0, bookedKg: 0, remainingKg: 0 }
    );
  }
}
