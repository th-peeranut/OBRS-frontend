import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// OBRS-223: no shared `shared/validators` location exists yet in this
// codebase (grepped for ValidatorFn usage — every component that needs a
// custom validator defines it locally), so this lands beside the component
// that needs it, matching that convention.
//
// Rejects null / '' / non-numeric / 0 / negative / non-integer values, with a
// DISTINCT error key per failure reason so the template can show an accurate
// message — e.g. `1.5` is > 0, so a single "must be greater than 0" message
// would be wrong; it needs "must be a whole number" instead (`notInteger`).
// `Number('')` is 0, so the raw null/empty-string check must come first or an
// empty field would slip through as "0 is falsy... but not caught".
export const positiveIntegerValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const raw = control.value;
  if (raw === null || raw === undefined || raw === '') {
    return { positiveNumber: true };
  }

  const numericValue = Number(raw);
  if (Number.isNaN(numericValue)) {
    return { positiveNumber: true };
  }
  if (!Number.isInteger(numericValue)) {
    return { notInteger: true };
  }
  if (numericValue <= 0) {
    return { positiveNumber: true };
  }

  return null;
};
