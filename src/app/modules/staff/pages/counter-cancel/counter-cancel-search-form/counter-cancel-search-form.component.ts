import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { THAI_LOCAL_PHONE_PATTERN } from '../../../../../shared/constants/thai-msisdn';

export type CounterCancelSearchMode = 'phone' | 'bookingNumber';

export interface CounterCancelSearchEvent {
  mode: CounterCancelSearchMode;
  value: string;
}

/**
 * OBRS-766 — the search-mode toggle + one live query field. Dumb component,
 * `[submitting]` in, `(search)` out.
 *
 * Mode toggle reuses the exact primitive `OverrideCancelModalComponent`'s
 * `.override-rate-toggle` already established: two `.admin-btn` elements in a
 * `role="group"` container with `[class.is-selected]` + `aria-pressed` — NOT
 * `p-selectButton` (FRONTEND-GOTCHAS: its unselected segments have a known
 * dark-mode gap, `allowEmpty` defaults true) and not the `nav-tabs` idiom.
 *
 * Only ONE query field is ever mounted (`*ngIf="mode === '…'"`); the hidden
 * one carries no validators and its value is never read — so the client can
 * never send both `phone` and `bookingNumber` and can never itself trip the
 * backend's `booking.search.error.criteria-required`.
 */
@Component({
  selector: 'app-counter-cancel-search-form',
  templateUrl: './counter-cancel-search-form.component.html',
  styleUrl: './counter-cancel-search-form.component.scss',
})
export class CounterCancelSearchFormComponent implements OnChanges {
  @Input() submitting = false;
  @Output() readonly search = new EventEmitter<CounterCancelSearchEvent>();

  protected mode: CounterCancelSearchMode = 'phone';
  protected readonly form: FormGroup;

  constructor(private readonly formBuilder: FormBuilder) {
    this.form = this.formBuilder.group({
      phone: [''],
      bookingNumber: [''],
    });
    this.applyValidators();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Disable/enable the live control to match [submitting] — mirrors the
    // [disabled] bindings every other staff form applies to its buttons.
    if (changes['submitting']) {
      const activeControl = this.form.get(this.mode);
      if (this.submitting) {
        activeControl?.disable({ emitEvent: false });
      } else {
        activeControl?.enable({ emitEvent: false });
      }
    }
  }

  protected selectMode(mode: CounterCancelSearchMode): void {
    if (this.submitting || this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.form.reset({ phone: '', bookingNumber: '' });
    this.applyValidators();
  }

  /** phone branch: `STAFF.VALIDATION.REQUIRED`/`PHONE_INVALID`, the exact
   * pair `parcel-consign-form.component.ts`'s `senderPhone` field already
   * uses — `THAI_LOCAL_PHONE_PATTERN` is the right rule here for the same
   * reason it is there: this number is never texted, it is a passenger's own
   * number being matched, so the wider "any Thai local number" rule (not the
   * SMS-destination-only `THAI_MOBILE_PATTERN`) applies.
   *
   * bookingNumber branch: required only, per the UX spec — a malformed value
   * is just another exact-match miss, honestly reported by the empty state,
   * not a client-side format rule to maintain against a shape that isn't
   * ours to define. */
  private applyValidators(): void {
    const phone = this.form.get('phone');
    const bookingNumber = this.form.get('bookingNumber');

    if (this.mode === 'phone') {
      phone?.setValidators([Validators.required, Validators.pattern(THAI_LOCAL_PHONE_PATTERN)]);
      bookingNumber?.clearValidators();
    } else {
      bookingNumber?.setValidators([Validators.required]);
      phone?.clearValidators();
    }
    phone?.updateValueAndValidity({ emitEvent: false });
    bookingNumber?.updateValueAndValidity({ emitEvent: false });
  }

  /** Upper-cases the booking-number field as the operator types (`B-XXXXXX`
   * shape) — `emitEvent: false` so this programmatic write doesn't re-trigger
   * validity churn beyond the keystroke that already will. */
  protected onBookingNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upper = input.value.toUpperCase();
    if (upper !== input.value) {
      input.value = upper;
    }
    this.form.get('bookingNumber')?.setValue(upper, { emitEvent: false });
  }

  protected get activeFieldInvalid(): boolean {
    const control = this.form.get(this.mode);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  protected get phoneErrorKey(): string {
    const control = this.form.get('phone');
    if (control?.hasError('required')) {
      return 'STAFF.VALIDATION.REQUIRED';
    }
    return 'STAFF.VALIDATION.PHONE_INVALID';
  }

  protected submit(): void {
    const control = this.form.get(this.mode);
    if (!control || control.invalid) {
      control?.markAsTouched();
      return;
    }
    const value = String(control.value ?? '').trim();
    this.search.emit({ mode: this.mode, value });
  }
}
