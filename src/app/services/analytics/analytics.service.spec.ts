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

  /** Builds a snapshot chain the way ActivatedRouteSnapshot nests. */
  function snapshotChain(...paths: string[]): unknown {
    let node: unknown = null;
    for (const path of [...paths].reverse()) {
      node = { routeConfig: { path }, firstChild: node };
    }
    return { routeConfig: null, firstChild: node };
  }

  beforeEach(() => {
    localStorage.clear();
    routerEvents = new Subject<NavigationEnd>();
    routeSnapshotRoot = snapshotChain('passenger-info');
    tags = jasmine.createSpyObj<AnalyticsTagsService>('AnalyticsTagsService', [
      'load',
      'sendEvent',
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

      consent.grant();
      consent.grant();

      expect(tags.load).toHaveBeenCalledTimes(1);
    });

    it('loads the tags for a visitor who accepted on an earlier visit', () => {
      consent.grant();

      service.init();

      expect(tags.load).toHaveBeenCalledTimes(1);
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
      routeSnapshotRoot = snapshotChain('admin', 'settings/booking-policy');
      service.init();
      consent.grant();

      routerEvents.next(new NavigationEnd(1, '/admin/settings', '/admin/settings'));

      expect(tags.sendEvent).toHaveBeenCalledWith(
        'page_view',
        jasmine.objectContaining({ page_path: '/admin/settings/booking-policy' })
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

  it('init() is idempotent — a second call does not double every event', () => {
    service.init();
    service.init();
    consent.grant();

    routerEvents.next(new NavigationEnd(1, '/', '/'));

    expect(tags.sendEvent).toHaveBeenCalledTimes(1);
  });
});
