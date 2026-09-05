import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

/**
 * OBRS-1734 — one control, one popup, both ends of a range. Replaces the
 * app's original pattern of two side-by-side `p-datePicker` fields (one
 * `fromDate`, one `toDate`) for a report's date-range filter.
 *
 * Presentational only: emits `{from, to}` on every PrimeNG range selection —
 * including the intermediate state where only the start has been picked —
 * and leaves validation (from<=to, a page's own max-span cap) to the caller.
 * Every report page already has that logic in its own `applyRange()`; this
 * component does not duplicate it.
 */
@Component({
  selector: 'app-admin-date-range-picker',
  templateUrl: './date-range-picker.component.html',
  standalone: false,
})
export class DateRangePickerComponent implements OnChanges {
  @Input() from: Date | null = null;
  @Input() to: Date | null = null;
  @Output() readonly rangeChange = new EventEmitter<DateRange>();

  // Two months in one popup is what makes a combined range picker worth
  // having over two separate fields; below the 640px breakpoint the existing
  // `.app-date-field-panel` collapses to one month, so the picker follows.
  protected readonly numberOfMonths = 2;
  protected readonly responsiveOptions = [{ breakpoint: '640px', numMonths: 1 }];

  // PrimeNG's own range value shape. Kept as a stable array reference across
  // change-detection cycles: `[ngModel]` treats a new array identity as a
  // changed value on every check, which drove NgModel to call writeValue()
  // on the DatePicker every tick and re-trigger change detection — a
  // synchronous loop that never yielded back to the browser.
  protected value: [Date | null, Date | null] = [this.from, this.to];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['from'] || changes['to']) {
      this.value = [this.from, this.to];
    }
  }

  protected onValueChange(value: [Date | null, Date | null] | null): void {
    const [from, to] = value ?? [null, null];
    this.from = from;
    this.to = to;
    this.rangeChange.emit({ from, to });
  }
}
