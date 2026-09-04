import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import {
  BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK,
  BookingPolicyService,
} from './booking-policy.service';
import { environment } from '../../../environments/environment';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

describe('BookingPolicyService', () => {
  let service: BookingPolicyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BookingPolicyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('GETs the public booking-policy endpoint (no /private, no token requirement)', () => {
    let result: { maxAdvanceDays: number; cutoffMinutes: number } | undefined;

    service.getBookingPolicy().subscribe((response) => {
      result = response.data;
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/booking-policy`);
    expect(req.request.method).toBe('GET');
    req.flush({ code: 200, message: 'OK', data: { maxAdvanceDays: 45, cutoffMinutes: 20 } });

    expect(result).toEqual({ maxAdvanceDays: 45, cutoffMinutes: 20 });
  });

  // Scrutinize (OBRS-564): both callers own their own failure UX (inline error
  // + retry on business-policy; silent fallback on home-booking), so this call
  // must opt out of the global loading overlay AND the global error modal.
  // Without these, a background enhancement blocks the HOME page on every load
  // and stacks a modal on top of the inline error the component already shows.
  it('opts out of the global loading overlay and the global error modal', () => {
    service.getBookingPolicy().subscribe({ error: () => undefined });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/booking-policy`);
    expect(req.request.context.get(SKIP_GLOBAL_LOADING_ALERT)).toBeTrue();
    expect(req.request.context.get(SKIP_GLOBAL_ERROR_ALERT)).toBeTrue();

    req.flush({ code: 200, message: 'OK', data: { maxAdvanceDays: 45, cutoffMinutes: 20 } });
  });

  // OBRS-862 (review finding 2): `/schedule-booking` renders the filter, the day
  // strip and the empty-state hint together. Each used to own a copy of
  // `getBookingPolicy() -> map(?? FALLBACK) -> catchError -> startWith`, so the
  // page issued 2-3 GETs and the three surfaces could hold DIFFERENT caps while
  // they resolved — different day windows, different `availabilityRequestKey`s,
  // and the availability dedup defeated. These pin the one shared source.
  describe('maxAdvanceDays$', () => {
    // Distinct from the fallback, so a pipeline that ignored the response
    // entirely would still fail every arm below.
    const CONFIGURED = 45;
    const FALLBACK = BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK;

    it('serves every subscriber from ONE request, fallback first then the real cap', () => {
      expect(CONFIGURED).not.toBe(FALLBACK);

      const first: number[] = [];
      const second: number[] = [];

      service.maxAdvanceDays$.subscribe((days) => first.push(days));
      service.maxAdvanceDays$.subscribe((days) => second.push(days));

      // The load-bearing assertion: two subscribers, one GET.
      const req = httpMock.expectOne(`${environment.apiUrl}/api/booking-policy`);
      req.flush({
        code: 200,
        message: 'OK',
        data: { maxAdvanceDays: CONFIGURED, cutoffMinutes: 20 },
      });

      expect(first).toEqual([FALLBACK, CONFIGURED]);
      // The late subscriber replays what the first one already had, so the two
      // can never be looking at different numbers at the same moment.
      expect(second).toEqual([FALLBACK, CONFIGURED]);

      // A third subscriber after the answer landed gets it with no new request.
      const third: number[] = [];
      service.maxAdvanceDays$.subscribe((days) => third.push(days));
      expect(third).toEqual([CONFIGURED]);
      httpMock.expectNone(`${environment.apiUrl}/api/booking-policy`);
    });

    it('degrades to the fallback cap on a failed fetch, without erroring the stream', () => {
      const emitted: number[] = [];
      let errored = false;
      let completed = false;

      service.maxAdvanceDays$.subscribe({
        next: (days) => emitted.push(days),
        error: () => (errored = true),
        complete: () => (completed = true),
      });

      httpMock
        .expectOne(`${environment.apiUrl}/api/booking-policy`)
        .error(new ProgressEvent('offline'));

      // Without the `catchError` the subscriber gets the interceptor's rethrow
      // instead of a number, and every consumer's `combineLatest` dies with it.
      expect(errored).toBeFalse();
      expect(completed).toBeTrue();
      // `startWith` then the recovered value — the cap never changes, so the
      // calendar and the day strip stay on the fallback rather than blanking.
      expect(emitted).toEqual([FALLBACK, FALLBACK]);
    });

    it('degrades to the fallback cap on a 200 with no body', () => {
      const emitted: number[] = [];
      service.maxAdvanceDays$.subscribe((days) => emitted.push(days));

      httpMock
        .expectOne(`${environment.apiUrl}/api/booking-policy`)
        .flush({ code: 200, message: 'OK' });

      expect(emitted).toEqual([FALLBACK, FALLBACK]);
    });
  });
});
