import { FormBuilder } from '@angular/forms';

import {
  RESET_PASSWORD_PATTERN,
  ResetPasswordComponent,
} from './reset-password.component';

describe('ResetPasswordComponent', () => {
  let authStub: { confirmPasswordReset: jasmine.Spy };
  let router: jasmine.SpyObj<{ navigate: (c: unknown[]) => Promise<boolean> }>;

  function build(token: string | null): ResetPasswordComponent {
    authStub = {
      confirmPasswordReset: jasmine
        .createSpy('confirmPasswordReset')
        .and.returnValue(Promise.resolve({ code: 200 })),
    };
    router = jasmine.createSpyObj('Router', ['navigate']);
    router.navigate.and.resolveTo(true);

    const route = {
      snapshot: { queryParamMap: { get: (k: string) => (k === 'token' ? token : null) } },
    };

    const component = new ResetPasswordComponent(
      new FormBuilder(),
      route as never,
      router as never,
      authStub as never
    );
    component.ngOnInit();
    return component;
  }

  const fill = (c: ResetPasswordComponent, pw: string, confirm = pw) => {
    c.getForm('newPassword')!.setValue(pw);
    c.getForm('confirmPassword')!.setValue(confirm);
  };

  it('should create', () => {
    expect(build('tok')).toBeTruthy();
  });

  /**
   * OBRS-613. EmailService has built this link since OBRS-9 —
   * `${app.frontend-url}/reset-password?token=` — and no such route existed, so every
   * reset email fell through to the '**' wildcard and redirected to the home page. The
   * flow could not be completed by anyone.
   */
  describe('completes the emailed reset (OBRS-613)', () => {
    it('reads the token from ?token= and shows the form', () => {
      expect(build('reset-token-abc').state).toBe('form');
    });

    it('sends the token and the new password to the confirm endpoint', async () => {
      const c = build('reset-token-abc');
      fill(c, 'Passw0rdNew');

      await c.submit();

      expect(authStub.confirmPasswordReset).toHaveBeenCalledOnceWith({
        token: 'reset-token-abc',
        newPassword: 'Passw0rdNew',
      });
      expect(c.state).toBe('success');
    });

    it('refuses a link with no token instead of posting an empty one', async () => {
      const c = build(null);

      expect(c.state).toBe('noToken');

      fill(c, 'Passw0rdNew');
      await c.submit();
      expect(authStub.confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only token the same as none', () => {
      expect(build('   ').state).toBe('noToken');
    });
  });

  describe('validation mirrors PasswordResetEmailConfirmReqDto', () => {
    it('accepts a password meeting the server rule', () => {
      const c = build('tok');
      for (const ok of ['Passw0rdNew', 'aB3aaaaa', 'Zz9' + 'x'.repeat(125)]) {
        expect(RESET_PASSWORD_PATTERN.test(ok)).withContext(ok).toBeTrue();
      }
      fill(c, 'Passw0rdNew');
      expect(c.getForm('newPassword')!.valid).toBeTrue();
    });

    it('rejects too short, and missing an uppercase, lowercase or digit', () => {
      const c = build('tok');
      for (const bad of ['Ab3aaaa', 'passw0rdnew', 'PASSW0RDNEW', 'PasswordNew']) {
        c.getForm('newPassword')!.setValue(bad);
        expect(c.getForm('newPassword')!.hasError('pattern')).withContext(bad).toBeTrue();
      }
    });

    it('does not submit when the two fields differ', async () => {
      const c = build('tok');
      fill(c, 'Passw0rdNew', 'Passw0rdOther');

      await c.submit();

      expect(c.passwordsMatch()).toBeFalse();
      expect(authStub.confirmPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('a spent or expired link', () => {
    /**
     * A reset link is single-use and expires, so this is the ordinary case rather than an
     * exceptional one. It must render inline with a way to get a new link — asserting the
     * i18n KEY (not a literal) is what proves the message goes through TranslateService.
     */
    it('renders an inline message with an i18n key, and stays on the form', async () => {
      const c = build('tok');
      authStub.confirmPasswordReset.and.returnValue(Promise.reject(new Error('400')));
      fill(c, 'Passw0rdNew');

      await c.submit();

      expect(c.errorKey).toBe('RESET_PASSWORD.ERROR.TOKEN_INVALID');
      expect(c.state).toBe('form');
      expect(c.submitting).toBeFalse();
    });

    it('clears the previous error when the user retries', async () => {
      const c = build('tok');
      authStub.confirmPasswordReset.and.returnValue(Promise.reject(new Error('400')));
      fill(c, 'Passw0rdNew');
      await c.submit();
      expect(c.errorKey).not.toBeNull();

      authStub.confirmPasswordReset.and.returnValue(Promise.resolve({ code: 200 }));
      await c.submit();

      expect(c.errorKey).toBeNull();
      expect(c.state).toBe('success');
    });

    it('does not claim success on a non-200 body', async () => {
      const c = build('tok');
      authStub.confirmPasswordReset.and.returnValue(Promise.resolve({ code: 400 }));
      fill(c, 'Passw0rdNew');

      await c.submit();

      expect(c.state).toBe('form');
      expect(c.errorKey).toBe('RESET_PASSWORD.ERROR.GENERIC');
    });
  });
});
