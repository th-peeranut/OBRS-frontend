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

// OBRS-842: the `vehicle_status` slug that excuses a vehicle from carrying a
// หมายเลขพาหนะ. Mirrors the backend's VehicleStatusConstant.RETIRED — a retired
// vehicle has handed its service-slot number to whichever vehicle replaced it,
// so `vehicles.vehicle_number` is nullable for that row alone (V58, OBRS-837).
export const RETIRED_VEHICLE_STATUS = 'retired';

/**
 * OBRS-842 / OBRS-837: `vehicleNumber` is required for every vehicle EXCEPT a
 * retired one — the exact rule the backend enforces in
 * `VehicleReqDto#isVehicleNumberValid` (`retired || hasNumber`).
 *
 * Deliberately NOT "any status that isn't active": `inactive` means the vehicle
 * is out of service but STILL in the fleet, so it still holds its number and the
 * backend rejects a blank one. Loosening this would let the form submit a payload
 * that comes back as a 400 the admin has no way to act on (the near-miss pinned
 * in the backend's `VehicleReqDtoValidationTest`).
 *
 * Reads the sibling `status` control off `control.parent`, so a control validated
 * with no parent (or before `status` is populated) is treated as NOT retired —
 * the safe direction, since the error only blocks a save that the server would
 * have rejected anyway.
 */
export function vehicleNumberRequiredUnlessRetiredValidator(
  statusControlName = 'status'
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const hasNumber = String(control.value ?? '').trim().length > 0;
    if (hasNumber) {
      return null;
    }

    const status = String(control.parent?.get(statusControlName)?.value ?? '')
      .trim()
      .toLowerCase();

    return status === RETIRED_VEHICLE_STATUS ? null : { requiredUnlessRetired: true };
  };
}

/**
 * OBRS-835: a GSM IMEI is exactly 15 decimal digits. The column is VARCHAR(20), so
 * length alone would wave through a typo'd 14-digit number — which then matches no
 * incoming GPS batch and simply shows up as a van that is never on the map, with no
 * error anywhere. Mirrors the backend's `@Pattern("\\d{15}")` on `VehicleReqDto#gpsImei`.
 *
 * Optional by design: blank means "no box fitted", which is the state every vehicle in
 * the fleet is in until its IMEI is entered. Blank must therefore be VALID here, and the
 * mapper turns it into `null` (never `''`) before it reaches a UNIQUE column.
 */
export const optionalGpsImeiValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (value.length === 0) {
    return null;
  }

  return /^\d{15}$/.test(value) ? null : { gpsImeiFormat: true };
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
