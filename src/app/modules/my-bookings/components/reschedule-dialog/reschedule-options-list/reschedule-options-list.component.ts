import { Component, EventEmitter, Input, Output } from '@angular/core';
import dayjs from 'dayjs';
import { RescheduleOption } from '../../../../../shared/interfaces/reschedule.interface';
import { toAmountNumber } from '../../../../../shared/interfaces/my-booking.interface';

/** Dumb, radio-style selectable list of candidate departures. */
@Component({
    selector: 'app-reschedule-options-list',
    templateUrl: './reschedule-options-list.component.html',
    styleUrl: './reschedule-options-list.component.scss',
    standalone: false
})
export class RescheduleOptionsListComponent {
  @Input() options: RescheduleOption[] = [];
  @Input() loading = false;
  /** Options-load failure (e.g. the reschedule-options GET itself failed). */
  @Input() error: string | null = null;
  /**
   * A confirm-time failure that bounced the user back to this list (e.g.
   * `RESCHEDULE_ERROR_NO_SEATS` — the chosen candidate is no longer
   * available). Rendered as its own banner, independent of `loading`/`error`,
   * so re-showing the (still-valid) options list never silently swallows it.
   */
  @Input() confirmError: string | null = null;
  @Input() selectedScheduleId: number | null = null;
  @Output() readonly select = new EventEmitter<RescheduleOption>();

  onSelect(option: RescheduleOption): void {
    this.select.emit(option);
  }

  trackByScheduleId(_index: number, option: RescheduleOption): number {
    return option.scheduleId;
  }

  formatTime(value: string | undefined): string {
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format('HH:mm') : '-';
  }

  formatCurrency(value: number | string | undefined): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 2,
    }).format(toAmountNumber(value));
  }
}
