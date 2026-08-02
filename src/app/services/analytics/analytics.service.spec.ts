import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AnalyticsConsentService } from './analytics-consent.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsTagsService } from './analytics-tags.service';

/**
 * OBRS-867 AC-1 lives in this file.
 *
 * AC-1 is written as "prove it by watching the network, not by reading the
 * code", and that live check is still owed on SIT. What a unit test CAN prove,
 * and what this suite pins, is the layer underneath it: the tag loader is never
 * even asked to load, and no event is ever handed to it, until consent is
 * `granted`. If that holds, there is nothing left to observe on the network.
 */
describe('AnalyticsService', () => {
  let routerEvents: Subject<NavigationEnd>;
  let routeSnapshotRoot: unknown;
  let tags: jasmine.SpyObj<AnalyticsTagsService>;
  let consent: AnalyticsConsentService;
  let service: AnalyticsService;

  const originalProduction = environment.production;

  /** One node of a fixture chain: a bare path, or a path carrying route data. */
  type ChainNode = string | { path: string; data: Record<string, unknown> };

  /**
   * Builds a snapshot chain the way ActivatedRouteSnapshot nests.
   *
   * Populates BOTH `firstChild` and `children`: the page_view walk reads the
   * former and the OBRS-887 scope walk reads the latter, and a fixture that
   * only built one would let a regression in the other pass unseen.
   */
  function snapshotChain(...nodes: ChainNode[]): unknown {
    let node: unknown = null;
    for (const entry of [...nodes].reverse()) {
      const path = typeof entry === 'string' ? entry : entry.path;
      const data = typeof entry === 'string' ? {} : entry.data;
      node = {
        routeConfig: { path },
        data,
        firstChild: node,
        children: node ? [node] : [],
      };
    }
    return { routeConfig: null, data: {}, firstChild: node, children: node ? [node] : [] };
  }

  /** Completes a navigation, which is what moves the scope off `unknown`. */
  function navigate(url = '/passenger-info'): void {
    routerEvents.next(new NavigationEnd(1, url, url));
  }

  beforeEach(() => {
    localStorage.clear();
    routerEvents = new Subject<NavigationEnd>();
    routeSnapshotRoot = snapshotChain('passenger-info');
    tags = jasmine.createSpyObj<AnalyticsTagsService>('AnalyticsTagsService', [
      'load',
      'sendEvent',
      'setSuspended',
    ]);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AnalyticsTagsService, useValue: tags },
        {
          provide: Router,
          useValue: {
            events: routerEvents.asObservable(),
            get routerState() {
              return { snapshot: { root: routeSnapshotRoot } };
            },
          },
        },
        {
          provide: TranslateService,
          useValue: { currentLang: 'th', defaultLang: 'th' },
        },
      ],
    });

    consent = TestBed.inject(AnalyticsConsentService);
    service = TestBed.inject(AnalyticsService);
  });

  afterEach(() => {
    service.destroy();
    environment.production = originalProduction;
    localStorage.clear();
  });

  describe('AC-1 — nothing may fire before consent', () => {
    it('does not load a tag on init()', () => {
      service.init();

      expect(tags.load).not.toHaveBeenCalled();
    });

    it('does not load a tag on navigation while the answer is unset', () => {
      service.init();

      routerEvents.next(new NavigationEnd(1, '/passenger-info', '/passenger-info'));

      expect(tags.load).not.toHaveBeenCalled();
      expect(tags.sendEvent).not.toHaveBeenCalled();
    });

    it('sends nothing while the answer is unset', () => {
      service.init();

      service.track('booking_completed', { payment_method: 'card' });

      expect(tags.sendEvent).not.toHaveBeenCalled();
    });

    it('sends nothing after an explicit decline', () => {
      service.init();
      consent.deny();

      service.track('booking_completed', { payment_method: 'card' });
      routerEvents.next(new NavigationEnd(1, '/payment', '/payment'));

      expect(tags.load).not.toHaveBeenCalled();
      expect(tags.sendEvent).not.toHaveBeenCalled();
    });

    it('stops sending again after consent is withdrawn', () => {
      service.init();
      consent.grant();
      service.track('search_submitted', { route_from: 'chonburi' });
      expect(tags.sendEvent).toHaveBeenCalledTimes(1);

      consent.reset();
      service.track('search_submitted', { route_from: 'chonburi' });

      // Still one. A service that latched `granted` at startup would show two.
      expect(tags.sendEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('after consent is granted', () => {
    it('loads the tags exactly once', () => {
      service.init();
      navigate();

      consent.grant();
      consent.grant();

      expect(tags.load).toHaveBeenCalledTimes(1);
    });

    it('loads the tags for a visitor who accepted on an earlier visit', () => {
      consent.grant();

      service.init();
      navigate();

      expect(tags.load).toHaveBeenCalledTimes(1);
    });

    it('waits for a resolved route before loading, even with consent in hand', () => {
      // OBRS-887. Both of the tests above used to pass with no navigation at
      // all, because loading asked one question ("granted?"). That is the exact
      // window a deep link to /staff/sell arrives in: a returning staff member
      // carries `granted` in localStorage, so a loader that did not wait would
      // inject Clarity before anything knew which page was opening — and there
      // is no unloading it afterwards.
      consent.grant();

      service.init();

      expect(tags.load).not.toHaveBeenCalled();
    });

    it('forwards the event', () => {
      service.init();
      consent.grant();

      service.track('search_no_results', {
        route_from: 'chonburi',
        route_to: 'bangkok',
        search_date: '2026-07-29',
      });

      expect(tags.sendEvent).toHaveBeenCalledWith('search_no_results', {
        route_from: 'chonburi',
        route_to: 'bangkok',
        search_date: '2026-07-29',
      });
    });

    it('never lets a transport failure reach the caller', () => {
      service.init();
      consent.grant();
      tags.sendEvent.and.throwError('blocked by an ad blocker');
      spyOn(console, 'warn');

      expect(() => service.track('booking_completed')).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('page_view reports the route PATTERN, never the resolved URL', () => {
    it('collapses a parameterised route to its pattern', () => {
      // `/otp/sms/0812345678` is a real reachable URL in this app. Sending it
      // verbatim would put a customer's phone number in a third-party
      // dashboard through the one parameter nobody thinks of as a payload.
      routeSnapshotRoot = snapshotChain('otp/:option/:phoneno');
      service.init();
      consent.grant();

      routerEvents.next(
        new NavigationEnd(1, '/otp/sms/0812345678', '/otp/sms/0812345678')
      );

      expect(tags.sendEvent).toHaveBeenCalledWith('page_view', {
        page_path: '/otp/:option/:phoneno',
        page_language: 'th',
      });
    });

    it('joins a nested lazy-loaded route into one path', () => {
      // OBRS-887 changed this fixture. It used to be
      // `snapshotChain('admin', 'settings/booking-policy')`, i.e. this suite
      // asserted that an ADMIN page_view is delivered — the behaviour that card
      // forbids. The nesting shape is what is under test, so it now uses a
      // customer route; the child path is illustrative, the join is not.
      routeSnapshotRoot = snapshotChain('parcel-booking', 'summary');
      service.init();
      consent.grant();

      routerEvents.next(
        new NavigationEnd(1, '/parcel-booking/summary', '/parcel-booking/summary')
      );

      expect(tags.sendEvent).toHaveBeenCalledWith(
        'page_view',
        jasmine.objectContaining({ page_path: '/parcel-booking/summary' })
      );
    });

    it('reports the root route as "/"', () => {
      routeSnapshotRoot = snapshotChain();
      service.init();
      consent.grant();

      routerEvents.next(new NavigationEnd(1, '/', '/'));

      expect(tags.sendEvent).toHaveBeenCalledWith(
        'page_view',
        jasmine.objectContaining({ page_path: '/' })
      );
    });
  });

  describe('AC-4 — the PII guard is armed here, not only in the pure function', () => {
    it('throws on a non-production build so the developer meets the bug', () => {
      environment.production = false;
      service.init();
      consent.grant();
      spyOn(console, 'error');

      expect(() =>
        service.track('booking_completed', { email: 'somsak@example.com' } as never)
      ).toThrowError(/OBRS-867 AC-4/);
    });

    it('runs even when the developer has personally declined analytics', () => {
      // If the guard sat behind the consent check, it would only ever be armed
      // for whoever happened to press accept.
      environment.production = false;
      service.init();
      consent.deny();
      spyOn(console, 'error');

      expect(() =>
        service.track('booking_completed', { phone: '0812345678' } as never)
      ).toThrow();
    });

    it('in production, strips and keeps going — a customer is never stopped', () => {
      environment.production = true;
      service.init();
      consent.grant();
      spyOn(console, 'error');

      expect(() =>
        service.track('booking_completed', {
          payment_method: 'card',
          email: 'somsak@example.com',
        } as never)
      ).not.toThrow();

      expect(tags.sendEvent).toHaveBeenCalledWith('booking_completed', {
        payment_method: 'card',
      });
      expect(console.error).toHaveBeenCalled();
    });
  });

  /**
   * OBRS-887. The screens behind `requiredRoles` display *customers'* personal
   * data, and the staff member holding the keyboard cannot consent to Clarity
   * recording it on their behalf. Consent stays necessary; it stops being
   * sufficient.
   *
   * Both halves are pinned here on purpose. A gate that blocks everything would
   * pass every must-catch below and quietly switch off the sign-up funnel —
   * which is measured through routes that carry NO `customerArea` marker, so an
   * allowlist would have been the easy wrong answer.
   */
  describe('OBRS-887 — staff and admin routes are never measured', () => {
    const STAFF = { path: 'staff', data: { requiredRoles: ['driver', 'salesperson'] } };
    const ADMIN = { path: 'admin', data: { requiredRoles: ['admin'] } };

    describe('must catch', () => {
      it('loads no tag when a returning staff member deep-links into /staff', () => {
        routeSnapshotRoot = snapshotChain(STAFF, 'sell');
        consent.grant();

        service.init();
        navigate('/staff/sell');

        expect(tags.load).not.toHaveBeenCalled();
      });

      it('suspends tags already loaded when the staff member walks in from a customer page', () => {
        // The common path, and the one `load()` refusing to run cannot cover:
        // accept on '/', then sign in and open the POS with both tags live.
        service.init();
        navigate('/');
        consent.grant();
        expect(tags.load).toHaveBeenCalledTimes(1);
        tags.setSuspended.calls.reset();

        routeSnapshotRoot = snapshotChain(STAFF, 'sell');
        navigate('/staff/sell');

        expect(tags.setSuspended).toHaveBeenCalledWith(true);
      });

      it('sends no event from a staff page', () => {
        routeSnapshotRoot = snapshotChain(STAFF, 'sell');
        service.init();
        consent.grant();
        navigate('/staff/sell');
        tags.sendEvent.calls.reset();

        service.track('booking_completed', { payment_method: 'cash' });

        expect(tags.sendEvent).not.toHaveBeenCalled();
      });

      it('sends no page_view from a staff page — not even the route pattern', () => {
        // A single admin path is not personal data. A stream of them is a
        // description of how a named employee spent their shift.
        routeSnapshotRoot = snapshotChain(STAFF, 'sell');
        service.init();
        consent.grant();

        navigate('/staff/sell');

        expect(tags.sendEvent).not.toHaveBeenCalled();
      });

      it('covers the admin portal on the same rule', () => {
        routeSnapshotRoot = snapshotChain(ADMIN, 'settings/booking-policy');
        consent.grant();

        service.init();
        navigate('/admin/settings');

        expect(tags.load).not.toHaveBeenCalled();
        expect(tags.sendEvent).not.toHaveBeenCalled();
      });

      it('catches requiredRoles declared on a CHILD, not only on the shell', () => {
        // admin.module.ts declares roles per page as well as on the shell; a
        // walk that only read the root would miss a page whose own route is the
        // one carrying the marker.
        routeSnapshotRoot = snapshotChain('reports', {
          path: 'refund-void',
          data: { requiredRoles: ['admin', 'owner'] },
        });
        consent.grant();

        service.init();
        navigate('/reports/refund-void');

        expect(tags.load).not.toHaveBeenCalled();
      });
    });

    describe('must NOT catch — the funnel stays measured', () => {
      // These three carry no `customerArea` marker in app-routing.module.ts.
      // Gating on an allowlist instead of on `requiredRoles` would switch every
      // one of them off, and nothing would have reported it.
      for (const [label, chain, url] of [
        ['/login', snapshotChain('login'), '/login'],
        ['/register', snapshotChain('register'), '/register'],
        [
          '/otp/:option/:phoneno',
          snapshotChain('otp/:option/:phoneno'),
          '/otp/sms/0812345678',
        ],
      ] as [string, unknown, string][]) {
        it(`still loads and measures ${label}`, () => {
          routeSnapshotRoot = chain;
          consent.grant();

          service.init();
          navigate(url);

          expect(tags.load).toHaveBeenCalledTimes(1);
          expect(tags.sendEvent).toHaveBeenCalledWith(
            'page_view',
            jasmine.objectContaining({ page_path: label })
          );
        });
      }

      it('resumes when the staff member goes back to a customer page', () => {
        routeSnapshotRoot = snapshotChain(STAFF, 'sell');
        service.init();
        consent.grant();
        navigate('/staff/sell');
        expect(tags.load).not.toHaveBeenCalled();

        routeSnapshotRoot = snapshotChain('my-bookings');
        navigate('/my-bookings');

        expect(tags.setSuspended).toHaveBeenCalledWith(false);
        expect(tags.load).toHaveBeenCalledTimes(1);
      });

      it('does not treat an empty requiredRoles array as a restriction', () => {
        // AuthGuard reads an empty array as "no role required", so this must
        // not become a second, disagreeing definition of what is protected.
        routeSnapshotRoot = snapshotChain({ path: 'promo', data: { requiredRoles: [] } });
        consent.grant();

        service.init();
        navigate('/promo');

        expect(tags.load).toHaveBeenCalledTimes(1);
      });
    });
  });

  it('init() is idempotent — a second call does not double every event', () => {
    service.init();
    service.init();
    consent.grant();

    routerEvents.next(new NavigationEnd(1, '/', '/'));

    expect(tags.sendEvent).toHaveBeenCalledTimes(1);
  });
});
