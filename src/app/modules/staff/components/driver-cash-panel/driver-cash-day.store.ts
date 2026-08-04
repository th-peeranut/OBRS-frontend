import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { DriverCashDayRespDto } from '../../../../shared/interfaces/driver-cash.interface';

/**
 * OBRS-960 — mirrors `ParcelCargoAvailabilityStore`'s shape exactly
 * (`parcel-cargo-availability.store.ts`): **component-scoped**
 * (`providers: [DriverCashDayStore]` on `DriverCashPanelComponent`), NOT
 * `providedIn: 'root'`. A root singleton would leak one driver's cached cash
 * day into the next boarding round the moment the panel remounts for a
 * different `scheduleId` — this store's whole job is a per-round total, so a
 * cross-round leak would show the wrong running totals at the vehicle.
 *
 * `fetch()` returns `response?.data ?? null` (not a fabricated empty object)
 * to preserve the `data: null` contract every consumer of `data$` already
 * expects from `AdminCollectionStore<T | null>`.
 */
@Injectable()
export class DriverCashDayStore extends AdminCollectionStore<DriverCashDayRespDto | null> {
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

  protected async fetch(): Promise<DriverCashDayRespDto | null> {
    if (this.currentScheduleId === null) {
      return null;
    }
    const response = await firstValueFrom(
      this.staffApiService.getDriverCashDay(this.currentScheduleId)
    );
    return response?.data ?? null;
  }
}
