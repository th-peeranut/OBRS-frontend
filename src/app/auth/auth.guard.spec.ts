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
 *   - public/customer pages let guests browse, but bounce a logged-in
 *     admin/staff user back to their own portal
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
      'canAccessCustomerArea',
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
      auth.canAccessCustomerArea.and.returnValue(true);
      const result = guard.canActivate(
        route({ customerArea: true }),
        stateFor('/')
      );
      expect(result).toBe(true);
    });

    it('bounces a logged-in admin to their portal', () => {
      auth.isAuthenticated.and.returnValue(true);
      auth.canAccessCustomerArea.and.returnValue(false);
      auth.getHomeRoute.and.returnValue('/admin');
      const result = guard.canActivate(
        route({ customerArea: true }),
        stateFor('/')
      );
      expect(targetOf(result)).toBe('/admin');
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
