import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// OBRS-316 Gap 1: the 7 new vehicle-attribute fields (brand/model/manufactureYear/
// colour/engineCc/chassisNumber/note) are ALL optional (design-system §3.1 — no
// required marker, no pre-seeded default), so their numeric validators must treat
// null/undefined/'' as VALID and only reject a value the admin actually typed. This
// is the deliberate difference from reminder-config-page.validators.ts's
// `positiveIntegerValidator`, which treats blank as invalid (its field is required).
// Mirrors that file's convention of a DISTINCT error key per failure reason so the
// template can show an accurate message.

export const optionalPositiveIntegerValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const raw = control.value;
  if (raw === null || raw === undefined || raw === '') {
    return null;
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

export function optionalYearRangeValidator(min: number, max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value;
    if (raw === null || raw === undefined || raw === '') {
      return null;
    }

    const numericValue = Number(raw);
    if (Number.isNaN(numericValue)) {
      return { yearRange: true };
    }
    if (!Number.isInteger(numericValue)) {
      return { notInteger: true };
    }
    if (numericValue < min || numericValue > max) {
      return { yearRange: true };
    }

    return null;
  };
}
