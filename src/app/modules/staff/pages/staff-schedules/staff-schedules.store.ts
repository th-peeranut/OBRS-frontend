import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRouteDto,
  AdminScheduleDto,
  AdminUserDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';

export interface StaffSchedulesData {
  schedules: AdminScheduleDto[];
  routes: AdminRouteDto[];
  vehicles: AdminVehicleDto[];
  vehicleTypes: AdminVehicleTypeDto[];
  users: AdminUserDto[];
  lookups: AdminLookupDto[];
}

@Injectable({ providedIn: 'root' })
export class StaffSchedulesStore extends AdminCollectionStore<StaffSchedulesData> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<StaffSchedulesData> {
    const [schedules, routes, vehicles, vehicleTypes, users, lookups] = await Promise.all([
      firstValueFrom(this.adminApiService.getSchedules()),
      firstValueFrom(this.adminApiService.getRoutes()),
      firstValueFrom(this.adminApiService.getVehicles()),
      firstValueFrom(this.adminApiService.getVehicleTypes()),
      firstValueFrom(this.adminApiService.getUsers()),
      firstValueFrom(this.adminApiService.getLookups()),
    ]);

    return {
      schedules: schedules?.data ?? [],
      routes: routes?.data ?? [],
      vehicles: vehicles?.data ?? [],
      vehicleTypes: vehicleTypes?.data ?? [],
      users: users?.data ?? [],
      lookups: lookups?.data ?? [],
    };
  }
}
