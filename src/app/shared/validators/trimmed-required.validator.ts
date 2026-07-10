import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * `Validators.required` only rejects empty/null/undefined — a whitespace-only
 * string ("   ") satisfies it. Use this validator instead wherever leading/
 * trailing whitespace must not count as a value (e.g. a password field, where
 * the backend would reject a blank-after-trim value with a confusing error).
 *
 * Promoted from `verify-email.component.ts` (OBRS-84): the change-email
 * dialog's current-password field needed the same behavior, so this is now
 * the single shared source rather than a second local copy.
 */
export function trimmedRequiredValidator(
  control: AbstractControl
): ValidationErrors | null {
  return control.value?.trim() ? null : { required: true };
}
