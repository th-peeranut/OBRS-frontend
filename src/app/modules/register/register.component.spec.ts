import { FormBuilder } from '@angular/forms';

import { RegisterComponent } from './register.component';
import {
  createRouterStub,
  createTranslateStub,
} from '../../testing/test-stubs';

describe('RegisterComponent', () => {
  let component: RegisterComponent;

  beforeEach(() => {
    component = new RegisterComponent(
      createTranslateStub(),
      new FormBuilder(),
      {} as never,
      {} as never,
      {} as never,
      createRouterStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /**
   * OBRS-409. The field had `Validators.required` only, while the OTP request it feeds accepts a
   * Thai mobile only (OBRS-136/ADR-0079) - so a non-mobile number passed the form and died at
   * /otp/register/<phone> with a 400 and no account created. Each case below fails without the
   * pattern this card added.
   */
  describe('phoneNumber Thai-mobile pattern (OBRS-409)', () => {
    const phone = () => {
      component.createForm();
      return component.registerForm.get('phoneNumber')!;
    };

    it('accepts the three real Thai mobile prefixes', () => {
      const control = phone();
      for (const valid of ['0612345678', '0812345678', '0912345678']) {
        control.setValue(valid);
        expect(control.valid).withContext(valid).toBeTrue();
      }
    });

    it('rejects a landline, a wrong length, and the 66 wire spelling', () => {
      const control = phone();
      // 02 is a Bangkok landline: 10 digits, starts with 0, and cannot receive an OTP. It is
      // exactly what the looser /^0\d{9}$/ used by the booking forms lets through.
      for (const invalid of ['0212345678', '1234567890', '081234567', '08123456789']) {
        control.setValue(invalid);
        expect(control.hasError('pattern')).withContext(invalid).toBeTrue();
      }
      // The backend accepts 66... on the wire but stores the local form; this field deliberately
      // only offers the spelling a Thai user actually types.
      control.setValue('66812345678');
      expect(control.hasError('pattern')).toBeTrue();
    });

    it('reports an empty field as required, NOT as a bad pattern', () => {
      // The template keys its two messages off these specific errors. Before OBRS-409 a single
      // block rendered PHONE_NO_REQUIRED for any error at all, so adding a pattern without
      // splitting them would have told someone who typed 0212345678 to "enter a phone number".
      const control = phone();
      control.setValue('');
      expect(control.hasError('required')).toBeTrue();
      expect(control.hasError('pattern')).toBeFalse();
    });

    it('reports a filled-but-invalid field as a bad pattern, NOT as required', () => {
      const control = phone();
      control.setValue('0212345678');
      expect(control.hasError('pattern')).toBeTrue();
      expect(control.hasError('required')).toBeFalse();
    });
  });
});
