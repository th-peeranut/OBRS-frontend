import {
  cargoCapacityValidationErrorKey,
  validateCargoCapacityKgInput,
} from './cargo-capacity.validators';

describe('validateCargoCapacityKgInput', () => {
  it('treats empty string as valid null (not configured / inherit)', () => {
    expect(validateCargoCapacityKgInput('')).toEqual({ value: null, errorCode: null });
  });

  it('treats null/undefined as valid null', () => {
    expect(validateCargoCapacityKgInput(null)).toEqual({ value: null, errorCode: null });
    expect(validateCargoCapacityKgInput(undefined)).toEqual({ value: null, errorCode: null });
  });

  it('treats whitespace-only input as empty (valid null)', () => {
    expect(validateCargoCapacityKgInput('   ')).toEqual({ value: null, errorCode: null });
  });

  it('accepts a whole number', () => {
    expect(validateCargoCapacityKgInput('200')).toEqual({ value: 200, errorCode: null });
  });

  it('accepts up to 2 decimal places', () => {
    expect(validateCargoCapacityKgInput('200.5')).toEqual({ value: 200.5, errorCode: null });
    expect(validateCargoCapacityKgInput('200.55')).toEqual({ value: 200.55, errorCode: null });
  });

  it('accepts the minimum boundary value 0.01', () => {
    expect(validateCargoCapacityKgInput('0.01')).toEqual({ value: 0.01, errorCode: null });
  });

  it('rejects more than 2 decimal places with TOO_MANY_DECIMALS', () => {
    expect(validateCargoCapacityKgInput('200.555')).toEqual({
      value: null,
      errorCode: 'TOO_MANY_DECIMALS',
    });
  });

  it('rejects a value below the minimum with BELOW_MIN', () => {
    expect(validateCargoCapacityKgInput('0')).toEqual({ value: null, errorCode: 'BELOW_MIN' });
    expect(validateCargoCapacityKgInput('0.001')).toEqual({
      value: null,
      errorCode: 'TOO_MANY_DECIMALS', // caught by the decimal-count check first
    });
  });

  it('rejects a negative number with INVALID_NUMBER (fails the numeric-shape regex)', () => {
    expect(validateCargoCapacityKgInput('-5')).toEqual({ value: null, errorCode: 'INVALID_NUMBER' });
  });

  it('rejects non-numeric input with INVALID_NUMBER', () => {
    expect(validateCargoCapacityKgInput('abc')).toEqual({
      value: null,
      errorCode: 'INVALID_NUMBER',
    });
  });

  it('rejects a malformed decimal (trailing dot) with INVALID_NUMBER', () => {
    expect(validateCargoCapacityKgInput('200.')).toEqual({
      value: null,
      errorCode: 'INVALID_NUMBER',
    });
  });

  it('accepts a numeric type input directly (not just strings)', () => {
    expect(validateCargoCapacityKgInput(150)).toEqual({ value: 150, errorCode: null });
  });
});

describe('cargoCapacityValidationErrorKey', () => {
  it('maps each error code to a distinct i18n key', () => {
    expect(cargoCapacityValidationErrorKey('INVALID_NUMBER')).toBe(
      'ADMIN.VALIDATION.CARGO_CAPACITY_INVALID'
    );
    expect(cargoCapacityValidationErrorKey('TOO_MANY_DECIMALS')).toBe(
      'ADMIN.VALIDATION.CARGO_CAPACITY_TOO_MANY_DECIMALS'
    );
    expect(cargoCapacityValidationErrorKey('BELOW_MIN')).toBe(
      'ADMIN.VALIDATION.CARGO_CAPACITY_BELOW_MIN'
    );
  });

  it('returns null for null (no error)', () => {
    expect(cargoCapacityValidationErrorKey(null)).toBeNull();
  });
});
