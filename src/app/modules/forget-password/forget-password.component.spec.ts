import { FormBuilder } from '@angular/forms';

import { ForgetPasswordComponent } from './forget-password.component';

describe('ForgetPasswordComponent', () => {
  let component: ForgetPasswordComponent;
  let authStub: { forgetPassword: jasmine.Spy };

  beforeEach(() => {
    authStub = {
      forgetPassword: jasmine
        .createSpy('forgetPassword')
        .and.returnValue(Promise.resolve({ code: 200 })),
    };
    component = new ForgetPasswordComponent(new FormBuilder(), authStub as never);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /**
   * OBRS-613. This page used to collect a PHONE number and navigate to
   * /otp/forget-password/<phone>, where verifying the PIN ran an empty block — the only
   * "forgot password" link in the product sent a real SMS and then did nothing, while a
   * finished email-token flow sat unwired in AuthService (OBRS-9, backend).
   */
  describe('requests an emailed reset link (OBRS-613)', () => {
    it('collects an email, not a phone number', () => {
      expect(component.getForm('email')).not.toBeNull();
      // The old control is gone; leaving it would let the phone journey be revived by
      // template alone.
      expect(component.getForm('phoneNo')).toBeNull();
    });

    it('rejects an empty or malformed address before calling anything', async () => {
      component.getForm('email')!.setValue('');
      await component.requestResetLink();
      expect(authStub.forgetPassword).not.toHaveBeenCalled();

      component.getForm('email')!.setValue('not-an-email');
      await component.requestResetLink();
      expect(authStub.forgetPassword).not.toHaveBeenCalled();
      expect(component.linkSent).toBeFalse();
    });

    it('calls the password-reset request endpoint with the address', async () => {
      component.getForm('email')!.setValue('somchai@example.com');

      await component.requestResetLink();

      expect(authStub.forgetPassword).toHaveBeenCalledOnceWith({
        email: 'somchai@example.com',
      });
      expect(component.linkSent).toBeTrue();
    });

    /**
     * PasswordResetService returns the same message whether or not the address belongs to
     * an account, specifically so this endpoint cannot be used to test which emails are
     * registered. Branching on the response in the UI would rebuild that oracle where it
     * is actually usable — so the panel must look identical either way, including when
     * the request fails outright.
     */
    it('shows the same confirmation for an unknown address', async () => {
      authStub.forgetPassword.and.returnValue(Promise.resolve({ code: 200 }));
      component.getForm('email')!.setValue('nobody@example.com');

      await component.requestResetLink();

      expect(component.linkSent).toBeTrue();
    });

    it('shows the same confirmation even when the request throws', async () => {
      authStub.forgetPassword.and.returnValue(Promise.reject(new Error('network')));
      component.getForm('email')!.setValue('somchai@example.com');

      await component.requestResetLink();

      expect(component.linkSent).toBeTrue();
      expect(component.submitting).toBeFalse();
    });

    it('does not fire a second request while one is in flight', async () => {
      let release: (v: unknown) => void = () => {};
      authStub.forgetPassword.and.returnValue(new Promise((r) => (release = r)));
      component.getForm('email')!.setValue('somchai@example.com');

      const first = component.requestResetLink();
      await component.requestResetLink();
      expect(authStub.forgetPassword).toHaveBeenCalledTimes(1);

      release({ code: 200 });
      await first;
      expect(component.submitting).toBeFalse();
    });
  });
});
