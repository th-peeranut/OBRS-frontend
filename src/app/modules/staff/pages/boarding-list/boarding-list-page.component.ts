import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../auth/auth.service';

/**
 * OBRS-130: thin route wrapper around the shared `app-boarding-list`
 * component — reads `scheduleId` from the route once and passes it through
 * as an `[Input]`. All store/API/scan/board/unboard logic now lives in
 * `BoardingListComponent` (`shared/components/boarding-list/`), which is
 * also mounted directly inside the Sell Tab-3 walk-in panel. This wrapper
 * must NOT call `store.setScheduleId()` itself (see the shared component's
 * single-owner re-bind contract) — passing `[scheduleId]` is enough.
 *
 * OBRS-960: also renders `app-driver-cash-panel` — ONLY for a salesperson.
 * `driver`/`salesperson` share this route (`staff.module.ts`'s
 * `requiredRoles: ['driver', 'salesperson']`), but a driver never handles
 * cash — same "view selection, not authorization" idiom
 * `BoardingEntryPageComponent` already established for this exact route
 * family (`this.authService.hasAnyRole(['salesperson'])`).
 */
@Component({
    selector: 'app-boarding-list-page',
    templateUrl: './boarding-list-page.component.html',
    standalone: false
})
export class BoardingListPageComponent {
  protected readonly scheduleId: number;
  protected readonly isSalesperson: boolean;

  constructor(route: ActivatedRoute, authService: AuthService) {
    this.scheduleId = Number(route.snapshot.paramMap.get('scheduleId'));
    this.isSalesperson = authService.hasAnyRole(['salesperson']);
  }
}
