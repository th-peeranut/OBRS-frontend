import { Route } from '@angular/router';

import { appRoutes } from './app-routing.module';

/**
 * OBRS-856 — pins WHERE the login wall sits in the booking flow.
 *
 * The bug was an asymmetry nobody could see from either file alone: the routes
 * admitted guests all the way to the payment button, while the backend rejected
 * them at POST /api/private/bookings. The route `data` is the only place that
 * asymmetry is expressible, and a `data` flag is exactly the kind of thing a
 * refactor drops silently — no compile error, no failing component test, just a
 * guest walking back into the wall.
 *
 * So both directions are asserted. The must-catch half would pass trivially if
 * someone marked every customer route `requireAuth`, which would close the shop
 * window; the must-NOT half is what stops that.
 */
describe('appRoutes — booking-flow auth boundary (OBRS-856)', () => {
  const routeFor = (path: string): Route => {
    const found = appRoutes.find((r) => r.path === path);
    if (!found) {
      throw new Error(
        `route '${path}' is missing from appRoutes — this spec's premise is gone, ` +
          `not merely failing. Re-derive the boundary before editing the expectation.`
      );
    }
    return found;
  };

  const GATED = ['passenger-info', 'payment'];
  const OPEN_TO_GUESTS = ['schedule-booking', 'review-schedule-booking'];

  describe('must-catch: the steps that commit a booking require a signed-in user', () => {
    GATED.forEach((path) => {
      it(`/${path} sets requireAuth so the guest is asked to sign in BEFORE investing effort`, () => {
        const route = routeFor(path);
        expect(route.data?.['customerArea']).withContext(path).toBeTrue();
        expect(route.data?.['requireAuth']).withContext(path).toBeTrue();
      });

      it(`/${path} still runs AuthGuard (data alone enforces nothing)`, () => {
        expect(routeFor(path).canActivate?.length).withContext(path).toBeGreaterThan(0);
      });
    });
  });

  describe('must-NOT: browsing trips and picking a seat stay open to guests', () => {
    OPEN_TO_GUESTS.forEach((path) => {
      it(`/${path} does NOT set requireAuth — closing it would cost SEO and every fare-checker`, () => {
        const route = routeFor(path);
        expect(route.data?.['customerArea']).withContext(path).toBeTrue();
        expect(route.data?.['requireAuth']).withContext(path).toBeUndefined();
      });
    });
  });
});
