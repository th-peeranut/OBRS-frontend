import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Data,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AlertService } from '../shared/services/alert.service';

/**
 * Guards the area-based access model (see AuthService):
 *   - admin portal / staff portal are role-gated and require auth
 *   - public/customer pages are open to guests AND to every logged-in role;
 *     `requireAuth` narrows by authentication only, never by role (OBRS-1001)
 */
describe('AuthGuard (area-based access)', () => {
  let guard: AuthGuard;
  let auth: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;
  let alert: jasmine.SpyObj<AlertService>;

  const route = (data: Data): ActivatedRouteSnapshot =>
    ({ data } as ActivatedRouteSnapshot);
  const stateFor = (url: string): RouterStateSnapshot =>
    ({ url } as RouterStateSnapshot);
  // parseUrl is stubbed to echo its target so assertions can read it back.
  const targetOf = (result: boolean | UrlTree): string =>
    (result as unknown as { url: string }).url;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', [
      'isAuthenticated',
      'getHomeRoute',
      'hasAnyRole',
      'setPostLoginRedirectUrl',
    ]);
    router = jasmine.createSpyObj<Router>('Router', ['parseUrl']);
    router.parseUrl.and.callFake(
      (url: string) => ({ url } as unknown as UrlTree)
    );
    alert = jasmine.createSpyObj<AlertService>('AlertService', ['error', 'permissionDenied']);

    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        { provide: AlertService, useValue: alert },
        {
          provide: TranslateService,
          useValue: { instant: (k: string) => k },
        },
      ],
    });
    guard = TestBed.inject(AuthGuard);
  });

  describe('customer/public pages', () => {
    it('lets a guest browse', () => {
      auth.isAuthenticated.and.returnValue(false);
      const result = guard.canActivate(
        route({ customerArea: true }),
        stateFor('/')
      );
      expect(result).toBe(true);
    });

    it('lets a logged-in customer through', () => {
      auth.isAuthenticated.and.returnValue(true);
      const result = guard.canActivate(
        route({ customerArea: true }),
        stateFor('/')
      );
      expect(result).toBe(true);
    });

    // OBRS-1001: the public area no longer consults ROLES at all. This asserts
    // the ABSENCE of the old bounce, so it is written as "getHomeRoute was
    // never even asked" rather than only "the result was true" — a future
    // re-introduction of a role check would have to call it to know where to
    // send them, and a bare truthy assertion could go on passing beside a
    // half-restored one.
    it('lets a logged-in user through without consulting their portal home', () => {
      auth.isAuthenticated.and.returnValue(true);
      auth.getHomeRoute.and.returnValue('/staff');
      const result = guard.canActivate(
        route({ customerArea: true }),
        stateFor('/')
      );
      expect(result).toBe(true);
      expect(auth.getHomeRoute).not.toHaveBeenCalled();
    });

    it('lets a logged-in user through on a requireAuth page (no role narrowing)', () => {
      auth.isAuthenticated.and.returnValue(true);
      const result = guard.canActivate(
        route({ customerArea: true, requireAuth: true }),
        stateFor('/my-bookings')
      );
      expect(result).toBe(true);
      expect(auth.setPostLoginRedirectUrl).not.toHaveBeenCalled();
    });

    it('forces a guest to log in on a requireAuth page (My Bookings)', () => {
      auth.isAuthenticated.and.returnValue(false);
      const result = guard.canActivate(
        route({ customerArea: true, requireAuth: true }),
        stateFor('/my-bookings')
      );
      expect(targetOf(result)).toBe('/login');
      expect(auth.setPostLoginRedirectUrl).toHaveBeenCalledWith('/my-bookings');
    });
  });

  describe('protected portal (admin/staff)', () => {
    it('redirects an unauthenticated user to login and remembers the target', () => {
      auth.isAuthenticated.and.returnValue(false);
      const result = guard.canActivate(
        route({ requiredRoles: ['admin'] }),
        stateFor('/admin')
      );
      expect(targetOf(result)).toBe('/login');
      expect(auth.setPostLoginRedirectUrl).toHaveBeenCalledWith('/admin');
    });

    it('allows an authenticated user with the required role', () => {
      auth.isAuthenticated.and.returnValue(true);
      auth.hasAnyRole.and.returnValue(true);
      const result = guard.canActivate(
        route({ requiredRoles: ['admin'] }),
        stateFor('/admin')
      );
      expect(result).toBe(true);
    });

    it('bounces an authenticated user lacking the role to their own home area', () => {
      auth.isAuthenticated.and.returnValue(true);
      auth.hasAnyRole.and.returnValue(false);
      auth.getHomeRoute.and.returnValue('/staff');
      const result = guard.canActivate(
        route({ requiredRoles: ['admin'] }),
        stateFor('/admin')
      );
      expect(targetOf(result)).toBe('/staff');
      expect(alert.permissionDenied).toHaveBeenCalled();
    });
  });
});

