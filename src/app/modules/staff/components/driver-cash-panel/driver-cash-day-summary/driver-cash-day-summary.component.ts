import { Component, Input } from '@angular/core';
import { DriverCashDayRespDto } from '../../../../../shared/interfaces/driver-cash.interface';

/**
 * OBRS-960 — dumb: the running-totals pill row rendered directly under the
 * sticky context strip, above any action form (card: "one tap away is too
 * far"). No store/HTTP access.
 *
 * ⚠️ CORRECTED (2026-08-02, backend reconciliation) — `DriverCashDayRespDto`
 * is flat (no nested `summary` sub-object, which the first version of this
 * component read from), so this component now reads its four money totals
 * directly off `[day]`. The real DTO also carries `parcelRemitTotal`, which
 * the first version of this component never rendered at all — added here.
 */
@Component({
    selector: 'app-driver-cash-day-summary',
    templateUrl: './driver-cash-day-summary.component.html',
    styleUrl: './driver-cash-day-summary.component.scss',
    standalone: false
})
export class DriverCashDaySummaryComponent {
  @Input() day: DriverCashDayRespDto | null = null;
  @Input() isLoading = false;
}
