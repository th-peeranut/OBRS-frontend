import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { AuthGuard } from '../../../../auth/auth.guard';
import { AuthService } from '../../../../auth/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { adminRoutes } from '../../admin.module';

/**
 * OBRS-685 route-guard spec — owner ✓, admin ✓, salesperson ✗.
 *
 * Reads the REAL `adminRoutes` array (not a hand-mirrored copy of its
 * `requiredRoles` — the exact drift `nav-reachability.spec.ts` guards on the
 * nav side) and drives it through the REAL `AuthGuard` + `AuthService`
 * (`hasAnyRole`/`ROLE_GRANTS` expansion stays production code) — only
 * `AuthService.getRoles()` is stubbed with the role a JWT would have
 * supplied. Router/AlertService/TranslateService are lightweight stubs
 * (mirroring `auth.guard.spec.ts`) purely to keep the guard's redirect path
 * inert in a unit test — never `Swal.fire()`-ing for real.
 */
describe('OBRS-685 — /admin/expenses route guard', () => {
  const expensesRoute = adminRoutes.find((r) => r.path === '')?.children?.find((r) => r.path === 'expenses');

  it('is registered with requiredRoles: admin + owner (mirrors eod-sales-report)', () => {
    expect(expensesRoute).toBeTruthy();
    expect(expensesRoute?.data?.['requiredRoles']).toEqual(['admin', 'owner']);
  });

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

  function activate(guard: AuthGuard): boolean | UrlTree {
    return guard.canActivate(
      { data: expensesRoute!.data } as ActivatedRouteSnapshot,
      { url: '/admin/expenses' } as RouterStateSnapshot
    );
  }

  it('admits owner', () => {
    expect(activate(guardFor(['owner']))).toBe(true);
  });

  it('admits admin', () => {
    expect(activate(guardFor(['admin']))).toBe(true);
  });

  it('refuses salesperson — bounced to their own home area, not admitted', () => {
    const result = activate(guardFor(['salesperson']));
    expect(result).not.toBe(true);
    expect((result as unknown as { url: string }).url).toBe('/staff');
  });

  it('refuses a plain customer (no portal grant at all)', () => {
    const result = activate(guardFor(['customer']));
    expect(result).not.toBe(true);
  });
});
