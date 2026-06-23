import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AdminScheduleDto } from '../../../../services/admin/admin-api.service';

@Injectable({ providedIn: 'root' })
export class DriverSchedulesStore extends AdminCollectionStore<AdminScheduleDto[]> {
  constructor(
    private readonly staffApiService: StaffApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<AdminScheduleDto[]> {
    const response = await firstValueFrom(this.staffApiService.getMySchedules());
    const data = response?.data;
    return Array.isArray(data) ? (data as AdminScheduleDto[]) : [];
  }
}
