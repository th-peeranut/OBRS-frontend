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

import { StaffModule, staffRoutes } from './staff.module';
import { StaffLayoutComponent } from './staff-layout.component';
import { SellPageComponent } from './pages/sell/sell-page.component';
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
  it('declares an empty-path redirect to "sell" under the StaffLayout shell', () => {
    const shell = staffRoutes.find((r) => r.path === '');
    expect(shell?.component)
      .withContext('the bare staff path must render StaffLayoutComponent')
      .toBe(StaffLayoutComponent);

    const emptyChild = shell?.children?.find((r) => r.path === '');
    expect(emptyChild?.redirectTo)
      .withContext('bare /staff must redirect to sell')
      .toBe('sell');
    expect(emptyChild?.pathMatch).toBe('full');

    const sell = shell?.children?.find((r) => r.path === 'sell');
    expect(sell?.component).toBe(SellPageComponent);
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
