import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, AdminVehicleTypeDto } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

export interface CargoCapacityData {
  vehicleTypes: AdminVehicleTypeDto[];
}

/**
 * Stale-while-revalidate cache for the cargo-capacity settings page (OBRS-508).
 * Reuses the same `GET /vehicle-types` list endpoint `VehiclesStore` and
 * `SchedulesStore` already call — a dedicated store (rather than reusing
 * theirs) keeps this page's re-entry cache independent of those pages' own
 * fetch cadence, mirroring `ReminderConfigStore`/`JumpSeatConfigStore`'s
 * one-store-per-settings-page precedent.
 */
@Injectable({ providedIn: 'root' })
export class CargoCapacityStore extends AdminCollectionStore<CargoCapacityData> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<CargoCapacityData> {
    const response = await firstValueFrom(this.adminApiService.getVehicleTypes());
    return { vehicleTypes: response?.data ?? [] };
  }
}
