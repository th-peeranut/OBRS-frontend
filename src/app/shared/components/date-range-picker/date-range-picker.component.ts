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
 * Presentational only: emits `{from, to}` once a range is complete, and leaves
 * validation (from<=to, a page's own max-span cap) to the caller. Every report
 * page already has that logic in its own `applyRange()`; this component does
 * not duplicate it.
 *
 * OBRS-1735 — it deliberately does NOT emit the half-picked state (start
 * chosen, end not yet), which it used to. Every caller's `applyRange()` clears
 * its `rangeError` before its own null guard, so a half-picked emit wiped a
 * message that was on screen and let the previous range's table come back with
 * nothing saying why. Under the two-field pattern this component replaces, the
 * other end was never null, so validation always re-ran in full — suppressing
 * the partial emit is what keeps that behaviour. Clearing the range (both ends
 * null) is still emitted: that IS a complete instruction.
 *
 * OBRS-1758 — the price of that silence, now paid. Because a half-pick emits
 * nothing, the parent's `@Input`s never change, `ngOnChanges` never fires, and
 * nothing writes the control's value back. PrimeNG then leaves the input box
 * showing the ONE date that was picked (`primeng-datepicker.mjs` writes the
 * start alone when the end is falsy, and `hideOverlay()` neither clears nor
 * restores) while the table below is still filtered by the range that IS
 * applied. No error, no signal, and it stays that way until the parent happens
 * to change the inputs. `onClose` puts the applied range back on screen.
 *
 * That fix needs the local `@Input` mutation gone, which is why it is: the old
 * `onValueChange` wrote the half-picked dates onto `from`/`to`, so restoring
 * from them would have restored the very state being discarded.
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
    if (from && !to) {
      return;
    }
    this.rangeChange.emit({ from, to });
  }

  /**
   * OBRS-1758: dismissing the popup mid-pick — Escape, or a click outside — puts the APPLIED
   * range back in the box.
   *
   * <p>A fresh array per close event, which does not contradict the stable-reference note above:
   * that one is about not handing `[ngModel]` a new identity on every change-detection pass, and
   * this runs once per user action.
   *
   * <p>Runs on every close, not only on a half-pick: after a complete pick `from`/`to` already
   * hold what was emitted, so re-seating them is a no-op rather than a special case to get wrong.
   */
  protected onClose(): void {
    this.value = [this.from, this.to];
  }
}
