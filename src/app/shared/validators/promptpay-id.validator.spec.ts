import { FormControl } from '@angular/forms';
import { promptPayIdValidator } from './promptpay-id.validator';

describe('promptPayIdValidator', () => {
  it('accepts a well-formed 10-digit Thai mobile number', () => {
    expect(promptPayIdValidator(new FormControl('0812345678'))).toBeNull();
  });

  it('is a no-op on a blank value (left to a required validator)', () => {
    expect(promptPayIdValidator(new FormControl(''))).toBeNull();
    expect(promptPayIdValidator(new FormControl('   '))).toBeNull();
  });

  it('accepts a 13-digit national ID whose check digit is valid (OBRS-1462)', () => {
    expect(promptPayIdValidator(new FormControl('1101700156176'))).toBeNull();
  });

  it('rejects a 13-digit id whose check digit is wrong, with its own error', () => {
    // The same id as above with only the last digit mistyped — the case a length
    // check alone waves through, and the reason the check digit is enforced at all.
    expect(promptPayIdValidator(new FormControl('1101700156175'))).toEqual({ checkDigit: true });
    expect(promptPayIdValidator(new FormControl('1234567890123'))).toEqual({ checkDigit: true });
  });

  it('rejects a 10-digit number that does not start with 0', () => {
    expect(promptPayIdValidator(new FormControl('1812345678'))).toEqual({ pattern: true });
  });

  it('rejects a length that is neither 10 nor 13', () => {
    expect(promptPayIdValidator(new FormControl('08123'))).toEqual({ pattern: true });
    expect(promptPayIdValidator(new FormControl('081234567890'))).toEqual({ pattern: true });
    expect(promptPayIdValidator(new FormControl('11017001561'))).toEqual({ pattern: true });
  });

  it('rejects non-numeric content', () => {
    expect(promptPayIdValidator(new FormControl('08abcdefgh'))).toEqual({ pattern: true });
    expect(promptPayIdValidator(new FormControl('110170015617x'))).toEqual({ pattern: true });
  });
});
