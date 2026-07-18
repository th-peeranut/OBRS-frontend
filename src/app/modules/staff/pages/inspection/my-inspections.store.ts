import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { StaffApiService, MyInspectionDto } from '../../../../services/staff/staff-api.service';

/** OBRS-312: the current driver's own inspection history, backing the
 * "already inspected this week" hint banner. Root-scoped — refreshed after a
 * successful submit so the banner updates without a page reload. */
@Injectable({ providedIn: 'root' })
export class MyInspectionsStore extends AdminCollectionStore<MyInspectionDto[]> {
  constructor(
    private readonly staffApiService: StaffApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<MyInspectionDto[]> {
    const response = await firstValueFrom(this.staffApiService.getMyInspections());
    return response?.data ?? [];
  }
}
