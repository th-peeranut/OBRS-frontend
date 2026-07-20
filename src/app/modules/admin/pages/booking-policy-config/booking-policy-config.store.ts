import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  BookingPolicyConfigDto,
} from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';

// OBRS-564: mirrors ReminderConfigStore/JumpSeatConfigStore exactly — only
// the API call and DTO type differ.
@Injectable({ providedIn: 'root' })
export class BookingPolicyConfigStore extends AdminCollectionStore<BookingPolicyConfigDto> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<BookingPolicyConfigDto> {
    const response = await firstValueFrom(this.adminApiService.getBookingPolicyConfig());
    if (!response.data) {
      throw new Error('Booking policy config not found');
    }
    return response.data;
  }
}
