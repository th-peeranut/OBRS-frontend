import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { PaymentDirection } from '../../../../../shared/interfaces/reschedule.interface';
import { toAmountNumber } from '../../../../../shared/interfaces/my-booking.interface';
import { formatMoney } from '../../../../../shared/lib/money-display';

/**
 * Structural subset of `RescheduleEstimate`/`ChangeStopEstimate` this dumb
 * component actually renders. `rescheduleFee` is optional so the same
 * component doubles as the change-stop dialog's estimate step via
 * `[hideFee]="true"` — `ChangeStopEstimate` has no fee field at all, since
 * change-stop charges no fee (design-system §10: extend the shared
 * component with an additive input, don't fork a near-duplicate).
 */
export interface EstimateSummaryEstimate {
  oldFare: number | string;
  newFare: number | string;
  fareDiff: number | string;
  rescheduleFee?: number | string;
  netAmount: number | string;
  paymentDirection: PaymentDirection;
}

/** Dumb cost-preview step — shows the fare diff, fee (unless `hideFee`), and
 * net amount/direction. Reused as-is by `ChangeStopDialogComponent`
 * (OBRS-110 wave 2) via `[hideFee]="true"` + `[i18nPrefix]="'MY_BOOKINGS.CHANGE_STOP'"`;
 * the default `i18nPrefix` keeps the existing reschedule call site
 * byte-identical. */
@Component({
    selector: 'app-reschedule-estimate-summary',
    templateUrl: './reschedule-estimate-summary.component.html',
    styleUrl: './reschedule-estimate-summary.component.scss',
    standalone: false
})
export class RescheduleEstimateSummaryComponent {
  @Input() estimate: EstimateSummaryEstimate | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() submitting = false;
  /** Hides the fee row entirely — change-stop charges no fee, unlike
   * reschedule's `rescheduleFee`. Defaults to `false` so the existing
   * reschedule call site is unaffected. */
  @Input() hideFee = false;
  /** i18n namespace this component's own labels resolve under. Defaults to
   * the original reschedule namespace so the existing call site stays
   * byte-identical; the change-stop dialog passes `'MY_BOOKINGS.CHANGE_STOP'`
   * so it gets its own translated copy rather than leaking reschedule's. */
  @Input() i18nPrefix = 'MY_BOOKINGS.RESCHEDULE';
  @Output() readonly confirm = new EventEmitter<void>();
  @Output() readonly back = new EventEmitter<void>();

  constructor(private readonly translate: TranslateService) {}

  onConfirm(): void {
    if (this.loading || this.submitting || !this.estimate) {
      return;
    }
    this.confirm.emit();
  }

  onBack(): void {
    this.back.emit();
  }

  get loadingLabelKey(): string {
    return `${this.i18nPrefix}.ESTIMATE.LOADING`;
  }

  get oldFareLabelKey(): string {
    return `${this.i18nPrefix}.ESTIMATE.OLD_FARE`;
  }

  get newFareLabelKey(): string {
    return `${this.i18nPrefix}.ESTIMATE.NEW_FARE`;
  }

  get feeLabelKey(): string {
    return `${this.i18nPrefix}.ESTIMATE.FEE`;
  }

  get backButtonLabelKey(): string {
    return `${this.i18nPrefix}.BACK_BUTTON`;
  }

  get confirmButtonLabelKey(): string {
    return `${this.i18nPrefix}.CONFIRM_BUTTON`;
  }

  get paymentDirectionLabelKey(): string {
    switch (this.estimate?.paymentDirection) {
      case 'TOP_UP':
        return `${this.i18nPrefix}.ESTIMATE.TOP_UP`;
      case 'REFUND':
        return `${this.i18nPrefix}.ESTIMATE.REFUND`;
      default:
        return `${this.i18nPrefix}.ESTIMATE.NO_PAYMENT`;
    }
  }

  get netAmountAbsLabel(): string {
    return this.formatCurrency(Math.abs(toAmountNumber(this.estimate?.netAmount)));
  }

  formatCurrency(value: number | string | undefined): string {
    return formatMoney(toAmountNumber(value), this.translate.currentLang);
  }
}
