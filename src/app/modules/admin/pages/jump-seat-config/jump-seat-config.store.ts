import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, JumpSeatConfigDto } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

// OBRS-358: mirrors ReminderConfigStore exactly (reminder-config.store.ts) —
// only the API call and DTO type differ.
@Injectable({ providedIn: 'root' })
export class JumpSeatConfigStore extends AdminCollectionStore<JumpSeatConfigDto> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<JumpSeatConfigDto> {
    const response = await firstValueFrom(this.adminApiService.getJumpSeatConfig());
    if (!response.data) {
      throw new Error('Jump seat config not found');
    }
    return response.data;
  }
}
