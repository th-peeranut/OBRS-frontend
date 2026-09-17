import { FormControl } from '@angular/forms';
import { trimmedLengthValidator } from './trimmed-length.validator';

describe('trimmedLengthValidator', () => {
  const control = (value: unknown) =>
    new FormControl(value, [trimmedLengthValidator(2, 50)]);

  it('accepts a value inside the range', () => {
    expect(control('Na').valid).toBeTrue();
    expect(control('Jaidee').valid).toBeTrue();
  });

  it('rejects a value shorter than the minimum', () => {
    expect(control('T').hasError('minlength')).toBeTrue();
  });

  it('rejects a value longer than the maximum', () => {
    expect(control('J'.repeat(51)).hasError('maxlength')).toBeTrue();
  });

  // The reason this exists instead of Validators.minLength: the value that gets measured has to
  // be the value that gets sent, and every caller trims on the way to the wire.
  it('measures the trimmed value, not the raw one', () => {
    expect(control(' T ').hasError('minlength')).toBeTrue();
    expect(control(' Na ').valid).toBeTrue();
  });

  it('leaves the empty case to `required` — blank, whitespace and null all pass', () => {
    expect(control('').valid).toBeTrue();
    expect(control('   ').valid).toBeTrue();
    expect(control(null).valid).toBeTrue();
  });

  it('reports the Angular error shape, so existing hasError bindings keep working', () => {
    expect(control('T').errors).toEqual({
      minlength: { requiredLength: 2, actualLength: 1 },
    });
  });
});
