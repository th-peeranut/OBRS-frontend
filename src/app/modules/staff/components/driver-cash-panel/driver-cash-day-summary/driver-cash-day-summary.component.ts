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

  /**
   * OBRS-1053 — the clawback pill appears ONLY when there is something to
   * explain. It is zero on every day that had no cancelled consigned parcel,
   * which today is every day on prod (both share percentages are still at
   * their `0` default, so OBRS-992 writes no clawback rows at all); a sixth
   * permanently-`0.00` pill in a five-pill row would be pure noise on the
   * one screen whose whole point is a driver reading his numbers fast.
   */
  protected get hasParcelClawback(): boolean {
    return Number(this.day?.parcelClawbackTotal ?? 0) > 0;
  }
}
