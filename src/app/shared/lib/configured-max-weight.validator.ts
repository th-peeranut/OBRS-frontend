import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * OBRS-629 AC-3: the parcel weight cap, read from `GET /api/parcel-policy` instead of
 * `Validators.max(100)`. Replaces the literal `100` that was typed into both parcel forms while
 * `ParcelIntakeService#validateWeight` read `parcel.max_weight_kg` — so an admin lowering that
 * config changed nothing either form did, and the sender learnt the real cap from a 409.
 *
 * <p>`getMax` is a callback, not a value, on purpose: the policy arrives asynchronously AFTER the
 * FormGroup is built, and re-reading it on each validation run is what lets the form tighten
 * itself the moment the answer lands without tearing the control down.
 *
 * <p>A `null` max means "the server has not told us yet" and validates as VALID. That is
 * deliberate: the alternative is to invent a client-side cap to hold the line during the
 * round-trip, and an invented number displayed to a sender is the exact defect this replaces.
 * Nothing is lost by waiting — `validateWeight` still rejects an over-cap parcel at intake, so the
 * client rule was never the thing enforcing it.
 *
 * <p>Emits the standard `max` error key so callers keep the `errors['max']` branch they already
 * had, and carries `max` in the payload so the message can interpolate the real number.
 */
export function configuredMaxWeightValidator(getMax: () => number | null): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const max = getMax();
    if (max === null || max === undefined) {
      return null;
    }
    const value = control.value;
    if (value === null || value === '' || value === undefined) {
      return null;
    }
    const actual = Number(value);
    return actual > max ? { max: { max, actual } } : null;
  };
}
