import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RescheduleEstimate } from '../../../../../shared/interfaces/reschedule.interface';
import { toAmountNumber } from '../../../../../shared/interfaces/my-booking.interface';

/** Dumb cost-preview step — shows the fare diff, fee, and net amount/direction. */
@Component({
  selector: 'app-reschedule-estimate-summary',
  templateUrl: './reschedule-estimate-summary.component.html',
  styleUrl: './reschedule-estimate-summary.component.scss',
})
export class RescheduleEstimateSummaryComponent {
  @Input() estimate: RescheduleEstimate | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() submitting = false;
  @Output() readonly confirm = new EventEmitter<void>();
  @Output() readonly back = new EventEmitter<void>();

  onConfirm(): void {
    if (this.loading || this.submitting || !this.estimate) {
      return;
    }
    this.confirm.emit();
  }

  onBack(): void {
    this.back.emit();
  }

  get paymentDirectionLabelKey(): string {
    switch (this.estimate?.paymentDirection) {
      case 'TOP_UP':
        return 'MY_BOOKINGS.RESCHEDULE.ESTIMATE.TOP_UP';
      case 'REFUND':
        return 'MY_BOOKINGS.RESCHEDULE.ESTIMATE.REFUND';
      default:
        return 'MY_BOOKINGS.RESCHEDULE.ESTIMATE.NO_PAYMENT';
    }
  }

  get netAmountAbsLabel(): string {
    return this.formatCurrency(Math.abs(toAmountNumber(this.estimate?.netAmount)));
  }

  formatCurrency(value: number | string | undefined): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 2,
    }).format(toAmountNumber(value));
  }
}
