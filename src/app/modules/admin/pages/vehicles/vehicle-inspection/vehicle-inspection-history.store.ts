import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../../auth/auth.service';
import { AdminApiService, VehicleInspectionListItemDto } from '../../../../../services/admin/admin-api.service';
import { AdminCollectionStore } from '../../../shared/admin-collection-store';

/**
 * OBRS-312: deliberately **not** `providedIn: 'root'` — mirrors
 * `VehicleMaintenanceStore` byte-for-byte (see that file's doc comment).
 * `AppVehicleInspectionPanelComponent` mounts fresh each time an admin
 * focuses a different vehicle (`providers: [VehicleInspectionHistoryStore]`
 * on the component), and a root-scoped singleton would replay one vehicle's
 * cached inspection history into the next vehicle's freshly-mounted panel
 * before the background revalidate lands.
 */
@Injectable()
export class VehicleInspectionHistoryStore extends AdminCollectionStore<VehicleInspectionListItemDto[]> {
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

  protected async fetch(): Promise<VehicleInspectionListItemDto[]> {
    if (this.currentVehicleId === null) {
      return [];
    }
    const response = await firstValueFrom(
      this.adminApiService.getVehicleInspections(this.currentVehicleId)
    );
    return response?.data ?? [];
  }
}
