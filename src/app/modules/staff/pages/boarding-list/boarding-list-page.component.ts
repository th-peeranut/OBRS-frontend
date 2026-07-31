import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * OBRS-130: thin route wrapper around the shared `app-boarding-list`
 * component — reads `scheduleId` from the route once and passes it through
 * as an `[Input]`. All store/API/scan/board/unboard logic now lives in
 * `BoardingListComponent` (`shared/components/boarding-list/`), which is
 * also mounted directly inside the Sell Tab-3 walk-in panel. This wrapper
 * must NOT call `store.setScheduleId()` itself (see the shared component's
 * single-owner re-bind contract) — passing `[scheduleId]` is enough.
 */
@Component({
    selector: 'app-boarding-list-page',
    templateUrl: './boarding-list-page.component.html',
    standalone: false
})
export class BoardingListPageComponent {
  protected readonly scheduleId: number;

  constructor(route: ActivatedRoute) {
    this.scheduleId = Number(route.snapshot.paramMap.get('scheduleId'));
  }
}
