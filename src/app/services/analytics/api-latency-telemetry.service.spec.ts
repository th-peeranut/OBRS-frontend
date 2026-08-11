import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { AnalyticsService } from './analytics.service';
import { AnalyticsConsentService } from './analytics-consent.service';
import { AnalyticsTagsService } from './analytics-tags.service';
import {
  ApiLatencyTelemetryService,
  ApiRequestOutcome,
  CENSUS_WINDOW_SIZE,
  durationBucket,
  SLOW_REQUEST_THRESHOLD_MS,
} from './api-latency-telemetry.service';
import { AnalyticsPiiError, sanitizeAnalyticsParams } from '../../shared/lib/analytics-pii-guard';

describe('ApiLatencyTelemetryService (OBRS-1223)', () => {
  let analytics: jasmine.SpyObj<AnalyticsService>;
  let service: ApiLatencyTelemetryService;

  beforeEach(() => {
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['track']);
    analytics.track.and.returnValue(true);

    TestBed.configureTestingModule({
      providers: [{ provide: AnalyticsService, useValue: analytics }],
    });
    service = TestBed.inject(ApiLatencyTelemetryService);
  });

  function record(
    durationMs: number,
    outcome: ApiRequestOutcome = 'ok',
    url = 'http://localhost:8080/api/stops'
  ): void {
    service.record({ url, method: 'GET', durationMs, outcome });
  }

  function eventsNamed(name: string) {
    return analytics.track.calls
      .allArgs()
      .filter(([eventName]) => eventName === name)
      .map(([, params]) => params as Record<string, unknown>);
  }

  describe('AC1 — only the tail is reported individually', () => {
    it('sends nothing for a request under the threshold', () => {
      record(SLOW_REQUEST_THRESHOLD_MS - 1);

      expect(eventsNamed('slow_api_request')).toEqual([]);
    });

    it('sends one event at exactly the threshold', () => {
      record(SLOW_REQUEST_THRESHOLD_MS);

      expect(eventsNamed('slow_api_request').length).toBe(1);
    });

    it('carries the endpoint pattern, the bucket, the rounded duration and the outcome', () => {
      record(12_340, 'error', 'http://localhost:8080/api/bookings/42');

      expect(eventsNamed('slow_api_request')[0]).toEqual({
        endpoint_pattern: '/api/bookings/:id',
        http_method: 'GET',
        duration_ms: 12_300,
        duration_bucket: '10-20s',
        outcome: 'error',
      });
    });
  });

  describe('AC4 — the requests the ceiling actually killed are counted apart', () => {
    it('counts a timed_out request in its own census field', () => {
      record(30_000, 'timed_out');
      for (let i = 1; i < CENSUS_WINDOW_SIZE; i += 1) record(100);

      expect(eventsNamed('api_request_census')).toEqual([
        { window_size: CENSUS_WINDOW_SIZE, slow_count: 1, timed_out_count: 1 },
      ]);
    });

    it('does not count an ordinary error as a timeout', () => {
      record(30_000, 'error');
      for (let i = 1; i < CENSUS_WINDOW_SIZE; i += 1) record(100);

      expect(eventsNamed('api_request_census')[0]['timed_out_count']).toBe(0);
    });
  });

  describe('the census, i.e. the denominator', () => {
    it('emits nothing until the window closes', () => {
      for (let i = 0; i < CENSUS_WINDOW_SIZE - 1; i += 1) record(100);

      expect(eventsNamed('api_request_census')).toEqual([]);
    });

    it('emits once per window and starts the next one clean', () => {
      for (let i = 0; i < CENSUS_WINDOW_SIZE * 2; i += 1) record(100);

      const census = eventsNamed('api_request_census');
      expect(census.length).toBe(2);
      // The second window must not carry the first one's totals -- that is the
      // arithmetic the whole card's conclusion is divided by.
      expect(census[1]).toEqual({
        window_size: CENSUS_WINDOW_SIZE,
        slow_count: 0,
        timed_out_count: 0,
      });
    });

    it('counts fast and slow requests in the SAME window, so the ratio is meaningful', () => {
      record(9_000);
      for (let i = 1; i < CENSUS_WINDOW_SIZE; i += 1) record(50);

      expect(eventsNamed('api_request_census')[0]).toEqual({
        window_size: CENSUS_WINDOW_SIZE,
        slow_count: 1,
        timed_out_count: 0,
      });
    });
  });

  describe('AC5 — telemetry may never break the request it measures', () => {
    it('swallows an AnalyticsPiiError, which track() RETHROWS on a dev build', () => {
      // `AnalyticsService.track` rethrows on a non-production build on purpose,
      // so a developer meets their own leak. Right for a component call site,
      // wrong here: this runs in the interceptor's finalize, on the success path
      // too, so an uncaught throw turns a slow-but-working request into a failed
      // one.
      analytics.track.and.throwError(new AnalyticsPiiError('slow_api_request', ['boom']));
      spyOn(console, 'warn');

      expect(() => record(9_000)).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });

    it('does not double-count a window whose send threw', () => {
      analytics.track.and.throwError(new Error('transport dead'));
      spyOn(console, 'warn');
      for (let i = 0; i < CENSUS_WINDOW_SIZE; i += 1) record(100);

      analytics.track.and.returnValue(true);
      for (let i = 0; i < CENSUS_WINDOW_SIZE; i += 1) record(100);

      // Both attempts are recorded by the spy — jasmine logs a call that threw —
      // so the assertion is on the SECOND window's arithmetic, which is where a
      // missing reset would show up as 2 * CENSUS_WINDOW_SIZE.
      const census = eventsNamed('api_request_census');
      expect(census.length).toBe(2);
      expect(census[1]).toEqual({
        window_size: CENSUS_WINDOW_SIZE,
        slow_count: 0,
        timed_out_count: 0,
      });
    });
  });

  describe('AC2 / AC3 — consent and PII are not re-implemented here', () => {
    it('routes every event through AnalyticsService.track, which owns both gates', () => {
      // The consent gate, the route-scope gate and the PII sanitizer all live in
      // `track`. This test pins that nothing here reaches a provider by another
      // path -- a second copy of a consent rule is a second copy to drift, and
      // the one that gets forgotten is the one a customer withdrew against.
      record(9_000);
      for (let i = 1; i < CENSUS_WINDOW_SIZE; i += 1) record(100);

      expect(analytics.track).toHaveBeenCalledTimes(2);
    });

    it('every parameter it sends survives the PII sanitizer untouched', () => {
      record(31_000, 'timed_out', '/api/bookings/lookup/B-P4HPH6');
      for (let i = 1; i < CENSUS_WINDOW_SIZE; i += 1) record(100);

      for (const params of analytics.track.calls.allArgs().map(([, p]) => p)) {
        const { violations } = sanitizeAnalyticsParams(params);
        expect(violations).withContext(JSON.stringify(params)).toEqual([]);
      }
    });
  });

  it('is a no-op, not a crash, when AnalyticsService cannot be constructed', () => {
    // A headless/SSR-ish injector without Router is the realistic shape of this.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AnalyticsService,
          useFactory: () => {
            throw new Error('no Router in this injector');
          },
        },
      ],
    });
    const bare = TestBed.inject(ApiLatencyTelemetryService);

    expect(() =>
      bare.record({ url: '/api/stops', method: 'GET', durationMs: 9_000, outcome: 'ok' })
    ).not.toThrow();
  });
});

