import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../../auth/auth.service';
import { AdminApiService, AdminVehicleMaintenanceDto } from '../../../../../services/admin/admin-api.service';
import { AdminCollectionStore } from '../../../shared/admin-collection-store';

/**
 * OBRS-209: deliberately **not** `providedIn: 'root'` (unlike every other
 * `AdminCollectionStore` subclass except `BoardingListStore`, which this
 * mirrors). `AppVehicleMaintenancePanelComponent` mounts fresh each time an
 * admin focuses a different vehicle (`providers: [VehicleMaintenanceStore]`
 * on the component), and a root-scoped singleton would replay one vehicle's
 * cached maintenance list into the next vehicle's freshly-mounted panel
 * before the background revalidate lands. Component-scoped means each mount
 * gets its own instance instead — a deliberate, correct trade against the
 * cross-navigation stale-while-revalidate replay the base class normally
 * gives.
 */
@Injectable()
export class VehicleMaintenanceStore extends AdminCollectionStore<AdminVehicleMaintenanceDto[]> {
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

  protected async fetch(): Promise<AdminVehicleMaintenanceDto[]> {
    if (this.currentVehicleId === null) {
      return [];
    }
    const response = await firstValueFrom(
      this.adminApiService.getVehicleMaintenance(this.currentVehicleId)
    );
    return response?.data ?? [];
  }
}
