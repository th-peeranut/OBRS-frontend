import { FormBuilder } from '@angular/forms';

import { OtpValidateComponent } from './otp-validate.component';
import {
  createRouterStub,
  createTranslateStub,
} from '../../testing/test-stubs';

describe('OtpValidateComponent', () => {
  let component: OtpValidateComponent;

  beforeEach(() => {
    component = new OtpValidateComponent(
      createTranslateStub(),
      new FormBuilder(),
      {} as never,
      {} as never,
      createRouterStub(),
      {} as never,
      {} as never,
      {} as never
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // OBRS-569: this page shipped alertService.success('succ') and .error('error') —
  // placeholders left behind, on the OTP LOGIN path, which is the first screen a new
  // user meets. The translations for all of them already existed in en/th/zh (added
  // by the adab489 audit commit) and were referenced ZERO times; only the wiring was
  // missing. createTranslateStub().instant returns the key, so asserting on the key
  // proves the call goes through TranslateService rather than a literal.
  describe('alerts go through i18n, never a placeholder literal (OBRS-569)', () => {
    let alertService: jasmine.SpyObj<{
      error: (m: string) => void;
      success: (m: string) => void;
    }>;

    function build(overrides: {
      authService?: unknown;
      otpService?: unknown;
    }): OtpValidateComponent {
      alertService = jasmine.createSpyObj('AlertService', ['error', 'success']);
      return new OtpValidateComponent(
        createTranslateStub(),
        new FormBuilder(),
        {} as never,
        alertService as never,
        createRouterStub(),
        {} as never,
        (overrides.otpService ?? {}) as never,
        (overrides.authService ?? {}) as never
      );
    }

    it('shows the translated success message on OTP login, not "succ"', async () => {
      const navigateAfterLogin = jasmine
        .createSpy('navigateAfterLogin')
        .and.resolveTo(undefined);
      const target = build({
        authService: {
          loginWithOtp: () => Promise.resolve({ code: 200 }),
          navigateAfterLogin,
        },
      });
      target.option = 'login';
      target.otpCode = '123456';

      await target.verifyOtp();

      expect(alertService.success).toHaveBeenCalledWith(
        'LOGIN_BY_PHONE_NO.LOGIN_SUCCESS'
      );
      const shown = alertService.success.calls.mostRecent().args[0];
      expect(shown).not.toBe('succ');
      expect(navigateAfterLogin).toHaveBeenCalled();
    });

    it('shows the translated verify-failure message, not "error"', async () => {
      const target = build({
        authService: { loginWithOtp: () => Promise.resolve({ code: 400 }) },
      });
      target.option = 'login';
      target.otpCode = '123456';

      await target.verifyOtp();

      expect(alertService.error).toHaveBeenCalledWith(
        'LOGIN_BY_PHONE_NO.OTP_VERIFY_FAILED'
      );
      expect(alertService.error.calls.mostRecent().args[0]).not.toBe('error');
    });

    it('shows the translated request-failure message when the OTP send is rejected', async () => {
      const target = build({
        otpService: { requestOTP: () => Promise.resolve({ code: 500 }) },
      });

      await target.sendOtp();

      expect(alertService.error).toHaveBeenCalledWith(
        'LOGIN_BY_PHONE_NO.OTP_REQUEST_FAILED'
      );
      expect(alertService.error.calls.mostRecent().args[0]).not.toBe('error');
    });
  });
});
