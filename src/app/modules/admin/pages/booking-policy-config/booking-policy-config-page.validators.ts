import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// OBRS-564: same "no shared shared/validators location" convention as
// reminder-config-page.validators.ts (its own comment: no ValidatorFn utility
// module exists in this codebase — every component defines its own locally),
// so this lands beside the component that needs it.
//
// Distinct from reminder-config-page.validators.ts's positiveIntegerValidator:
// both booking-policy fields are backend-validated as a CLOSED range
// (maxAdvanceDays 1-365, cutoffMinutes 1-1440 — see admin.module.ts route
// comment), not merely "positive", so this takes the bounds as factory
// arguments and returns a distinct error key per failure reason:
// - `required`: blank/null/undefined (`Number('')` is 0, so this check must
//   come first or an empty field would slip through as "0 is falsy... but
//   not caught").
// - `notInteger`: a numeric-but-non-whole value (e.g. 1.5) — NOT the same
//   problem as being out of range (1.5 could be well inside [1, 365]).
// - `outOfRange`: a whole number outside [min, max], carrying `{ min, max }`
//   so the template can interpolate the exact bound into the message
//   (ADMIN.VALIDATION.INTEGER_RANGE).
export function integerRangeValidator(min: number, max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value;
    if (raw === null || raw === undefined || raw === '') {
      return { required: true };
    }

    const numericValue = Number(raw);
    if (Number.isNaN(numericValue)) {
      return { required: true };
    }
    if (!Number.isInteger(numericValue)) {
      return { notInteger: true };
    }
    if (numericValue < min || numericValue > max) {
      return { outOfRange: { min, max } };
    }

    return null;
  };
}
