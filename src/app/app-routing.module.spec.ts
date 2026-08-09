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

  // OBRS-858: GATED is now EMPTY, and the two paths that used to be in it moved down to
  // OPEN_TO_GUESTS. `requireAuth` on /passenger-info and /payment was never a rule of its own -
  // OBRS-856 put it there to MIRROR what POST /api/private/bookings enforced, so the sign-in
  // prompt arrived before the form rather than at the payment button. Guest checkout moves that
  // call to POST /api/bookings (ADR-0123 Decision 1) and there is nothing server-side left to
  // mirror, so keeping the flag would be the frontend refusing a request the backend accepts.
  //
  // The constant stays, empty, rather than being deleted with its describe block: it is the
  // record that these routes were once gated and why they stopped being, and the next person
  // told to "harden the customer area" needs to find that here rather than re-derive it.
  const GATED: string[] = [];
  // OBRS-857 added `find-booking`, and it belongs to the STRONGER half of this list: for
  // schedule-booking a login wall would merely cost traffic, but the booking lookup exists so a
  // customer WITHOUT an account can reach their own ticket. `requireAuth` there does not tighten
  // the page, it deletes the feature — and it is exactly the kind of flag a "harden the customer
  // area" sweep adds without reading the card. OBRS-858 puts /passenger-info and /payment under
  // the same protection, for the same reason: a guest must be able to finish a booking.
  const OPEN_TO_GUESTS = [
    'schedule-booking',
    'review-schedule-booking',
    'find-booking',
    'passenger-info',
    'payment',
  ];

  describe('must-catch: the steps that commit a booking require a signed-in user', () => {
    GATED.forEach((path) => {
      it(`/${path} sets requireAuth so the guest is asked to sign in BEFORE investing effort`, () => {
        const route = routeFor(path);
        expect(route.data?.['customerArea']).withContext(path).toBeTrue();
        expect(route.data?.['requireAuth']).withContext(path).toBeTrue();
      });
    });

    it('every customer-area route still runs AuthGuard — `data` alone enforces nothing', () => {
      [...GATED, ...OPEN_TO_GUESTS].forEach((path) => {
        expect(routeFor(path).canActivate?.length).withContext(path).toBeGreaterThan(0);
      });
    });
  });

  describe('must-NOT: browsing trips, picking a seat AND finishing the booking stay open to guests', () => {
    OPEN_TO_GUESTS.forEach((path) => {
      it(`/${path} does NOT set requireAuth — closing it would cost SEO and every fare-checker`, () => {
        const route = routeFor(path);
        expect(route.data?.['customerArea']).withContext(path).toBeTrue();
        expect(route.data?.['requireAuth']).withContext(path).toBeUndefined();
      });
    });
  });
});
