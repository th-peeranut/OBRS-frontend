import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { AuthGuard } from '../../auth/auth.guard';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { adminRoutes } from './admin.module';

/**
 * OBRS-1498 route-guard spec — admin ✓, owner ✗, on /admin/lookups and
 * /admin/roles.
 *
 * Both directions on purpose (AC-2). The owner half is the decision: every
 * write on LookupController and RoleController is `@PreAuthorize("hasRole('ADMIN')")`,
 * and WebSecurityConfig.java's hierarchy runs ROLE_ADMIN > ROLE_OWNER one way
 * only, so an owner used to get the whole page and a 403 from every button.
 * The admin half is the regression: the same change must leave the role that
 * these pages exist for exactly where it was.
 *
 * Shape and stubs mirror expenses-route-guard.spec.ts — the REAL `adminRoutes`
 * array and the REAL `AuthGuard` + `AuthService` (ROLE_GRANTS expansion stays
 * production code), with only `getRoles()` standing in for the JWT.
 */
describe('OBRS-1498 — /admin/lookups + /admin/roles route guard', () => {
  const children = adminRoutes.find((r) => r.path === '')?.children;
  const routeFor = (path: string) => children?.find((r) => r.path === path);

  function guardFor(roles: string[]): AuthGuard {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule, RouterTestingModule] });
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'getRoles').and.returnValue(roles);
    spyOn(auth, 'isAuthenticated').and.returnValue(true);

    const router = jasmine.createSpyObj<Router>('Router', ['parseUrl']);
    router.parseUrl.and.callFake((url: string) => ({ url } as unknown as UrlTree));
    const alert = jasmine.createSpyObj<AlertService>('AlertService', ['permissionDenied']);
    const translate = { instant: (key: string) => key } as any;

    return new AuthGuard(auth, router, alert, translate);
  }

  function activate(path: string, roles: string[]): boolean | UrlTree {
    return guardFor(roles).canActivate(
      { data: routeFor(path)!.data } as ActivatedRouteSnapshot,
      { url: `/admin/${path}` } as RouterStateSnapshot
    );
  }

  for (const path of ['lookups', 'roles']) {
    describe(`/admin/${path}`, () => {
      it('is registered with requiredHeldRoles: admin, and carries a guard to enforce it', () => {
        expect(routeFor(path)).toBeTruthy();
        expect(routeFor(path)?.data?.['requiredHeldRoles']).toEqual(['admin']);
        expect(routeFor(path)?.canActivate).toContain(AuthGuard);
      });

      it('admits admin — unchanged', () => {
        expect(activate(path, ['admin'])).toBe(true);
      });

      it('refuses owner — bounced to their own home area', () => {
        const result = activate(path, ['owner']);
        expect(result).not.toBe(true);
        expect((result as unknown as { url: string }).url).toBe('/');
      });

      it('refuses salesperson and a plain customer too', () => {
        expect(activate(path, ['salesperson'])).not.toBe(true);
        expect(activate(path, ['customer'])).not.toBe(true);
      });
    });
  }

  it('the refusal is the HELD-role branch, not the area one — an owner still satisfies requiredRoles: ["admin"]', () => {
    // Without this, the specs above would pass just as well against a route
    // written `requiredRoles: ['admin']`, which does NOT keep an owner out
    // (ROLE_GRANTS grants them 'admin') — the exact mistake the card forbids.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule, RouterTestingModule] });
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'getRoles').and.returnValue(['owner']);

    expect(auth.hasAnyRole(['admin'])).toBeTrue();
    expect(auth.hasHeldRole(['admin'])).toBeFalse();
  });

  it('leaves the owner-reachable admin pages alone — no requiredHeldRoles anywhere else', () => {
    const gated = (children ?? [])
      .filter((r) => !!r.data?.['requiredHeldRoles'])
      .map((r) => r.path);

    expect(gated).toEqual(['lookups', 'roles']);
  });
});
