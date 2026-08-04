import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';
import { Register } from '../shared/interfaces/auth.interface';
import { PRIVACY_POLICY_VERSION } from '../modules/privacy-policy/privacy-policy.version';
import { environment } from '../../environments/environment';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
} from '../shared/interceptors/http-context-tokens';
import {
  readBookingContext,
  rememberBookingSelection,
} from '../shared/lib/booking-context-storage';
import { Schedule } from '../shared/interfaces/schedule.interface';

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate'),
            navigateByUrl: jasmine.createSpy('navigateByUrl'),
          },
        },
      ],
    });

    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('sends only fields accepted by the backend signup DTO', async () => {
    const register: Register = {
      title: 'Mr.',
      firstName: 'Test',
      middleName: '',
      lastName: 'User',
      email: 'test@example.com',
      phoneNumber: '0812345678',
      password: 'Password1',
      preferredLocale: 'th',
      pdpaConsent: true,
      username: 'legacy-user',
      isPhoneNumberVerify: true,
      roles: ['admin'],
    };

    const resultPromise = service.register(register);
    const request = httpTesting.expectOne(
      `${environment.apiUrl}/api/auth/signup`
    );

    expect(request.request.body).toEqual({
      title: 'Mr.',
      firstName: 'Test',
      middleName: '',
      lastName: 'User',
      email: 'test@example.com',
      phoneNumber: '0812345678',
      password: 'Password1',
      preferredLocale: 'th',
      pdpaConsent: true,
      // OBRS-632: stamped by the service, never taken from the form.
      pdpaConsentVersion: PRIVACY_POLICY_VERSION,
    });

    request.flush({ code: 201, message: 'Created' });
    expect((await resultPromise).code).toBe(201);
  });

  /**
   * OBRS-632 — the frontend half of the consent-version contract. The backend field is optional at
   * the wire on purpose (a required one would turn a backend-lands-first deploy into a signup
   * outage), so nothing on the server can fail when this stops being sent. This test and its
   * backend twin (`AuthenticationServiceTest#signUp_recordsThePrivacyNoticeVersionThatWasDisplayed`)
   * are what keep `users.pdpa_consent_version` from silently filling with NULLs.
   */
  it('OBRS-632: stamps the privacy-notice version this build serves onto the signup', async () => {
    const register: Register = {
      title: 'Mr.',
      firstName: 'Test',
      middleName: '',
      lastName: 'User',
      email: 'test@example.com',
      phoneNumber: '0812345678',
      password: 'Password1',
      preferredLocale: 'th',
      pdpaConsent: true,
    };

    const resultPromise = service.register(register);
    const request = httpTesting.expectOne(`${environment.apiUrl}/api/auth/signup`);

    expect(request.request.body.pdpaConsentVersion).toBe(PRIVACY_POLICY_VERSION);

    request.flush({ code: 201, message: 'Created' });
    await resultPromise;
  });

  it('OBRS-632: stamps the same version onto the Google sign-in, which shares the consent box', async () => {
    const resultPromise = service.loginWithGoogle({ idToken: 'tok', pdpaConsent: true });
    const request = httpTesting.expectOne(
      `${environment.apiUrl}/api/auth/social/google`
    );

    expect(request.request.body).toEqual({
      idToken: 'tok',
      pdpaConsent: true,
      pdpaConsentVersion: PRIVACY_POLICY_VERSION,
    });

    request.flush({ code: 200, message: 'OK', data: {} });
    await resultPromise;
  });

  describe('hasAnyRole (area-based access model)', () => {
    const setRoles = (roles: string[]) =>
      localStorage.setItem('auth_roles', JSON.stringify(roles));

    // OBRS-176: admin is now a cross-portal superset mirroring the backend
    // admin > owner hierarchy — it grants staff, customer, and owner access,
    // reversing the FE's earlier (undocumented) confinement of admin.
    it('grants an admin access to staff-only routes (admin is a cross-portal superset)', () => {
      setRoles(['admin']);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(true);
    });

    it('grants an admin access to owner and customer routes too', () => {
      setRoles(['admin']);
      expect(service.hasAnyRole(['salesperson'])).toBe(true);
      expect(service.hasAnyRole(['driver'])).toBe(true);
      expect(service.hasAnyRole(['customer'])).toBe(true);
      expect(service.hasAnyRole(['owner'])).toBe(true);
    });

    // Control: a customer must NOT gain admin/staff access (the widening is
    // specific to admin/owner, not a general loosening of hasAnyRole).
    it('does not grant a customer access to admin or staff routes', () => {
      setRoles(['customer']);
      expect(service.hasAnyRole(['admin'])).toBe(false);
      expect(service.hasAnyRole(['salesperson'])).toBe(false);
    });

    it('still matches a staff user on their own role', () => {
      setRoles(['salesperson']);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(true);
    });

    it('still denies a user who holds none of the required roles', () => {
      setRoles(['customer']);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(false);
    });

    // OBRS-601: `auth_roles` lives in localStorage, which the browser user can
    // edit by hand. `ROLE_GRANTS` is an object literal, so before the fix a
    // role of `constructor` resolved to the `Object` FUNCTION — truthy, so the
    // `if (grants)` branch was taken and `grants.forEach` threw. hasAnyRole()
    // is called from every route guard and the navbar, so that single crafted
    // string took the whole app down rather than being ignored. The correct
    // handling was already written (the `else`: an unrecognised role only
    // matches itself) — the unguarded lookup just skipped past it.
    ['constructor', '__proto__', 'toString', 'hasOwnProperty'].forEach((planted) => {
      it(`ignores a hand-planted "${planted}" role instead of throwing`, () => {
        setRoles([planted]);
        expect(() => service.hasAnyRole(['admin'])).not.toThrow();
        expect(service.hasAnyRole(['admin'])).withContext(planted).toBe(false);
        expect(service.hasAnyRole(['customer'])).withContext(planted).toBe(false);
        // It still matches itself, which is the documented fallback.
        expect(service.hasAnyRole([planted])).withContext(planted).toBe(true);
      });
    });

    it('is not derailed when a planted role sits alongside a real one', () => {
      setRoles(['constructor', 'salesperson']);
      expect(service.hasAnyRole(['driver'])).toBe(true);
      expect(service.hasAnyRole(['admin'])).toBe(false);
    });

    it('grants an owner access to salesperson/driver routes (owner is all-access)', () => {
      setRoles(['owner']);
      expect(service.hasAnyRole(['salesperson'])).toBe(true);
      expect(service.hasAnyRole(['driver'])).toBe(true);
      expect(service.hasAnyRole(['driver', 'salesperson'])).toBe(true);
    });

    // Owner is the all-access superset in the area model, so it reaches the
    // admin portal too (the reverse of the old admin > owner hierarchy).
    it('lets an owner reach admin-only routes (owner is the all-access superset)', () => {
      setRoles(['owner']);
      expect(service.hasAnyRole(['admin'])).toBe(true);
    });

    it('lets a salesperson satisfy driver routes but a driver cannot satisfy salesperson routes', () => {
      setRoles(['salesperson']);
      expect(service.hasAnyRole(['driver'])).toBe(true);

      setRoles(['driver']);
      expect(service.hasAnyRole(['salesperson'])).toBe(false);
    });
  });

  // OBRS-446: executable documentation for a trap that has already misled a
  // reader. Because ROLE_GRANTS has owner and admin granting each OTHER, the
  // three requiredRoles variants the admin module declares are the SAME
  // predicate — "admin or owner" — and neither literal excludes anybody.
  // These specs pin that so the equivalence cannot be quietly assumed to hold
  // (or quietly broken): when owner-scoping lands (OBRS-148/150) and the
  // literals start to bite, this block goes RED and forces the routes to be
  // re-read rather than trusted. A prose comment alone would rot the way
  // StompAuthChannelInterceptor's did (OBRS-400).
  describe('admin-module requiredRoles variants (OBRS-446)', () => {
    const setRoles = (roles: string[]) =>
      localStorage.setItem('auth_roles', JSON.stringify(roles));

    // The literals actually declared in admin.module.ts today.
    const ADMIN_ONLY = ['admin']; // e.g. reports, reminder-config
    const OWNER_ONLY = ['owner']; // settlements — reads as "admin excluded"
    const BOTH = ['admin', 'owner']; // e.g. eod-sales-report

    it('resolves all three variants identically for an admin', () => {
      setRoles(['admin']);
      expect(service.hasAnyRole(ADMIN_ONLY)).toBe(true);
      // The sharp edge: settlements declares ['owner'], plainly reading as
      // "owner only" — admin gets in regardless.
      expect(service.hasAnyRole(OWNER_ONLY)).toBe(true);
      expect(service.hasAnyRole(BOTH)).toBe(true);
    });

    it('resolves all three variants identically for an owner', () => {
      setRoles(['owner']);
      expect(service.hasAnyRole(ADMIN_ONLY)).toBe(true);
      expect(service.hasAnyRole(OWNER_ONLY)).toBe(true);
      expect(service.hasAnyRole(BOTH)).toBe(true);
    });

    // Control: the variants collapse only for admin/owner. Everyone else is
    // still shut out — the parent /admin gate is what actually holds the line.
    it('still denies every other role on all three variants', () => {
      for (const role of ['salesperson', 'driver', 'customer']) {
        setRoles([role]);
        expect(service.hasAnyRole(ADMIN_ONLY)).toBe(false);
        expect(service.hasAnyRole(OWNER_ONLY)).toBe(false);
        expect(service.hasAnyRole(BOTH)).toBe(false);
      }
    });

    // Proves the specs above are non-vacuous: they pass because of the
    // admin→owner grant, not because hasAnyRole waves admin through on some
    // other path. Simulates the OBRS-148/150 end-state (admin no longer
    // granting owner) test-side only — production ROLE_GRANTS is untouched
    // and restored below. If this ever fails, the equivalence documented on
    // ROLE_GRANTS and on the settlements route no longer holds: re-read them.
    it('would separate the variants if admin stopped granting owner', () => {
      const grants = (AuthService as any).ROLE_GRANTS;
      const original = grants.admin;
      grants.admin = ['admin', 'salesperson', 'driver', 'customer'];
      try {
        setRoles(['admin']);
        expect(service.hasAnyRole(ADMIN_ONLY)).toBe(true);
        expect(service.hasAnyRole(OWNER_ONLY)).toBe(false); // settlements would exclude admin
        expect(service.hasAnyRole(BOTH)).toBe(true);
      } finally {
        grants.admin = original;
      }

      // Restored — the collapse is back, so nothing leaks into later specs.
      expect(service.hasAnyRole(OWNER_ONLY)).toBe(true);
    });
  });

  describe('getHomeRoute', () => {
    const setRoles = (roles: string[]) =>
      localStorage.setItem('auth_roles', JSON.stringify(roles));

    it('sends admins to /admin', () => {
      setRoles(['admin']);
      expect(service.getHomeRoute()).toBe('/admin');
    });

    it('sends staff (salesperson/driver) to /staff', () => {
      setRoles(['salesperson']);
      expect(service.getHomeRoute()).toBe('/staff');
      setRoles(['driver']);
      expect(service.getHomeRoute()).toBe('/staff');
    });

    it('sends owner and customer to the public home', () => {
      setRoles(['owner']);
      expect(service.getHomeRoute()).toBe('/');
      setRoles(['customer']);
      expect(service.getHomeRoute()).toBe('/');
    });

    it('falls back to the public home for guests / unknown roles', () => {
      expect(service.getHomeRoute()).toBe('/');
    });
  });

  // OBRS-1001 deleted `canAccessCustomerArea()` and `PORTAL_ONLY_ROLES` — the
  // suite that used to live here pinned salesperson/driver as confined, which
  // is the rule the fix removes. Rewriting those cases as `toBe(true)` against
  // a method that no longer exists would have been a suite that compiles and
  // proves nothing; the replacement asserts the SURFACE is gone, and the real
  // behavioural pin lives in auth.guard.spec.ts, where the guard is driven with
  // the real service and real localStorage roles.
  describe('portal confinement is gone (OBRS-1001)', () => {
    it('exposes no customer-area role predicate on the service any more', () => {
      expect(
        (service as unknown as Record<string, unknown>)['canAccessCustomerArea']
      )
        .withContext(
          'restoring this method must go through an ADR — see docs/adr/0037-no-frontend-portal-confinement.md'
        )
        .toBeUndefined();
    });

    // getHomeRoute() is NOT part of what was removed: staff still LAND in their
    // portal after signing in. What changed is that the public area no longer
    // pushes them back there.
    it('still lands staff in their own portal after login', () => {
      localStorage.setItem('auth_roles', JSON.stringify(['salesperson']));
      expect(service.getHomeRoute()).toBe('/staff');
      localStorage.setItem('auth_roles', JSON.stringify(['driver']));
      expect(service.getHomeRoute()).toBe('/staff');
    });
  });

  // OBRS-84: verified self-service login-email change — the three new
  // methods and their HttpContext tokens (OBRS-187 lesson: a wrong-password
  // response on the initiate call must not force-logout).
  describe('requestEmailChange', () => {
    it('POSTs to /api/private/users/me/email/change-request with the payload', () => {
      service.requestEmailChange({
        currentPassword: 'oldpass1',
        newEmail: 'new@example.com',
      });

      const req = httpTesting.expectOne(
        `${environment.apiUrl}/api/private/users/me/email/change-request`
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        currentPassword: 'oldpass1',
        newEmail: 'new@example.com',
      });
      req.flush({ code: 200, message: 'OK' });
    });

    it('sets BOTH SKIP_AUTH_LOGOUT and SKIP_GLOBAL_ERROR_ALERT — a wrong-password response must not force-logout and must render inline, not as a global toast', () => {
      service.requestEmailChange({ currentPassword: 'wrong', newEmail: 'new@example.com' });

      const req = httpTesting.expectOne(
        `${environment.apiUrl}/api/private/users/me/email/change-request`
      );
      expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
      expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();
      req.flush(
        { errorCode: 'AUTH_ERROR_INVALID_CREDENTIALS' },
        { status: 400, statusText: 'Bad Request' }
      );
    });
  });

  describe('confirmEmailChange', () => {
    it('POSTs to the public /api/auth/change-email/confirm endpoint with { token }', () => {
      service.confirmEmailChange({ token: 'abc123' });

      const req = httpTesting.expectOne(`${environment.apiUrl}/api/auth/change-email/confirm`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ token: 'abc123' });
      req.flush({ code: 200, message: 'OK', data: { newEmail: 'new@example.com' } });
    });
  });

  describe('resendEmailChangeVerification', () => {
    it('POSTs to /api/auth/change-email/resend with an empty body', () => {
      service.resendEmailChangeVerification();

      const req = httpTesting.expectOne(`${environment.apiUrl}/api/auth/change-email/resend`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ code: 200, message: 'OK' });
    });

    it('does not set SKIP_AUTH_LOGOUT — a real 401 here means a dead session, force-logout is correct', () => {
      service.resendEmailChangeVerification();

      const req = httpTesting.expectOne(`${environment.apiUrl}/api/auth/change-email/resend`);
      expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeFalse();
      req.flush(
        { errorCode: 'AUTH_ERROR_RATE_LIMIT_EXCEEDED' },
        { status: 429, statusText: 'Too Many Requests' }
      );
    });
  });

  // OBRS-855
  describe('refresh token storage, refreshSession and logout', () => {
    const loginBody = (refreshToken?: string, accessToken = 'access-1') => ({
      code: 200,
      data: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: 3600,
        ...(refreshToken ? { refreshToken } : {}),
        user: {
          id: 1,
          fullName: 'R',
          email: 'rider@example.com',
          preferredLocale: 'th',
          status: 'ACTIVE',
          roles: ['user'],
        },
      },
    });

    it('login stores the refresh token alongside the access token', async () => {
      const promise = service.login({ email: 'rider@example.com', password: 'pw' });

      httpTesting
        .expectOne(`${environment.apiUrl}/api/auth/login`)
        .flush(loginBody('refresh-1'));
      await promise;

      expect(localStorage.getItem('auth_refresh_token')).toBe('refresh-1');
    });

    it('a login response with NO refreshToken REMOVES any stored one rather than leaving it', async () => {
      // The trap this closes: a leftover token belongs to a session the backend has already
      // replaced, so presenting it later reads as replay — and the backend answers a replay by
      // revoking every live token the user has. Signing in would be what signs them out.
      localStorage.setItem('auth_refresh_token', 'token-from-a-previous-session');

      const promise = service.login({ email: 'rider@example.com', password: 'pw' });
      httpTesting.expectOne(`${environment.apiUrl}/api/auth/login`).flush(loginBody());
      await promise;

      expect(localStorage.getItem('auth_refresh_token')).toBeNull();
    });

    it('refreshSession POSTs the stored token and stores the ROTATED one it gets back', (done) => {
      localStorage.setItem('auth_refresh_token', 'refresh-1');

      service.refreshSession().subscribe((accessToken) => {
        expect(accessToken).toBe('access-2');
        expect(localStorage.getItem('auth_token')).toBe('access-2');
        expect(localStorage.getItem('auth_refresh_token')).toBe('refresh-2');
        done();
      });

      const req = httpTesting.expectOne(`${environment.apiUrl}/api/auth/refresh`);
      expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
      // Both are set: the interceptor is already mid-401-handling when this runs, and a second
      // force-logout or toast fired from inside the recovery would step on its verdict.
      expect(req.request.context.get(SKIP_AUTH_LOGOUT)).toBeTrue();
      expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();
      req.flush(loginBody('refresh-2', 'access-2'));
    });

    it('refreshSession with no stored token fails WITHOUT issuing a request', (done) => {
      service.refreshSession().subscribe({
        next: () => fail('should not emit'),
        error: () => {
          httpTesting.expectNone(`${environment.apiUrl}/api/auth/refresh`);
          done();
        },
      });
    });

    it('logout revokes server-side, and clears local state BEFORE the call so a failed network cannot strand the user', () => {
      localStorage.setItem('auth_token', 'access-1');
      localStorage.setItem('auth_refresh_token', 'refresh-1');

      service.logout();

      // Already gone by the time the request is inspected — the ordering is the assertion.
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(localStorage.getItem('auth_refresh_token')).toBeNull();

      const req = httpTesting.expectOne(`${environment.apiUrl}/api/auth/logout`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
      req.flush({ code: 200 });
    });

    it('logout issues no request when there is no refresh token to revoke', () => {
      localStorage.setItem('auth_token', 'access-1');

      service.logout();

      httpTesting.expectNone(`${environment.apiUrl}/api/auth/logout`);
      expect(localStorage.getItem('auth_token')).toBeNull();
    });
  });

  // OBRS-903. The destination is written by AuthGuard in the tab the customer
  // was bounced from, and read in the tab the e-mail verification link opened —
  // a different tab. Every case below is about that boundary, plus the TTL that
  // stops a cross-tab store from also being a cross-day one.
  describe('post-login return URL — survives a NEW TAB, expires on its own (OBRS-903)', () => {
    const RETURN_URL_KEY = 'auth_return_url';
    const PASSENGER_INFO = '/passenger-info';

    /** Rewrites the stored `savedAt` instead of mocking the clock, so the
     *  assertion runs against the same envelope production reads. */
    function ageStoredReturnUrlBy(ms: number): void {
      const envelope = JSON.parse(
        localStorage.getItem(RETURN_URL_KEY) as string
      ) as { savedAt: number };
      envelope.savedAt -= ms;
      localStorage.setItem(RETURN_URL_KEY, JSON.stringify(envelope));
    }

    it('fails-on-old / passes-on-new: the destination is still there in a tab that shares no sessionStorage', () => {
      service.setPostLoginRedirectUrl(PASSENGER_INFO);

      // The mail link opens a new tab — fresh sessionStorage, same localStorage.
      // While the value lived in sessionStorage this single line was the whole
      // bug: the destination was simply absent and login went to the home route.
      sessionStorage.clear();

      expect(service.consumePostLoginRedirectUrl('/')).toBe(PASSENGER_INFO);
    });

    it('is consumed exactly once — the next login is not redirected again', () => {
      service.setPostLoginRedirectUrl(PASSENGER_INFO);

      expect(service.consumePostLoginRedirectUrl('/')).toBe(PASSENGER_INFO);
      expect(service.consumePostLoginRedirectUrl('/')).toBe('/');
    });

    it('AC4 in-window: an entry younger than the 30-minute TTL is used', () => {
      service.setPostLoginRedirectUrl(PASSENGER_INFO);
      ageStoredReturnUrlBy(29 * 60 * 1000);

      expect(service.consumePostLoginRedirectUrl('/')).toBe(PASSENGER_INFO);
    });

    it('AC4 out-of-window: an entry past the TTL is ignored AND removed', () => {
      service.setPostLoginRedirectUrl(PASSENGER_INFO);
      ageStoredReturnUrlBy(31 * 60 * 1000);

      expect(service.consumePostLoginRedirectUrl('/somewhere')).toBe('/somewhere');
      expect(localStorage.getItem(RETURN_URL_KEY)).toBeNull();
    });

    it('must-NOT: an auth page is refused on WRITE — login may not redirect to itself', () => {
      service.setPostLoginRedirectUrl('/login');

      expect(localStorage.getItem(RETURN_URL_KEY)).toBeNull();
      expect(service.consumePostLoginRedirectUrl('/')).toBe('/');
    });

    it('must-NOT: an auth page planted in storage is refused on READ too', () => {
      // localStorage is user-editable and outlives a deploy, so the read-side
      // check is what actually stops a spent /reset-password token (OBRS-613)
      // from being handed back as a destination.
      localStorage.setItem(
        RETURN_URL_KEY,
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          value: '/reset-password?token=already-spent',
        })
      );

      expect(service.consumePostLoginRedirectUrl('/')).toBe('/');
    });

    it('AC2 — every sign-in route goes through navigateAfterLogin, so all three come back', async () => {
      // Password, Google (login.component.ts:242) and phone+OTP
      // (otp-validate.component.ts:141) all call this one method; none of them
      // reads storage itself. Pinning it here is what makes "and Google, and
      // OTP" a fact about the code rather than a hope — neither of those can be
      // driven headless (a real consent screen, a real SMS).
      service.setPostLoginRedirectUrl('/passenger-info');
      const router = TestBed.inject(Router);

      await service.navigateAfterLogin('/');

      expect(router.navigateByUrl).toHaveBeenCalledWith('/passenger-info');
    });

    it('signing out drops the cross-tab booking context — a shared machine keeps nothing', () => {
      rememberBookingSelection([
        { id: 7 } as unknown as Schedule,
      ]);
      expect(readBookingContext()?.selection?.length).toBe(1);

      service.logout(); // no refresh token stored, so no HTTP call to verify

      expect(readBookingContext()).toBeNull();
    });
  });
});
