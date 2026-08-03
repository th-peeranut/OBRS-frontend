import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { toCents } from '../../../../../shared/lib/money-cents';

/**
 * OBRS-960 — dumb: the cash-advance action's inline form (one-tap-expand,
 * no modal/navigation per the card). Money is a decimal STRING; parsed via
 * the shared `toCents()` convention, never float arithmetic.
 *
 * On a POST failure the parent panel passes `[submitError]` back and this
 * form does NOT reset — the input value is untouched local state, so it
 * stays populated for the salesperson to retry (card: "never reset the form
 * on a POST failure").
 */
@Component({
    selector: 'app-driver-cash-advance-form',
    templateUrl: './driver-cash-advance-form.component.html',
    styleUrl: './driver-cash-advance-form.component.scss',
    standalone: false
})
export class DriverCashAdvanceFormComponent implements OnChanges {
  @Input() isSubmitting = false;
  @Input() submitError: string | null = null;
  @Output() submitAdvance = new EventEmitter<{ amount: string }>();

  protected amountInput = '';

  ngOnChanges(changes: SimpleChanges): void {
    // A successful submit is signalled by the parent flipping isSubmitting
    // back to false WITHOUT a submitError — clear the input then (never on
    // a failure, per the doc comment above).
    if (
      changes['isSubmitting'] &&
      changes['isSubmitting'].previousValue === true &&
      !this.isSubmitting &&
      !this.submitError
    ) {
      this.amountInput = '';
    }
  }

  protected get amountCents(): number | null {
    return toCents(this.amountInput);
  }

  protected get canSubmit(): boolean {
    return !this.isSubmitting && this.amountCents !== null && this.amountCents > 0;
  }

  protected onSubmit(): void {
    if (!this.canSubmit) return;
    this.submitAdvance.emit({ amount: this.amountInput.trim() });
  }
}