/**
 * OBRS-1001 — the same guard, wired to the REAL AuthService.
 *
 * The suite above stubs AuthService, so it can only ever assert what the guard
 * does with an answer it was handed. That is exactly how this bug survived: the
 * old `bounces a logged-in admin to their portal` case fed the stub
 * `canAccessCustomerArea() === false` by hand and passed, while nothing anywhere
 * asked the real service what it returns for `["salesperson"]`. The block below
 * reads roles out of localStorage the way the browser does, so it fails on the
 * pre-OBRS-1001 code (which returned a UrlTree to /staff) and passes on this one.
 *
 * Measured on SIT before the fix (2026-08-03): `salesperson@system.local` typing
 * `/` landed on `/staff/sell`; `driver@system.local` landed on `/staff/driver`.
 */
describe('AuthGuard — public area with the real AuthService (OBRS-1001)', () => {
  let guard: AuthGuard;

  const route = (data: Data): ActivatedRouteSnapshot =>
    ({ data } as ActivatedRouteSnapshot);
  const stateFor = (url: string): RouterStateSnapshot =>
    ({ url } as RouterStateSnapshot);

  const signInAs = (roles: string[]) => {
    localStorage.setItem('auth_token', 'test-token');
    localStorage.setItem('auth_roles', JSON.stringify(roles));
  };

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        AuthService,
        { provide: HttpClient, useValue: {} },
        {
          provide: Router,
          useValue: {
            parseUrl: (url: string) => ({ url } as unknown as UrlTree),
            navigate: () => Promise.resolve(true),
            navigateByUrl: () => Promise.resolve(true),
          },
        },
        {
          provide: AlertService,
          useValue: jasmine.createSpyObj<AlertService>('AlertService', [
            'error',
            'permissionDenied',
          ]),
        },
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    });
    guard = TestBed.inject(AuthGuard);
  });

  afterEach(() => localStorage.clear());

  // The two roles the bug was reported on. `true` here is the whole fix.
  for (const role of ['salesperson', 'driver']) {
    it(`lets a signed-in ${role} onto the public home page`, () => {
      signInAs([role]);
      expect(guard.canActivate(route({ customerArea: true }), stateFor('/'))).toBe(
        true
      );
    });
  }

  // Controls — these already worked before the fix and must keep working, so a
  // regression that re-confines everyone cannot hide behind the two cases above.
  for (const role of ['owner', 'admin', 'customer']) {
    it(`still lets a signed-in ${role} onto the public home page`, () => {
      signInAs([role]);
      expect(guard.canActivate(route({ customerArea: true }), stateFor('/'))).toBe(
        true
      );
    });
  }

  it('still sends a GUEST to /login on a requireAuth page — auth, not role, is what narrows', () => {
    const result = guard.canActivate(
      route({ customerArea: true, requireAuth: true }),
      stateFor('/my-bookings')
    );
    expect((result as unknown as { url: string }).url).toBe('/login');
  });

  it('still keeps a driver OUT of the salesperson-only staff pages', () => {
    signInAs(['driver']);
    const result = guard.canActivate(
      route({ requiredRoles: ['salesperson'] }),
      stateFor('/staff/sell')
    );
    expect((result as unknown as { url: string }).url).toBe('/staff');
  });
});