/**
 * AC2, proved through the REAL gate rather than a mock of it.
 *
 * The suite above uses a spy for `AnalyticsService`, which pins that this class
 * calls `track` and nothing else. That is necessary and not sufficient: it says
 * nothing about whether `track` actually stops a latency event when consent is
 * absent, and "the consent check covers page_view but not the event we added
 * last" is precisely the shape of the bug worth catching.
 *
 * So this block wires the real `AnalyticsService` and the real
 * `AnalyticsConsentService`, and asserts on the TAG layer — the last thing
 * before a third party. `obrs-874-analytics-consent-withdraw.spec.ts` already
 * measures the same withdrawal on the wire for the service as a whole; what is
 * added here is that THESE two events sit behind that same gate.
 */
describe('ApiLatencyTelemetryService consent gate (OBRS-1223 AC2)', () => {
  let tags: jasmine.SpyObj<AnalyticsTagsService>;
  let consent: AnalyticsConsentService;
  let telemetry: ApiLatencyTelemetryService;

  beforeEach(() => {
    localStorage.clear();
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
            events: new Subject<never>().asObservable(),
            get routerState() {
              // A customer route: `/` is measurable, unlike /staff or /admin.
              return {
                snapshot: {
                  root: { routeConfig: null, data: {}, firstChild: null, children: [] },
                },
              };
            },
          },
        },
        { provide: TranslateService, useValue: { currentLang: 'th', defaultLang: 'th' } },
      ],
    });

    consent = TestBed.inject(AnalyticsConsentService);
    telemetry = TestBed.inject(ApiLatencyTelemetryService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  function recordSlowThenCloseWindow(): void {
    telemetry.record({
      url: '/api/stops',
      method: 'GET',
      durationMs: 9_000,
      outcome: 'ok',
    });
    for (let i = 1; i < CENSUS_WINDOW_SIZE; i += 1) {
      telemetry.record({ url: '/api/stops', method: 'GET', durationMs: 10, outcome: 'ok' });
    }
  }

  it('sends nothing while the answer is unset — neither the slow event nor the census', () => {
    recordSlowThenCloseWindow();

    expect(tags.sendEvent).not.toHaveBeenCalled();
  });

  it('sends nothing after the customer denies', () => {
    consent.deny();

    recordSlowThenCloseWindow();

    expect(tags.sendEvent).not.toHaveBeenCalled();
  });

  it('sends both once consent is granted — the positive control', () => {
    // Without this, all three tests above pass on a build where the events were
    // never wired up at all.
    consent.grant();

    recordSlowThenCloseWindow();

    const names = tags.sendEvent.calls.allArgs().map(([name]) => name);
    expect(names).toEqual(['slow_api_request', 'api_request_census']);
  });

  it('stops again the moment consent is withdrawn mid-session', () => {
    consent.grant();
    recordSlowThenCloseWindow();
    tags.sendEvent.calls.reset();

    consent.reset();
    recordSlowThenCloseWindow();

    expect(tags.sendEvent).not.toHaveBeenCalled();
  });
});

describe('durationBucket (OBRS-1223)', () => {
  it('names the tail relative to the 30s ceiling this card exists to justify', () => {
    expect(durationBucket(5_000)).toBe('5-10s');
    expect(durationBucket(9_999)).toBe('5-10s');
    expect(durationBucket(10_000)).toBe('10-20s');
    expect(durationBucket(20_000)).toBe('20-30s');
    expect(durationBucket(30_000)).toBe('30s+');
    expect(durationBucket(120_000)).toBe('30s+');
  });
});
