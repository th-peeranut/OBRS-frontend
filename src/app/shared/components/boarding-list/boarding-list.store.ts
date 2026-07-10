import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';
import { AdminCollectionStore } from '../../../modules/admin/shared/admin-collection-store';
import { BoardingListItemDto, StaffApiService } from '../../../services/staff/staff-api.service';

/**
 * OBRS-130: deliberately **not** `providedIn: 'root'` (unlike every other
 * `AdminCollectionStore` subclass). `BoardingListComponent` is the only
 * consumer and is mounted in two places (the driver route and the Sell
 * Tab-3 panel) that must never share one cached manifest — a driver's
 * schedule-scoped boarding list and a salesperson's walk-in-selected-trip
 * boarding list are different data for different scheduleIds, and a
 * root-scoped singleton would leak one mount's cache into the other on
 * remount. `providers: [BoardingListStore]` on the component gives each
 * mount its own instance instead. This forfeits the cross-navigation
 * stale-while-revalidate replay the base class normally gives (re-entering
 * the driver route re-fetches instead of replaying a cached value) — a
 * deliberate, correct trade for live boarding data that must never go stale
 * across mounts.
 */
@Injectable()
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
