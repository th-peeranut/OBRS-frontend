/**
 * Regression test for OBRS-frontend #30:
 *
 * Importing PassengerInfoModule into StaffModule used to inject its empty-path
 * route ({ path: '', component: PassengerInfoComponent }) into the staff lazy
 * routing context, shadowing StaffModule's own redirect so that bare /staff
 * rendered PassengerInfoComponent inside the public navbar instead of
 * redirecting to /staff/sell inside StaffLayoutComponent.
 *
 * The fix (PassengerSeatModule extraction) removed PassengerInfoModule from
 * StaffModule's imports. These tests assert against the REAL exported route
 * arrays (staffRoutes / passengerInfoRoutes) and the REAL StaffModule import
 * metadata — NOT a hand-mirrored stub. If someone reverts the fix (re-adds
 * PassengerInfoModule to StaffModule, or re-introduces an empty-path
 * PassengerInfoComponent route under staff), these assertions break.
 */
import { Route } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { StaffModule, staffRoutes } from './staff.module';
import { StaffLayoutComponent } from './staff-layout.component';
import { SellPageComponent } from './pages/sell/sell-page.component';
import { AuthService } from '../../auth/auth.service';
import {
  PassengerInfoModule,
  passengerInfoRoutes,
} from '../passenger-info/passenger-info.module';
import { PassengerInfoComponent } from '../passenger-info/passenger-info.component';

/** Recursively collect every `component` referenced anywhere in a route tree. */
function collectComponents(routes: Route[]): unknown[] {
  return routes.flatMap((r) => [
    ...(r.component ? [r.component] : []),
    ...(r.children ? collectComponents(r.children) : []),
  ]);
}

/**
 * Flatten the compiled NgModule injector `imports` graph into a flat set of
 * referenced module classes. Reading the Ivy `ɵinj` definition lets us assert
 * the real import composition without compiling the whole (heavy) module.
 */
function importedModules(moduleClass: unknown): Set<unknown> {
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    const inj = (node as { ɵinj?: { imports?: unknown } })?.ɵinj;
    const imports = inj?.imports;
    if (Array.isArray(imports)) {
      imports.flat(Infinity).forEach(walk);
    }
  };
  walk(moduleClass);
  return seen;
}

describe('StaffModule routing regression (#30 – bare /staff redirect)', () => {
  // Regression for OBRS-frontend #66: bare /staff used to statically redirect to
  // 'sell', which is salesperson-only — so a driver opening the Staff Portal was
  // bounced off the sell guard ("no permission to access the admin page"). The
  // redirect is now role-aware, so a driver lands on their own page.
  it('redirects bare /staff by role: salesperson → sell, driver → driver', () => {
    const shell = staffRoutes.find((r) => r.path === '');
    expect(shell?.component)
      .withContext('the bare staff path must render StaffLayoutComponent')
      .toBe(StaffLayoutComponent);

    const emptyChild = shell?.children?.find((r) => r.path === '');
    expect(emptyChild?.pathMatch).toBe('full');
    expect(typeof emptyChild?.redirectTo)
      .withContext('bare /staff must redirect via a role-aware function')
      .toBe('function');

    const sell = shell?.children?.find((r) => r.path === 'sell');
    expect(sell?.component).toBe(SellPageComponent);

    // Drive the real functional redirect with a stubbed AuthService so the
    // driver branch is exercised end-to-end (the bug only surfaced for drivers).
    const runRedirect = (roles: string[]): unknown => {
      const authStub: Pick<AuthService, 'hasAnyRole'> = {
        hasAnyRole: (required: string[]) =>
          required.some((r) => roles.includes(r)),
      };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: AuthService, useValue: authStub }],
      });
      return TestBed.runInInjectionContext(() =>
        (emptyChild!.redirectTo as (...args: unknown[]) => unknown)({})
      );
    };

    expect(runRedirect(['salesperson']))
      .withContext('salespersons land on the sell desk')
      .toBe('sell');
    expect(runRedirect(['driver']))
      .withContext('drivers (no sell access) land on their schedules page')
      .toBe('driver');
  });

  it('never references PassengerInfoComponent anywhere in the staff route tree', () => {
    // Reads the REAL exported staffRoutes — a directly-added bleed would fail.
    expect(collectComponents(staffRoutes)).not.toContain(PassengerInfoComponent);
  });

  it('does not import PassengerInfoModule (the documented root cause of the bleed)', () => {
    // The original bug: StaffModule imported PassengerInfoModule, whose
    // RouterModule.forChild empty-path route flattened into the staff lazy
    // context and shadowed staff's own redirect. Reverting that import makes
    // this fail, because PassengerInfoModule reappears in the import graph.
    expect(importedModules(StaffModule))
      .withContext('StaffModule must not import PassengerInfoModule')
      .not.toContain(PassengerInfoModule);
  });
});

describe('PassengerInfoModule still owns its own empty-path route (#30)', () => {
  it('keeps { path: "", component: PassengerInfoComponent } for the public flow', () => {
    // The fix must not break the public booking flow: passenger-info must
    // still render PassengerInfoComponent at its own lazy-loaded root.
    const root = passengerInfoRoutes.find((r) => r.path === '');
    expect(root?.component).toBe(PassengerInfoComponent);
  });
});
