import { FormControl } from '@angular/forms';
import { configuredMaxWeightValidator } from './configured-max-weight.validator';

describe('configuredMaxWeightValidator (OBRS-629 AC-3)', () => {
  it('validates against whatever the callback returns NOW, not at build time', () => {
    // The point of the callback: the FormGroup is built in the constructor, the policy arrives
    // later. A snapshot taken at build time would pin the control to whatever was known then -
    // which is exactly what Validators.max(100) did.
    let max: number | null = null;
    const control = new FormControl(60, [configuredMaxWeightValidator(() => max)]);

    expect(control.hasError('max')).withContext('no answer from the server yet').toBeFalse();

    max = 50;
    control.updateValueAndValidity();
    expect(control.hasError('max')).toBeTrue();
    expect(control.getError('max')).toEqual({ max: 50, actual: 60 });

    max = 100;
    control.updateValueAndValidity();
    expect(control.hasError('max')).toBeFalse();
  });

  it('treats the cap as inclusive', () => {
    const control = new FormControl(50, [configuredMaxWeightValidator(() => 50)]);
    expect(control.hasError('max')).toBeFalse();
  });

  it('leaves an empty control to Validators.required', () => {
    for (const empty of [null, '', undefined]) {
      const control = new FormControl(empty, [configuredMaxWeightValidator(() => 50)]);
      expect(control.hasError('max')).withContext(`empty value ${JSON.stringify(empty)}`).toBeFalse();
    }
  });

  it('emits the standard "max" key so existing error branches keep working', () => {
    // fieldError() in both parcel forms already branched on errors['max'] for Validators.max;
    // reusing the key is what keeps this a one-line swap rather than a message refactor.
    const control = new FormControl(101, [configuredMaxWeightValidator(() => 100)]);
    expect(Object.keys(control.errors ?? {})).toEqual(['max']);
  });
});
