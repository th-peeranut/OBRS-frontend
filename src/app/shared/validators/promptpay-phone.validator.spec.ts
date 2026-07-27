import { FormControl } from '@angular/forms';
import { promptPayPhoneValidator } from './promptpay-phone.validator';

describe('promptPayPhoneValidator', () => {
  it('accepts a well-formed 10-digit Thai mobile number', () => {
    expect(promptPayPhoneValidator(new FormControl('0812345678'))).toBeNull();
  });

  it('is a no-op on a blank value (left to a required validator)', () => {
    expect(promptPayPhoneValidator(new FormControl(''))).toBeNull();
    expect(promptPayPhoneValidator(new FormControl('   '))).toBeNull();
  });

  it('rejects a 13-digit national ID with its own error, not the generic pattern one', () => {
    expect(promptPayPhoneValidator(new FormControl('1234567890123'))).toEqual({ nationalId: true });
  });

  it('rejects a number that does not start with 0', () => {
    expect(promptPayPhoneValidator(new FormControl('1812345678'))).toEqual({ pattern: true });
  });

  it('rejects a number that is not 10 digits (and not 13)', () => {
    expect(promptPayPhoneValidator(new FormControl('08123'))).toEqual({ pattern: true });
    expect(promptPayPhoneValidator(new FormControl('081234567890'))).toEqual({ pattern: true });
  });

  it('rejects non-numeric content', () => {
    expect(promptPayPhoneValidator(new FormControl('08abcdefgh'))).toEqual({ pattern: true });
  });
});
