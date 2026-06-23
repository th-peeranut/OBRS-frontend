import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

export interface VehiclesData {
  vehicles: AdminVehicleDto[];
  vehicleTypes: AdminVehicleTypeDto[];
  lookups: AdminLookupDto[];
}

/** Stale-while-revalidate cache for the vehicles page (list + form options). */
@Injectable({ providedIn: 'root' })
export class VehiclesStore extends AdminCollectionStore<VehiclesData> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<VehiclesData> {
    const [vehicles, vehicleTypes, lookups] = await Promise.all([
      firstValueFrom(this.adminApiService.getVehicles()),
      firstValueFrom(this.adminApiService.getVehicleTypes()),
      firstValueFrom(this.adminApiService.getLookups()),
    ]);

    return {
      vehicles: vehicles?.data ?? [],
      vehicleTypes: vehicleTypes?.data ?? [],
      lookups: lookups?.data ?? [],
    };
  }
}
