import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { StaffApiService, InspectableVehicleDto } from '../../../../services/staff/staff-api.service';

/** OBRS-312: the vehicle picker source (whole active fleet — any driver may
 * cover any van, so this is deliberately NOT derived from
 * `DriverSchedulesStore`). Root-scoped: the fleet list is not per-session
 * state, same reasoning as `VehicleInspectionItemsStore`. */
@Injectable({ providedIn: 'root' })
export class InspectableVehiclesStore extends AdminCollectionStore<InspectableVehicleDto[]> {
  constructor(
    private readonly staffApiService: StaffApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<InspectableVehicleDto[]> {
    const response = await firstValueFrom(this.staffApiService.getInspectableVehicles());
    return response?.data ?? [];
  }
}
