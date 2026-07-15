import { FormControl } from '@angular/forms';
import {
  optionalPositiveIntegerValidator,
  optionalYearRangeValidator,
} from './vehicle-form-modal.validators';

describe('vehicle-form-modal.validators', () => {
  describe('optionalPositiveIntegerValidator', () => {
    it('treats null/undefined/empty-string as valid (field is optional)', () => {
      expect(optionalPositiveIntegerValidator(new FormControl(null))).toBeNull();
      expect(optionalPositiveIntegerValidator(new FormControl(undefined))).toBeNull();
      expect(optionalPositiveIntegerValidator(new FormControl(''))).toBeNull();
    });

    it('accepts a positive integer', () => {
      expect(optionalPositiveIntegerValidator(new FormControl(2982))).toBeNull();
      expect(optionalPositiveIntegerValidator(new FormControl(1))).toBeNull();
    });

    it('rejects a non-integer with notInteger', () => {
      expect(optionalPositiveIntegerValidator(new FormControl(1.5))).toEqual({ notInteger: true });
    });

    it('rejects zero/negative with positiveNumber', () => {
      expect(optionalPositiveIntegerValidator(new FormControl(0))).toEqual({ positiveNumber: true });
      expect(optionalPositiveIntegerValidator(new FormControl(-5))).toEqual({ positiveNumber: true });
    });

    it('rejects a non-numeric string with positiveNumber', () => {
      expect(optionalPositiveIntegerValidator(new FormControl('abc'))).toEqual({ positiveNumber: true });
    });
  });

  describe('optionalYearRangeValidator', () => {
    const validator = optionalYearRangeValidator(1980, 2027);

    it('treats null/undefined/empty-string as valid (field is optional)', () => {
      expect(validator(new FormControl(null))).toBeNull();
      expect(validator(new FormControl(undefined))).toBeNull();
      expect(validator(new FormControl(''))).toBeNull();
    });

    it('accepts a year within [min, max] inclusive', () => {
      expect(validator(new FormControl(1980))).toBeNull();
      expect(validator(new FormControl(2027))).toBeNull();
      expect(validator(new FormControl(2019))).toBeNull();
    });

    it('rejects a non-integer with notInteger', () => {
      expect(validator(new FormControl(2019.5))).toEqual({ notInteger: true });
    });

    it('rejects an out-of-range year with yearRange', () => {
      expect(validator(new FormControl(1979))).toEqual({ yearRange: true });
      expect(validator(new FormControl(2028))).toEqual({ yearRange: true });
    });

    it('rejects a non-numeric string with yearRange', () => {
      expect(validator(new FormControl('abc'))).toEqual({ yearRange: true });
    });
  });
});
