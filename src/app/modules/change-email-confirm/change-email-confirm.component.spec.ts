import { ChangeEmailConfirmComponent } from './change-email-confirm.component';
import { createRouterStub } from '../../testing/test-stubs';

describe('ChangeEmailConfirmComponent', () => {
  function create(
    token: string | null,
    authServiceStub: { confirmEmailChange: jasmine.Spy; clearAuthData: jasmine.Spy },
    router = createRouterStub()
  ): { component: ChangeEmailConfirmComponent; router: ReturnType<typeof createRouterStub> } {
    const routeStub = {
      snapshot: {
        queryParamMap: {
          get: (key: string) => (key === 'token' ? token : null),
        },
      },
    };

    const component = new ChangeEmailConfirmComponent(
      routeStub as never,
      router,
      authServiceStub as never
    );

    return { component, router };
  }

  function authStub(overrides: { confirmEmailChange?: jasmine.Spy } = {}): {
    confirmEmailChange: jasmine.Spy;
    clearAuthData: jasmine.Spy;
  } {
    return {
      confirmEmailChange:
        overrides.confirmEmailChange ??
        jasmine.createSpy('confirmEmailChange').and.resolveTo({ code: 200, message: 'OK' }),
      clearAuthData: jasmine.createSpy('clearAuthData'),
    };
  }

  it('should create', () => {
    const { component } = create('tok123', authStub());
    expect(component).toBeTruthy();
  });

  it('starts in the confirming state', () => {
    const { component } = create('tok123', authStub());
    expect(component.confirmState).toBe('confirming');
  });

  it('falls back to invalid (neutral) when no token is present in the URL', async () => {
    const auth = authStub();
    const { component } = create(null, auth);

    await component.ngOnInit();

    expect(component.confirmState).toBe('invalid');
    expect(auth.confirmEmailChange).not.toHaveBeenCalled();
  });

  describe('success', () => {
    it('transitions confirming -> success and clears auth data', async () => {
      const auth = authStub({
        confirmEmailChange: jasmine
          .createSpy('confirmEmailChange')
          .and.resolveTo({ code: 200, message: 'OK', data: { newEmail: 'new@example.com' } }),
      });
      const { component } = create('tok123', auth);

      await component.ngOnInit();

      expect(component.confirmState).toBe('success');
      expect(component.newEmail).toBe('new@example.com');
      expect(auth.clearAuthData).toHaveBeenCalled();
    });

    it('redirects to /login?reason=email-changed (+ email) on demand via navigateToLogin', async () => {
      const auth = authStub({
        confirmEmailChange: jasmine
          .createSpy('confirmEmailChange')
          .and.resolveTo({ code: 200, message: 'OK', data: { newEmail: 'new@example.com' } }),
      });
      const router = createRouterStub();
      const navSpy = spyOn(router, 'navigate').and.resolveTo(true);
      const { component } = create('tok123', auth, router);

      await component.ngOnInit();
      component.navigateToLogin();

      expect(navSpy).toHaveBeenCalledWith(['/login'], {
        queryParams: { reason: 'email-changed', email: 'new@example.com' },
      });
    });

    it('auto-redirects to login ~3s after success', async () => {
      jasmine.clock().install();
      try {
        const auth = authStub({
          confirmEmailChange: jasmine
            .createSpy('confirmEmailChange')
            .and.resolveTo({ code: 200, message: 'OK', data: { newEmail: 'new@example.com' } }),
        });
        const router = createRouterStub();
        const navSpy = spyOn(router, 'navigate').and.resolveTo(true);
        const { component } = create('tok123', auth, router);

        await component.ngOnInit();
        expect(navSpy).not.toHaveBeenCalled();

        jasmine.clock().tick(3000);

        expect(navSpy).toHaveBeenCalledWith(['/login'], {
          queryParams: { reason: 'email-changed', email: 'new@example.com' },
        });
      } finally {
        jasmine.clock().uninstall();
      }
    });
  });

  describe('invalid (AUTH_ERROR_EMAIL_CHANGE_TOKEN_INVALID) — NEUTRAL, not an error', () => {
    it('transitions to invalid', async () => {
      const auth = authStub({
        confirmEmailChange: jasmine
          .createSpy('confirmEmailChange')
          .and.rejectWith({ error: { errorCode: 'AUTH_ERROR_EMAIL_CHANGE_TOKEN_INVALID' } }),
      });
      const { component } = create('tok123', auth);

      await component.ngOnInit();

      expect(component.confirmState).toBe('invalid');
      expect(auth.clearAuthData).not.toHaveBeenCalled();
    });
  });

  describe('targetTaken (AUTH_ERROR_EMAIL_CHANGE_TARGET_TAKEN)', () => {
    it('transitions to targetTaken', async () => {
      const auth = authStub({
        confirmEmailChange: jasmine
          .createSpy('confirmEmailChange')
          .and.rejectWith({ error: { errorCode: 'AUTH_ERROR_EMAIL_CHANGE_TARGET_TAKEN' } }),
      });
      const { component } = create('tok123', auth);

      await component.ngOnInit();

      expect(component.confirmState).toBe('targetTaken');
    });
  });
});
