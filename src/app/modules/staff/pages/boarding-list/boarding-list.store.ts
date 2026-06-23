import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../../admin/shared/admin-collection-store';
import { BoardingListItemDto, StaffApiService } from '../../../../services/staff/staff-api.service';

@Injectable({ providedIn: 'root' })
export class BoardingListStore extends AdminCollectionStore<BoardingListItemDto[]> {
  private currentScheduleId: number | null = null;

  constructor(
    private readonly staffApiService: StaffApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  setScheduleId(id: number): void {
    if (this.currentScheduleId !== id) {
      this.currentScheduleId = id;
      this.clear();
    }
  }

  protected async fetch(): Promise<BoardingListItemDto[]> {
    if (this.currentScheduleId === null) {
      return [];
    }
    const response = await firstValueFrom(
      this.staffApiService.getBoardingList(this.currentScheduleId)
    );
    return response?.data ?? [];
  }
}
