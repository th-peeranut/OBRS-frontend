import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRouteDto,
  AdminScheduleDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
  DriverDto,
} from '../../../../services/admin/admin-api.service';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';

export interface StaffSchedulesData {
  schedules: AdminScheduleDto[];
  routes: AdminRouteDto[];
  vehicles: AdminVehicleDto[];
  vehicleTypes: AdminVehicleTypeDto[];
  drivers: DriverDto[];
  lookups: AdminLookupDto[];
}

@Injectable({ providedIn: 'root' })
export class StaffSchedulesStore extends AdminCollectionStore<StaffSchedulesData> {
  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly staffApiService: StaffApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<StaffSchedulesData> {
    // Drivers come from the SALESPERSON-readable /private/users/drivers endpoint
    // (staffApiService.getDrivers) — NOT adminApiService.getUsers, which hits the
    // OWNER-only /private/users and 403s for salespersons, sinking the whole load
    // (OBRS-175). This store also feeds the sell-page add-schedule form.
    const [schedules, routes, vehicles, vehicleTypes, drivers, lookups] = await Promise.all([
      firstValueFrom(this.adminApiService.getSchedules()),
      firstValueFrom(this.adminApiService.getRoutes()),
      firstValueFrom(this.adminApiService.getVehicles()),
      firstValueFrom(this.adminApiService.getVehicleTypes()),
      firstValueFrom(this.staffApiService.getDrivers()),
      firstValueFrom(this.adminApiService.getLookups()),
    ]);

    return {
      schedules: schedules?.data ?? [],
      routes: routes?.data ?? [],
      vehicles: vehicles?.data ?? [],
      vehicleTypes: vehicleTypes?.data ?? [],
      drivers: drivers?.data ?? [],
      lookups: lookups?.data ?? [],
    };
  }
}
