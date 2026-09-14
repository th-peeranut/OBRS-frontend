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

  /**
   * OBRS-1755 — additive, `true` by default so `driver-cash-panel` is unchanged.
   *
   * The "ส่งยอด" tab embeds this form under a screen that has exactly ONE
   * primary button (owner ruling 2026-09-09: the "บันทึกเงินทดรอง" button was
   * removed), so there it renders the field without its own submit. The form is
   * otherwise identical — including the `ngOnChanges` clear-on-success contract
   * below, which that tab drives the same way the panel does.
   */
  @Input() showSubmit = true;

  /**
   * OBRS-1755 — additive. Emits the raw text on every keystroke so a host can
   * move a dependent figure live (the tab's "หักเงินที่คนขับขอเบิกไป" row).
   * `driver-cash-panel` binds nothing to it, so nothing changes there.
   */
  @Output() amountChange = new EventEmitter<string>();

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

  /** OBRS-1755: the `[(ngModel)]` write, split so the raw text can also be published. */
  protected onAmountInput(value: string): void {
    this.amountInput = value;
    this.amountChange.emit(value);
  }

  protected get canSubmit(): boolean {
    return !this.isSubmitting && this.amountCents !== null && this.amountCents > 0;
  }

  protected onSubmit(): void {
    if (!this.canSubmit) return;
    this.submitAdvance.emit({ amount: this.amountInput.trim() });
  }
}
