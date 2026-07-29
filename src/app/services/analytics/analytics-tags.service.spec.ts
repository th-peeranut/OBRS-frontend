import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AnalyticsTagsService } from './analytics-tags.service';

/**
 * OBRS-867. A fake DOCUMENT is used rather than the real one on purpose: a real
 * `head.appendChild` of a `googletagmanager.com` script would make this suite
 * fetch Google's tag on every CI run — a spec that reaches the public internet
 * is a spec that fails on a bad day for reasons that have nothing to do with
 * the code.
 */
describe('AnalyticsTagsService', () => {
  let appended: HTMLScriptElement[];
  let fakeWindow: Record<string, unknown>;
  let fakeDocument: Document;

  /** `environment.analytics` is shared by reference — always restore it. */
  const originalAnalytics = { ...environment.analytics };

  function configure(ga4: string, clarity: string): void {
    environment.analytics.ga4MeasurementId = ga4;
    environment.analytics.clarityProjectId = clarity;
  }

  function build(): AnalyticsTagsService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: fakeDocument }],
    });
    return TestBed.inject(AnalyticsTagsService);
  }

  beforeEach(() => {
    appended = [];
    fakeWindow = {};
    fakeDocument = {
      defaultView: fakeWindow,
      getElementById: (id: string) => appended.find((el) => el.id === id) ?? null,
      createElement: (tag: string) => document.createElement(tag),
      head: {
        appendChild: (el: HTMLScriptElement) => {
          appended.push(el);
          return el;
        },
      },
    } as unknown as Document;
  });

  afterEach(() => {
    environment.analytics.ga4MeasurementId = originalAnalytics.ga4MeasurementId;
    environment.analytics.clarityProjectId = originalAnalytics.clarityProjectId;
  });

  describe('a blank ID is a no-op, not a broken tag', () => {
    it('injects nothing and touches no global when both IDs are blank', () => {
      configure('', '');
      const service = build();

      service.load();

      expect(appended).toEqual([]);
      expect(fakeWindow['dataLayer']).toBeUndefined();
      expect(fakeWindow['gtag']).toBeUndefined();
      expect(fakeWindow['clarity']).toBeUndefined();
      expect(service.isGa4Active).toBe(false);
      expect(service.isClarityActive).toBe(false);
    });

    it('is the state a fresh clone and CI always take (committed defaults are blank)', () => {
      // Guards the committed default itself, not just the branch. If someone
      // ever pastes a real property ID into environment.base.ts, every local
      // run and every CI run starts writing into the production property and
      // nothing else in the suite would notice.
      expect(originalAnalytics.ga4MeasurementId).toBe('');
      expect(originalAnalytics.clarityProjectId).toBe('');
    });

    it('loads only the tag that is configured', () => {
      configure('G-ABC123', '');
      const service = build();

      service.load();

      expect(appended.length).toBe(1);
      expect(service.isGa4Active).toBe(true);
      expect(service.isClarityActive).toBe(false);
    });
  });

  describe('GA4', () => {
    beforeEach(() => configure('G-ABC123', ''));

    it('appends the tag with the measurement ID in the src', () => {
      build().load();

      expect(appended.length).toBe(1);
      expect(appended[0].src).toBe(
        'https://www.googletagmanager.com/gtag/js?id=G-ABC123'
      );
      expect(appended[0].async).toBe(true);
    });

    it('configures away the defaults we have no consent basis for', () => {
      const calls: unknown[][] = [];
      fakeWindow['gtag'] = (...args: unknown[]) => calls.push(args);

      build().load();

      const configCall = calls.find((c) => c[0] === 'config');
      expect(configCall).toBeDefined();
      expect(configCall?.[1]).toBe('G-ABC123');
      expect(configCall?.[2]).toEqual(
        jasmine.objectContaining({
          send_page_view: false,
          anonymize_ip: true,
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
        })
      );
    });

    it('is idempotent — a second load() adds no second tag', () => {
      const service = build();

      service.load();
      service.load();
      service.load();

      expect(appended.length).toBe(1);
    });
  });

  describe('Clarity', () => {
    beforeEach(() => configure('', 'clarity-xyz'));

    it('appends the tag and installs the queueing stub the real tag drains', () => {
      build().load();

      expect(appended.length).toBe(1);
      expect(appended[0].src).toBe('https://www.clarity.ms/tag/clarity-xyz');
      expect(typeof fakeWindow['clarity']).toBe('function');
      expect((fakeWindow['clarity'] as { q?: unknown[] }).q).toEqual([]);
    });
  });

  describe('sendEvent', () => {
    it('does nothing when no tag is loaded', () => {
      configure('', '');
      const gtagSpy = jasmine.createSpy('gtag');
      fakeWindow['gtag'] = gtagSpy;

      build().sendEvent('booking_completed', { payment_method: 'card' });

      expect(gtagSpy).not.toHaveBeenCalled();
    });

    it('forwards name and params to GA4', () => {
      configure('G-ABC123', '');
      const gtagSpy = jasmine.createSpy('gtag');
      fakeWindow['gtag'] = gtagSpy;
      const service = build();
      service.load();

      service.sendEvent('search_no_results', { route_from: 'chonburi' });

      expect(gtagSpy).toHaveBeenCalledWith('event', 'search_no_results', {
        route_from: 'chonburi',
      });
    });

    it('gives Clarity the event NAME only, never the parameter bag', () => {
      configure('', 'clarity-xyz');
      const claritySpy = jasmine.createSpy('clarity');
      fakeWindow['clarity'] = claritySpy;
      const service = build();
      service.load();

      service.sendEvent('booking_completed', { payment_method: 'qr_promptpay' });

      expect(claritySpy).toHaveBeenCalledWith('event', 'booking_completed');
      expect(claritySpy.calls.mostRecent().args.length).toBe(2);
    });
  });
});
