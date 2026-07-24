import { FormControl } from '@angular/forms';
import {
  nonNegativeAmountValidator,
  positiveAmountValidator,
  tooManyDecimalsValidator,
} from './expense-form-modal.validators';

describe('expense-form-modal.validators', () => {
  describe('positiveAmountValidator', () => {
    it('passes a positive value', () => {
      expect(positiveAmountValidator(new FormControl(500))).toBeNull();
    });

    it('rejects zero and negative values', () => {
      expect(positiveAmountValidator(new FormControl(0))).toEqual({ positiveNumber: true });
      expect(positiveAmountValidator(new FormControl(-5))).toEqual({ positiveNumber: true });
    });

    it('rejects a non-numeric value', () => {
      expect(positiveAmountValidator(new FormControl('abc'))).toEqual({ positiveNumber: true });
    });

    it('treats blank as valid — required-ness is a separate validator', () => {
      expect(positiveAmountValidator(new FormControl(''))).toBeNull();
      expect(positiveAmountValidator(new FormControl(null))).toBeNull();
    });
  });

  describe('nonNegativeAmountValidator', () => {
    it('passes zero and a positive value', () => {
      expect(nonNegativeAmountValidator(new FormControl(0))).toBeNull();
      expect(nonNegativeAmountValidator(new FormControl(17.5))).toBeNull();
    });

    it('rejects a negative value', () => {
      expect(nonNegativeAmountValidator(new FormControl(-1))).toEqual({ negativeNumber: true });
    });

    it('treats blank as valid (vatAmount is optional)', () => {
      expect(nonNegativeAmountValidator(new FormControl(''))).toBeNull();
      expect(nonNegativeAmountValidator(new FormControl(null))).toBeNull();
    });
  });

  describe('tooManyDecimalsValidator', () => {
    const validate2dp = tooManyDecimalsValidator(2);

    it('passes up to 2 decimal places', () => {
      expect(validate2dp(new FormControl('100'))).toBeNull();
      expect(validate2dp(new FormControl('100.5'))).toBeNull();
      expect(validate2dp(new FormControl('100.55'))).toBeNull();
    });

    it('rejects more than 2 decimal places', () => {
      expect(validate2dp(new FormControl('100.555'))).toEqual({ tooManyDecimals: true });
    });

    it('treats blank as valid', () => {
      expect(validate2dp(new FormControl(''))).toBeNull();
      expect(validate2dp(new FormControl(null))).toBeNull();
    });
  });
});
