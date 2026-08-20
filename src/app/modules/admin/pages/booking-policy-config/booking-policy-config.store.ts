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
//
// OBRS-1454: except that "the API call" is now TWO calls, chosen by role. The
// page serves two audiences on two backend surfaces:
//   OWNER -> /private/owner/configs/booking-policy  (this operator's override)
//   ADMIN -> /private/admin/configs/booking-policy  (the platform default)
// Before this card it always called the admin one, which OBRS-825 had narrowed
// to hasRole('ADMIN'), so an owner filling in the form got a 403 on Save.
//
// ⛔ The role test is getRoles(), NOT hasAnyRole(['owner']). AuthService's
// ROLE_GRANTS is symmetric at the top — owner grants admin AND admin grants
// owner (auth.service.ts:84-90) — so hasAnyRole cannot tell the two apart and
// would send an ADMIN to an endpoint that refuses them by design (an ADMIN has
// no owner identity to scope an override to). That symmetry is the whole
// reason this defect existed.
@Injectable({ providedIn: 'root' })
export class BookingPolicyConfigStore extends AdminCollectionStore<BookingPolicyConfigDto> {
  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly auth: AuthService
  ) {
    super(auth);
  }

  /** True when the signed-in user really holds `owner` — see the ⛔ note above. */
  get usesOwnerSurface(): boolean {
    return this.auth.getRoles().includes('owner');
  }

  protected async fetch(): Promise<BookingPolicyConfigDto> {
    const response = await firstValueFrom(
      this.usesOwnerSurface
        ? this.adminApiService.getBookingPolicyOwnerConfig()
        : this.adminApiService.getBookingPolicyConfig()
    );
    if (!response.data) {
      throw new Error('Booking policy config not found');
    }
    return response.data;
  }
}
