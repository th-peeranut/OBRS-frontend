import { Component, Input } from '@angular/core';
import { DriverCashDaySummaryDto } from '../../../../../shared/interfaces/driver-cash.interface';

/**
 * OBRS-960 — dumb: the running-totals pill row rendered directly under the
 * sticky context strip, above any action form (card: "one tap away is too
 * far"). No store/HTTP access.
 */
@Component({
    selector: 'app-driver-cash-day-summary',
    templateUrl: './driver-cash-day-summary.component.html',
    styleUrl: './driver-cash-day-summary.component.scss',
    standalone: false
})
export class DriverCashDaySummaryComponent {
  @Input() summary: DriverCashDaySummaryDto | null = null;
  @Input() isLoading = false;
}
