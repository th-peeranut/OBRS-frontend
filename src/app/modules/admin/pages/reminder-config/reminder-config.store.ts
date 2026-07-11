import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, ReminderConfigDto } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

// OBRS-223: mirrors RoundTripPromotionStore exactly (promotions.store.ts) —
// only the API call and DTO type differ.
@Injectable({ providedIn: 'root' })
export class ReminderConfigStore extends AdminCollectionStore<ReminderConfigDto> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<ReminderConfigDto> {
    const response = await firstValueFrom(this.adminApiService.getReminderConfig());
    if (!response.data) {
      throw new Error('Reminder config not found');
    }
    return response.data;
  }
}
