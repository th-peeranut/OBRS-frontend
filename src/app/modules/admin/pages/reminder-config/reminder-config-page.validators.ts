import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// OBRS-223: no shared `shared/validators` location exists yet in this
// codebase (grepped for ValidatorFn usage — every component that needs a
// custom validator defines it locally), so this lands beside the component
// that needs it, matching that convention.
//
// Rejects null / '' / non-numeric / 0 / negative / non-integer values.
// `Number('')` is 0, so the raw null/empty-string check must come first or an
// empty field would slip through as "0 is falsy... but not caught".
export const positiveIntegerValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const raw = control.value;
  if (raw === null || raw === undefined || raw === '') {
    return { positiveInteger: true };
  }

  const numericValue = Number(raw);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return { positiveInteger: true };
  }

  return null;
};
