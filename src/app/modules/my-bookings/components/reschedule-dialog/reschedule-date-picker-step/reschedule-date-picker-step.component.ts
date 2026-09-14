import { Component, EventEmitter, Input, Output, Signal } from '@angular/core';
import { LanguageService } from '../../../../../shared/services/language.service';

/**
 * Dumb "pick a new departure date" step. Emits the chosen date as
 * `YYYY-MM-DD` (the shape `GET .../reschedule-options?date=` expects).
 */
@Component({
    selector: 'app-reschedule-date-picker-step',
    templateUrl: './reschedule-date-picker-step.component.html',
    styleUrl: './reschedule-date-picker-step.component.scss',
    standalone: false
})
export class RescheduleDatePickerStepComponent {
  @Input() minDate: Date | null = null;
  @Input() maxDate: Date | null = null;
  @Input() selectedDate: Date | null = null;
  @Output() readonly dateSelected = new EventEmitter<string>();

  /** OBRS-1037: the picker's `dateFormat`, live per language. A hardcoded `dd/mm/yy`
   *  showed an English reader Thai field order on the screen where they move a ticket
   *  they have already paid for. Must stay a BINDING, not a value read once: PrimeNG
   *  repaints text already in the input only when `dateFormat` itself changes
   *  (OBRS-1023). */
  readonly calendarDateFormat: Signal<string | undefined>;

  constructor(languageService: LanguageService) {
    this.calendarDateFormat = languageService.calendarDateFormat;
  }

  onSelect(value: Date): void {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return;
    }
    this.dateSelected.emit(this.toIsoDate(value));
  }

  private toIsoDate(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
