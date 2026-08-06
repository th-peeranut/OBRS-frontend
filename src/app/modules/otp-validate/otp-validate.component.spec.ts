import { FormBuilder } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

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

  /**
   * OBRS-605. This screen used to serve a third option, 'register', which posted the signup
   * once the vendor said the PIN matched. It gated nothing - /api/auth/signup takes no OTP
   * token and neither route is guarded - so it only cost an SMS per signup attempt through a
   * PUBLIC, unauthenticated request endpoint. Signup now posts from the register form itself.
   *
   * ngOnInit is asserted rather than validateRouteError alone because the redirect used to
   * fall through to sendOtp(): rejecting the route while still billing the SMS would leave
   * the abuse path open with only the UI removed.
   */
  describe('only the phone-login option remains (OBRS-605, OBRS-613)', () => {
    function buildFor(option: string) {
      const router = jasmine.createSpyObj('Router', ['navigateByUrl']);
      router.navigateByUrl.and.resolveTo(true);
      const requestOTP = jasmine
        .createSpy('requestOTP')
        .and.resolveTo({ code: 200, data: { token: 't' } });
      const target = new OtpValidateComponent(
        createTranslateStub(),
        new FormBuilder(),
        jasmine.createSpyObj('AlertService', ['error', 'success']) as never,
        router as never,
        {
          snapshot: {
            paramMap: {
              get: (k: string) => (k === 'option' ? option : '0812345678'),
            },
          },
        } as never,
        { requestOTP } as never,
        {} as never
      );
      return { target, router, requestOTP };
    }

    it('redirects both retired options to the home page', async () => {
      for (const option of ['register', 'forget-password']) {
        const { target, router } = buildFor(option);

        await target.ngOnInit();

        expect(target.validateRouteError()).withContext(option).toBeTrue();
        expect(router.navigateByUrl).withContext(option).toHaveBeenCalledWith('/');
      }
    });

    it('bills no SMS for a rejected route', async () => {
      for (const option of ['register', 'forget-password']) {
        const { target, requestOTP } = buildFor(option);

        await target.ngOnInit();

        expect(requestOTP).withContext(option).not.toHaveBeenCalled();
      }
    });

    it('still serves phone login', async () => {
      {
        const { target, router, requestOTP } = buildFor('login');

        await target.ngOnInit();

        expect(target.validateRouteError()).toBeFalse();
        expect(router.navigateByUrl).not.toHaveBeenCalled();
        expect(requestOTP).toHaveBeenCalled();
      }
    });
  });

  /**
   * OBRS-1072. The backend now refuses to text a number with no account, and this screen is
   * where that refusal lands. Before this card it landed as a toast on a PIN form waiting for
   * an SMS that was never sent — the dead end OBRS-714 names.
   *
   * The assertions are on `phoneNotRegistered` and on the alert spy rather than on rendered
   * markup because this suite constructs the component directly (no TestBed); the template
   * binding it drives is covered by the manual test plan's DOM check.
   */
  describe('a number with no account gets exits, not a dead end (OBRS-1072)', () => {
    function buildWithRejection(error: unknown) {
      const alertService = jasmine.createSpyObj('AlertService', [
        'error',
        'success',
      ]);
      const router = jasmine.createSpyObj('Router', ['navigateByUrl']);
      router.navigateByUrl.and.resolveTo(true);
      const target = new OtpValidateComponent(
        createTranslateStub(),
        new FormBuilder(),
        alertService as never,
        router as never,
        {} as never,
        { requestOTP: () => Promise.reject(error) } as never,
        {} as never
      );
      return { target, alertService, router };
    }

    /** Shaped like the real body: GlobalExceptionHandler derives errorCode from the message key. */
    function notRegisteredResponse(): HttpErrorResponse {
      return new HttpErrorResponse({
        status: 404,
        error: {
          status: 404,
          message: 'No account is registered with this phone number.',
          errorCode: 'OTP_SEND_PHONE_NOT_REGISTERED',
        },
      });
    }

    it('switches to the no-account state and shows NO toast behind it', async () => {
      const { target, alertService } = buildWithRejection(notRegisteredResponse());

      await target.sendOtp();

      expect(target.phoneNotRegistered).toBeTrue();
      // The panel already says this; a toast repeating it is the noise the
      // SKIP_GLOBAL_ERROR_ALERT opt-out exists to remove.
      expect(alertService.error).not.toHaveBeenCalled();
    });

    it('offers both exits: sign up, and correct the number', () => {
      const { target, router } = buildWithRejection(notRegisteredResponse());

      target.goToRegister();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/register');

      target.goToEditPhoneNumber();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login-mobile');
    });

    // must-NOT: the opt-out from the global toast must not swallow the OTHER failures of this
    // request. A guard that silences everything looks identical to a working one on the happy
    // path and loses every rate-limit message.
    it('still alerts on an unrelated failure, with the interceptor wording', async () => {
      const { target, alertService } = buildWithRejection(
        new HttpErrorResponse({ status: 429, error: { errorCode: 'OTP_SEND_RATE_LIMITED_IP' } })
      );

      await target.sendOtp();

      expect(target.phoneNotRegistered).toBeFalse();
      expect(alertService.error).toHaveBeenCalledWith(
        'COMMON.ERROR.TOO_MANY_REQUESTS'
      );
    });

    // must-NOT: a registered number is unaffected — the state never latches on.
    it('leaves a successful send in the normal PIN-entry state', async () => {
      const alertService = jasmine.createSpyObj('AlertService', ['error', 'success']);
      const target = new OtpValidateComponent(
        createTranslateStub(),
        new FormBuilder(),
        alertService as never,
        createRouterStub(),
        {} as never,
        { requestOTP: () => Promise.resolve({ code: 200, data: { token: 't' } }) } as never,
        {} as never
      );
      target.phoneNotRegistered = true; // stale state from a previous attempt

      await target.sendOtp();

      expect(target.phoneNotRegistered).toBeFalse();
      expect(target.token).toBe('t');
      expect(alertService.error).not.toHaveBeenCalled();
    });
  });
});
