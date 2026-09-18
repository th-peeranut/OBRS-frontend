import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * `Validators.minLength`/`maxLength` count the RAW value, but a form that `.trim()`s on its way
 * to the wire does not send the value that was measured: `" a"` passes a 2-character minimum in
 * the browser and arrives at the server as `"a"` — one character — where a `@Size(min = 2)`
 * rejects it. `buildContactPayload()` in `passenger-info.component.ts` trims exactly like that.
 * This validator measures what will actually be sent.
 *
 * On a caller that does NOT trim (`buildPassengersPayload()` in the same file sends names raw)
 * the trimmed length is simply the stricter of the two, since trimming only removes characters —
 * so it can never let through a value the server would refuse, and both forms can carry one rule.
 *
 * OBRS-1952: written for the booking funnel's name fields, whose backend rule is
 * `@Size(min = 2, max = 50)` on both `ContactReqDto` and `PassengerReqDto`.
 *
 * Empty (or whitespace-only) returns null: `required`/`trimmedRequiredValidator` owns the empty
 * case, so the two errors never stack, and an OPTIONAL control gets "blank, or between min and
 * max" — which is what a nullable `@Size` field means on the wire (an empty middle name is sent
 * as `null`, not `""`).
 *
 * Error shape is Angular's own `{ minlength: { requiredLength, actualLength } }` /
 * `{ maxlength: ... }`, so `hasError('minlength')` bindings read the same as anywhere else.
 */
export function trimmedLengthValidator(min: number, max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const trimmed = (control.value ?? '').toString().trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.length < min) {
      return { minlength: { requiredLength: min, actualLength: trimmed.length } };
    }

    if (trimmed.length > max) {
      return { maxlength: { requiredLength: max, actualLength: trimmed.length } };
    }

    return null;
  };
}
