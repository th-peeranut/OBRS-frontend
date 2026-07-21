import { FormBuilder } from '@angular/forms';

import { RegisterComponent } from './register.component';
import { createTranslateStub } from '../../testing/test-stubs';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let authStub: { register: jasmine.Spy };
  let alertStub: { error: jasmine.Spy };

  const fillValidForm = () => {
    component.createForm();
    component.registerForm.patchValue({
      title: 'นาย',
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      email: 'somchai@example.com',
      phoneNumber: '0812345678',
      username: 'somchai',
      password: 'Passw0rd!23',
      confirmPassword: 'Passw0rd!23',
      pdpaConsent: true,
    });
  };

  beforeEach(() => {
    authStub = {
      register: jasmine
        .createSpy('register')
        .and.returnValue(Promise.resolve({ code: 201 })),
    };
    alertStub = { error: jasmine.createSpy('error') };

    component = new RegisterComponent(
      createTranslateStub(),
      new FormBuilder(),
      authStub as never,
      alertStub as never,
      {} as never
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /**
   * OBRS-605. Submitting used to stash the whole form (plaintext password included) in
   * sessionStorage and route to /otp/register/<phone>; signup was posted only after the OTP
   * screen said 200. That gate proved nothing - the signup body carries no OTP token and
   * neither route is guarded - so it stopped only the users who followed the UI while
   * billing an SMS per attempt. ADR-0008 requires email verification only.
   *
   * These fail if the OTP detour is ever reintroduced: the component no longer holds a
   * Router at all, so a navigate() call would not compile, and register() must be posted
   * from here.
   */
  describe('signup posts directly, with no phone-OTP detour (OBRS-605)', () => {
    it('calls the signup API itself when the form is valid', async () => {
      fillValidForm();

      await component.register();

      expect(authStub.register).toHaveBeenCalledTimes(1);
      const sent = authStub.register.calls.mostRecent().args[0];
      expect(sent.email).toBe('somchai@example.com');
      expect(sent.phoneNumber).toBe('0812345678');
      // Nothing OTP-shaped is sent, because the backend has no field for it.
      expect(sent.token).toBeUndefined();
      expect(sent.pin).toBeUndefined();
    });

    it('shows the email-verification panel on 201', async () => {
      fillValidForm();

      await component.register();

      expect(component.registrationEmailSent).toBeTrue();
    });

    it('leaves nothing in sessionStorage - the form never crosses a page boundary', async () => {
      sessionStorage.clear();
      fillValidForm();

      await component.register();

      // 'register_value' held the plaintext password for as long as the OTP screen was up.
      expect(sessionStorage.getItem('register_value')).toBeNull();
      expect(sessionStorage.length).toBe(0);
    });

    it('alerts instead of claiming success when the backend rejects the signup', async () => {
      authStub.register.and.returnValue(Promise.resolve({ code: 400 }));
      fillValidForm();

      await component.register();

      expect(component.registrationEmailSent).toBeFalse();
      expect(alertStub.error).toHaveBeenCalledWith('REGISTER.REGISTER_FAIL');
    });

    it('does not post at all when the form is invalid', async () => {
      component.createForm();

      await component.register();

      expect(authStub.register).not.toHaveBeenCalled();
    });
  });

  /**
   * OBRS-409. The field had `Validators.required` only, while the backend stores a Thai mobile
   * only (OBRS-136/ADR-0079) - so a non-mobile number passed the form and died at the signup
   * call with a 400 and no account created. Each case below fails without the pattern this card
   * added. (The 400 used to come from /otp/register/<phone>; OBRS-605 removed that hop, but the
   * field still feeds a Thai-mobile-only column.)
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
