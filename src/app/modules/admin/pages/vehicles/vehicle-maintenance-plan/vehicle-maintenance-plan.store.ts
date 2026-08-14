import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../../auth/auth.service';
import {
  AdminApiService,
  AdminVehicleMaintenancePlanDto,
} from '../../../../../services/admin/admin-api.service';
import { AdminCollectionStore } from '../../../shared/admin-collection-store';

/**
 * OBRS-1333: mirrors `VehicleMaintenanceStore` (OBRS-209) byte-for-byte —
 * deliberately **not** `providedIn: 'root'`. `AppVehicleMaintenancePlanPanelComponent`
 * mounts fresh each time an admin focuses a different vehicle
 * (`providers: [VehicleMaintenancePlanStore]` on the component), and a
 * root-scoped singleton would replay one vehicle's cached plan list into the
 * next vehicle's freshly-mounted panel before the background revalidate
 * lands. Component-scoped means each mount gets its own instance instead.
 */
@Injectable()
export class VehicleMaintenancePlanStore extends AdminCollectionStore<AdminVehicleMaintenancePlanDto[]> {
  private currentVehicleId: number | null = null;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  setVehicleId(id: number): void {
    if (this.currentVehicleId !== id) {
      this.currentVehicleId = id;
      this.clear();
    }
  }

  protected async fetch(): Promise<AdminVehicleMaintenancePlanDto[]> {
    if (this.currentVehicleId === null) {
      return [];
    }
    const response = await firstValueFrom(
      this.adminApiService.getVehicleMaintenancePlans(this.currentVehicleId)
    );
    return response?.data ?? [];
  }
}
