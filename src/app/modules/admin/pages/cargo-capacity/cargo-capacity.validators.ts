// OBRS-508: pure validation for the cargo-capacity (kg) input, shared by the
// cargo-capacity settings page (one row per vehicle type) and the schedule
// edit modal's per-trip override field. No shared `shared/validators`
// location exists yet (mirrors reminder-config-page.validators.ts's own
// note) — a plain function rather than a `ValidatorFn` because both
// consumers here read/write plain component state (a per-row input map, or a
// single form control's raw string), not a dedicated FormGroup this needs to
// plug into as a directive.

export const CARGO_CAPACITY_MIN_KG = 0.01;
export const CARGO_CAPACITY_MAX_DECIMALS = 2;

export type CargoCapacityValidationErrorCode =
  | 'INVALID_NUMBER'
  | 'TOO_MANY_DECIMALS'
  | 'BELOW_MIN';

export interface CargoCapacityValidationResult {
  /** Parsed numeric value, or `null` for both "empty" (valid — means
   * "not configured / inherit") and "invalid" (errorCode set). */
  value: number | null;
  errorCode: CargoCapacityValidationErrorCode | null;
}

// Empty input is ALWAYS valid — it means null ("not configured / inherit
// from the vehicle type"). This is the exact state the card exists to make
// visible rather than silently accept: the caller is responsible for warning
// the user what an empty value means (parcel booking refused), not this
// validator, which only judges whether a NON-empty value is a well-formed kg
// quota.
export function validateCargoCapacityKgInput(
  raw: string | number | null | undefined
): CargoCapacityValidationResult {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') {
    return { value: null, errorCode: null };
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { value: null, errorCode: 'INVALID_NUMBER' };
  }

  const decimalPart = trimmed.split('.')[1];
  if (decimalPart && decimalPart.length > CARGO_CAPACITY_MAX_DECIMALS) {
    return { value: null, errorCode: 'TOO_MANY_DECIMALS' };
  }

  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue) || numericValue < CARGO_CAPACITY_MIN_KG) {
    return { value: null, errorCode: 'BELOW_MIN' };
  }

  return { value: numericValue, errorCode: null };
}

// Maps an errorCode to its i18n key — kept here (not in the component) so
// every consumer of this validator shows the identical message for the
// identical failure reason.
export function cargoCapacityValidationErrorKey(
  errorCode: CargoCapacityValidationErrorCode | null
): string | null {
  switch (errorCode) {
    case 'INVALID_NUMBER':
      return 'ADMIN.VALIDATION.CARGO_CAPACITY_INVALID';
    case 'TOO_MANY_DECIMALS':
      return 'ADMIN.VALIDATION.CARGO_CAPACITY_TOO_MANY_DECIMALS';
    case 'BELOW_MIN':
      return 'ADMIN.VALIDATION.CARGO_CAPACITY_BELOW_MIN';
    default:
      return null;
  }
}
