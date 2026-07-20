/**
 * OBRS-574 — one schedule selection for both parcel jobs.
 *
 * Before this card a driver working ONE trip picked that trip twice: once under
 * `parcels/verify` to check boxes in, again under `parcels/deliveries` to hand
 * them over. Two entry pickers, byte-for-byte identical apart from where their
 * row button navigated.
 *
 * These specs read the REAL exported `staffRoutes`, never a copy, and pin the
 * two things a restructure like this can quietly get wrong:
 *
 * <p><b>1. The old URLs still resolve.</b> The owner's decision on this card was
 * redirect, not delete — a driver who bookmarked `parcels/verify/8` must land on
 * the merged page ALREADY on the verify tab, not on the page's default tab. A
 * redirect that drops the tab is worse than no redirect: it looks like it worked
 * and silently shows the wrong half of the job.
 *
 * <p><b>2. The merged route is real.</b> Asserting only "the old paths redirect"
 * would stay green if the target did not exist, so the target is asserted to be
 * a component route in the same sweep.
 */
import { Component } from '@angular/core';
import { Route, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { staffRoutes } from '../../staff.module';

@Component({ selector: 'app-blank', template: '' })
class BlankComponent {}

@Component({ selector: 'app-root-harness', template: '<router-outlet></router-outlet>' })
class RootHarnessComponent {}

function shellChildren(): Route[] {
  return staffRoutes.find((r) => r.path === '')?.children ?? [];
}

function routeFor(path: string): Route | undefined {
  return shellChildren().find((r) => r.path === path);
}

describe('OBRS-574 — parcel schedule routes', () => {
  it('routes both parcel jobs through one schedule selection', () => {
    expect(routeFor('parcels/schedule')?.component)
      .withContext('the single entry picker that replaced the two identical ones')
      .toBeDefined();
    expect(routeFor('parcels/schedule/:scheduleId')?.component)
      .withContext('the merged page holding the verify + handover tabs')
      .toBeDefined();
  });

  it('drops the duplicate entry pickers rather than leaving them side by side', () => {
    // The point of the card is that a driver stops choosing between two doors
    // into the same trip. Leaving the old pickers routed keeps that choice on
    // screen even after the merged page ships.
    expect(routeFor('parcels/verify')?.component).toBeUndefined();
    expect(routeFor('parcels/deliveries')?.component).toBeUndefined();
  });

  /**
   * These NAVIGATE, rather than reading `redirectTo` off the config and calling
   * it by hand. Calling it by hand proves the function builds the right URL and
   * says nothing about whether the router ever reaches it — and the first bug
   * this file found lived exactly there: a child route matches by PREFIX, so
   * `parcels/verify` swallowed `parcels/verify/8` and redirected without the
   * tab, never consulting the `:scheduleId` rule at all. Both spellings of the
   * config produce an identical, passing hand-called redirect.
   *
   * The real `staffRoutes` are used verbatim except that components are swapped
   * for a blank one and `canActivate` dropped — matching and redirect
   * resolution are untouched by both, and activating the real pages would drag
   * in every store and guard they depend on.
   */
  describe('legacy URLs (resolved by the real router)', () => {
    let router: Router;

    function navigableStaffRoutes(): Route[] {
      return [
        {
          path: 'staff',
          children: shellChildren().map((child) => {
            const copy: Route = { ...child };
            delete copy.canActivate;
            if (copy.component) copy.component = BlankComponent;
            return copy;
          }),
        },
      ];
    }

    beforeEach(async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        declarations: [BlankComponent, RootHarnessComponent],
        imports: [RouterTestingModule.withRoutes(navigableStaffRoutes())],
      }).compileComponents();

      router = TestBed.inject(Router);
      TestBed.createComponent(RootHarnessComponent).detectChanges();
    });

    it('sends a bookmarked verify URL to the merged page, on the verify tab', async () => {
      await router.navigateByUrl('/staff/parcels/verify/8');

      expect(router.url)
        .withContext('a redirect that drops the tab lands the user on the wrong half of the job')
        .toBe('/staff/parcels/schedule/8?tab=verify');
    });

    it('sends a bookmarked deliveries URL to the merged page, on the handover tab', async () => {
      await router.navigateByUrl('/staff/parcels/deliveries/12');

      expect(router.url).toBe('/staff/parcels/schedule/12?tab=handover');
    });

    it('sends the two old entry pickers to the one that replaced them', async () => {
      for (const url of ['/staff/parcels/verify', '/staff/parcels/deliveries']) {
        await router.navigateByUrl(url);

        expect(router.url).withContext(`'${url}' must still resolve`).toBe('/staff/parcels/schedule');
      }
    });
  });
});
