import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { StaffApiService, VehicleInspectionItemDto } from '../../../../services/staff/staff-api.service';

/** OBRS-312: the 23-item master checklist that populates the driver form.
 * Root-scoped (like `DriverSchedulesStore`) — the master list is not
 * per-vehicle, so a single cached copy is correct across every visit to
 * `/staff/inspection`. */
@Injectable({ providedIn: 'root' })
export class VehicleInspectionItemsStore extends AdminCollectionStore<VehicleInspectionItemDto[]> {
  constructor(
    private readonly staffApiService: StaffApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<VehicleInspectionItemDto[]> {
    const response = await firstValueFrom(this.staffApiService.getInspectionItems());
    return response?.data ?? [];
  }
}
