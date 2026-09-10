import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Route, Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { appRoutes } from './app-routing.module';
import { environment } from '../environments/environment';

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

/**
 * OBRS-1302 — pins WHERE the online-booking close is drawn.
 *
 * A different boundary from the one above, on the same routes, and the two pull
 * in opposite directions: OBRS-856/858 are about keeping the flow open to people
 * without an account, this one is about the whole flow being shut while nobody
 * can serve it. Both must hold at once, so both are pinned in the same file.
 *
 * Asserted BEHAVIOURALLY — each route's functional guards are actually run —
 * rather than by looking for a named guard in `canActivate`. `featureEnabledGuard`
 * returns a closure, so identity comparison is impossible, and matching on
 * `Function.name` or source text would pass for a guard that had been wired to
 * the wrong flag. Running it is the only check that distinguishes those.
 *
 * The must-NOT half is the one that earns its keep: a later "close the booking
 * flow properly" edit that also gates /schedule-booking would delete the
 * timetable — the only part of the online channel still worth having while the
 * counter is unstaffed, and the reason the site keeps its Google position.
 */
describe('appRoutes — online-booking flag boundary (OBRS-1302)', () => {
  const CLOSED_BY_FLAG = ['review-schedule-booking', 'passenger-info', 'payment'];
  const OPEN_REGARDLESS = ['schedule-booking', 'find-booking', 'e-ticket', 'my-bookings'];

  let originalOnlineTicketBooking: boolean;

  beforeEach(async () => {
    originalOnlineTicketBooking = environment.features.onlineTicketBooking;
    localStorage.removeItem('auth_roles');
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      // OBRS-1583: `onlineTicketBookingGuard` injects AuthService, which needs
      // an HttpClient in the injector even though it never issues a request on
      // this path.
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    environment.features.onlineTicketBooking = originalOnlineTicketBooking;
    localStorage.removeItem('auth_roles');
  });

  /**
   * Runs every FUNCTIONAL guard on a route and reports whether any of them
   * redirected to '/'. Class guards (AuthGuard) are skipped: they are not
   * callable this way and are covered by the boundary spec above.
   */
  function redirectsHome(path: string): boolean {
    const route = appRoutes.find((r) => r.path === path);
    if (!route) {
      throw new Error(
        `route '${path}' is missing from appRoutes — this spec's premise is gone, ` +
          `not merely failing. Re-derive the boundary before editing the expectation.`
      );
    }

    const home = TestBed.inject(Router).parseUrl('/').toString();
    const fnGuards = (route.canActivate ?? []).filter(
      (g): g is CanActivateFn => typeof g === 'function' && !('prototype' in g && g.prototype?.canActivate)
    );

    return fnGuards.some((guard) => {
      const result = TestBed.runInInjectionContext(() =>
        guard({} as never, {} as never)
      ) as boolean | UrlTree;
      return result !== true && (result as UrlTree)?.toString?.() === home;
    });
  }

  describe('must-catch: with the flag off, no deep link reaches a seat or the payment form', () => {
    CLOSED_BY_FLAG.forEach((path) => {
      it(`/${path} redirects to home`, () => {
        environment.features.onlineTicketBooking = false;
        expect(redirectsHome(path)).withContext(path).toBeTrue();
      });
    });
  });

  describe('must-catch: flipping the one flag back reopens all three, with no code change', () => {
    CLOSED_BY_FLAG.forEach((path) => {
      it(`/${path} activates again`, () => {
        environment.features.onlineTicketBooking = true;
        expect(redirectsHome(path)).withContext(path).toBeFalse();
      });
    });
  });

  describe('must-NOT: the shop window and the ticket-retrieval routes are never flag-gated', () => {
    OPEN_REGARDLESS.forEach((path) => {
      it(`/${path} stays reachable even with the flag off`, () => {
        environment.features.onlineTicketBooking = false;
        expect(redirectsHome(path)).withContext(path).toBeFalse();
      });
    });
  });

  /**
   * OBRS-1583 — the half of the gate that only the ROUTES can prove.
   *
   * The trip list's button and the notice banner read the predicate through
   * `isOnlineTicketBookingOpen`; the routes reach it through a guard. Wiring
   * one and not the other produces a screen that argues with itself — the
   * button appears, the banner goes, and the click bounces straight back to
   * '/'. Asserting the button and the banner cannot see that; running the real
   * route's real guards can, which is what `redirectsHome` above does.
   *
   * `driver` is asserted apart from `salesperson`: ROLE_GRANTS expands a held
   * role downwards only, so a preview list written `['salesperson']` would pass
   * every assertion here except the driver ones.
   */
  describe('OBRS-1583 — with the flag still off, staff walk the funnel and nobody else does', () => {
    ['owner', 'admin', 'salesperson', 'driver'].forEach((role) => {
      CLOSED_BY_FLAG.forEach((path) => {
        it(`/${path} activates for ${role}`, () => {
          environment.features.onlineTicketBooking = false;
          localStorage.setItem('auth_roles', JSON.stringify([role]));

          expect(redirectsHome(path)).withContext(`${role} -> ${path}`).toBeFalse();
        });
      });
    });

    // The must-NOT-regress half, and the most important assertion on the card:
    // a customer and a signed-out visitor must hit exactly the wall they hit
    // today.
    [null, ['customer'], ['__proto__']].forEach((roles) => {
      CLOSED_BY_FLAG.forEach((path) => {
        it(`/${path} still redirects ${roles ? roles.join(',') : 'a signed-out visitor'} home`, () => {
          environment.features.onlineTicketBooking = false;
          if (roles) {
            localStorage.setItem('auth_roles', JSON.stringify(roles));
          }

          expect(redirectsHome(path)).withContext(`${String(roles)} -> ${path}`).toBeTrue();
        });
      });
    });

    // AC-6: reopening for real is still one value change, and the role
    // condition must not become a NEW way to keep someone out.
    [null, ['customer'], ['driver']].forEach((roles) => {
      it(`flag ON lets ${roles ? roles.join(',') : 'a signed-out visitor'} into all three routes`, () => {
        environment.features.onlineTicketBooking = true;
        if (roles) {
          localStorage.setItem('auth_roles', JSON.stringify(roles));
        }

        CLOSED_BY_FLAG.forEach((path) => {
          expect(redirectsHome(path)).withContext(`${String(roles)} -> ${path}`).toBeFalse();
        });
      });
    });
  });
});
