import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// UX-OBRS-685 §4.1: `amount` is REQUIRED (paired with Validators.required on
// the control), > 0, up to 2 decimal places. `vatAmount` is OPTIONAL/nullable,
// >= 0, up to 2 decimal places — mirrors `vehicle-form-modal.validators.ts`'s
// convention (a distinct error key per failure reason) and
// `cargo-capacity.validators.ts`'s regex-based decimal-count check
// (`CARGO_CAPACITY_TOO_MANY_DECIMALS` shape).

/** `amount`: rejects blank/non-numeric/zero-or-negative. Blank is caught by
 * the separate `Validators.required` on the control — this validator only
 * judges a value that IS present. */
export const positiveAmountValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const raw = control.value;
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  const numericValue = Number(raw);
  if (Number.isNaN(numericValue) || numericValue <= 0) {
    return { positiveNumber: true };
  }

  return null;
};

/** `vatAmount`: blank is valid (optional field); a present value must be
 * >= 0. */
export const nonNegativeAmountValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const raw = control.value;
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  const numericValue = Number(raw);
  if (Number.isNaN(numericValue) || numericValue < 0) {
    return { negativeNumber: true };
  }

  return null;
};

/** Shared by both `amount` and `vatAmount` — blank is valid (each field's
 * own required-ness is enforced separately), a present value may carry at
 * most `maxDecimals` digits after the decimal point. */
export function tooManyDecimalsValidator(maxDecimals: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = String(control.value ?? '').trim();
    if (raw === '') {
      return null;
    }

    const decimalPart = raw.split('.')[1];
    if (decimalPart && decimalPart.length > maxDecimals) {
      return { tooManyDecimals: true };
    }

    return null;
  };
}
