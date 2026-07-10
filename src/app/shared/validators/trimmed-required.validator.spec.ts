import { FormControl } from '@angular/forms';
import { trimmedRequiredValidator } from './trimmed-required.validator';

describe('trimmedRequiredValidator', () => {
  it('rejects an empty string', () => {
    const control = new FormControl('');
    expect(trimmedRequiredValidator(control)).toEqual({ required: true });
  });

  it('rejects a whitespace-only string (the gap Validators.required leaves open)', () => {
    const control = new FormControl('   ');
    expect(trimmedRequiredValidator(control)).toEqual({ required: true });
  });

  it('rejects null/undefined', () => {
    expect(trimmedRequiredValidator(new FormControl(null))).toEqual({ required: true });
    expect(trimmedRequiredValidator(new FormControl(undefined))).toEqual({ required: true });
  });

  it('accepts a non-whitespace value', () => {
    const control = new FormControl('a-real-password');
    expect(trimmedRequiredValidator(control)).toBeNull();
  });

  it('accepts a value with surrounding whitespace as long as it has content', () => {
    const control = new FormControl('  has-content  ');
    expect(trimmedRequiredValidator(control)).toBeNull();
  });
});
