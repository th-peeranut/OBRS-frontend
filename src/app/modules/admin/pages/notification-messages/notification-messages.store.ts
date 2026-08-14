import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import {
  OverridableMessageKeyDto,
  PendingReviewRowDto,
} from '../../../../shared/interfaces/notification-message-override.interface';

/**
 * OBRS-1308 — owner's message-key list (`NotificationMessageListPageComponent`).
 * Standard `AdminCollectionStore` SWR shape (driver-cash-rates precedent):
 * cached across route re-entry (no `RouteReuseStrategy`), cleared on logout.
 */
@Injectable({ providedIn: 'root' })
export class NotificationMessagesStore extends AdminCollectionStore<OverridableMessageKeyDto[]> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<OverridableMessageKeyDto[]> {
    const response = await firstValueFrom(this.adminApiService.getNotificationMessages());
    return response?.data ?? [];
  }
}

/**
 * OBRS-1308 — admin's pending-review queue
 * (`NotificationMessageReviewQueuePageComponent`). Same SWR shape as the store
 * above.
 *
 * <p><b>Only ever `refresh()`ed from a component that has already passed the
 * exact-role `authService.getRoles().includes('admin')` check</b> (AC5). The
 * page component is what enforces that — this store has no role awareness of
 * its own, exactly like `AdminApiService`'s methods it calls, which also do
 * not gate on role client-side (the backend does, with `hasRole('ADMIN')`).
 */
@Injectable({ providedIn: 'root' })
export class NotificationMessageReviewQueueStore extends AdminCollectionStore<
  PendingReviewRowDto[]
> {
  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<PendingReviewRowDto[]> {
    const response = await firstValueFrom(
      this.adminApiService.getNotificationMessageReviewsPending()
    );
    return response?.data ?? [];
  }
}
