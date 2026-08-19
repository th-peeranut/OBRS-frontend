import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// OBRS-699: same "no shared validators location" convention as
// booking-policy-config-page.validators.ts (whose own header records it), so
// these land beside the component that needs them. The per-field
// integerRangeValidator is IMPORTED from that file rather than copied — a
// third copy of it is the drift its header warns about.
//
// All three are FormGroup-level: each reads two sibling controls, so neither
// control alone can own the rule. Each returns null while either operand is
// blank or non-numeric, so a half-typed form shows the FIELD's own error and
// never a confusing cross-field one on top of it.

function numeric(group: AbstractControl, name: string): number | null {
  const raw = group.get(name)?.value;
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** BR-4: the early/late boundary must sit ABOVE the cancellation window, or
 * the late refund rate can never apply. */
export function earlyWindowAboveCancelWindow(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const early = numeric(group, 'earlyWindowHours');
    const cancel = numeric(group, 'cancelWindowHours');
    if (early === null || cancel === null) {
      return null;
    }
    return early > cancel ? null : { earlyNotAboveCancel: true };
  };
}

/** BR-4: the same boundary must sit ABOVE the reschedule window, or the late
 * reschedule fee can never be charged. */
export function earlyWindowAboveRescheduleWindow(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const early = numeric(group, 'earlyWindowHours');
    const reschedule = numeric(group, 'rescheduleWindowHours');
    if (early === null || reschedule === null) {
      return null;
    }
    return early > reschedule ? null : { earlyNotAboveReschedule: true };
  };
}

/** BR-5 / LOCKED DECISION D-2: cancelling sooner may not refund less. The
 * backend rejects the inverse with 400, so this is a hint that saves a
 * round-trip, never the enforcement. */
export function earlyRateNotBelowLateRate(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const early = numeric(group, 'cancelRefundRateEarlyPct');
    const late = numeric(group, 'cancelRefundRateLatePct');
    if (early === null || late === null) {
      return null;
    }
    return early >= late ? null : { earlyRateBelowLate: true };
  };
}
