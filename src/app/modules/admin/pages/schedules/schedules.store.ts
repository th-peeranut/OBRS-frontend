import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRouteDto,
  AdminScheduleDto,
  AdminScheduleSetDto,
  AdminUserDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

export interface SchedulesData {
  scheduleSets: AdminScheduleSetDto[];
  generatedSchedules: AdminScheduleDto[];
  routes: AdminRouteDto[];
  vehicles: AdminVehicleDto[];
  vehicleTypes: AdminVehicleTypeDto[];
  users: AdminUserDto[];
  lookups: AdminLookupDto[];
}

/**
 * Stale-while-revalidate cache for the schedules page. This page fetches seven
 * endpoints per visit, so caching it is the biggest re-entry win.
 */
@Injectable({ providedIn: 'root' })
export class SchedulesStore extends AdminCollectionStore<SchedulesData> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<SchedulesData> {
    const [
      scheduleSets,
      generatedSchedules,
      routes,
      vehicles,
      vehicleTypes,
      users,
      lookups,
    ] = await Promise.all([
      firstValueFrom(this.adminApiService.getScheduleSets()),
      firstValueFrom(this.adminApiService.getSchedules()),
      firstValueFrom(this.adminApiService.getRoutes()),
      firstValueFrom(this.adminApiService.getVehicles()),
      firstValueFrom(this.adminApiService.getVehicleTypes()),
      firstValueFrom(this.adminApiService.getUsers()),
      firstValueFrom(this.adminApiService.getLookups()),
    ]);

    return {
      scheduleSets: scheduleSets?.data ?? [],
      generatedSchedules: generatedSchedules?.data ?? [],
      routes: routes?.data ?? [],
      vehicles: vehicles?.data ?? [],
      vehicleTypes: vehicleTypes?.data ?? [],
      users: users?.data ?? [],
      lookups: lookups?.data ?? [],
    };
  }
}
