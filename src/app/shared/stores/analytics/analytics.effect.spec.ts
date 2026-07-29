import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { Observable, of } from 'rxjs';
import { AnalyticsService } from '../../../services/analytics/analytics.service';
import {
  Schedule,
  ScheduleFilterPayload,
  ScheduleList,
} from '../../interfaces/schedule.interface';
import {
  invokeGetScheduleListApi,
  invokeGetScheduleListApiSuccess,
} from '../schedule-list/schedule-list.action';
import { AnalyticsEffect } from './analytics.effect';

/**
 * OBRS-867 AC-2 and AC-3.
 *
 * AC-3 is the reason this suite exists at all: "we know searches come back
 * empty" is not actionable, and OBRS-862's priority is decided by WHICH route
 * and WHICH date came back empty. So every assertion below on the no-results
 * path checks the route and the date, not just that an event fired.
 */
describe('AnalyticsEffect', () => {
  let actions$: Observable<Action>;
  let analytics: jasmine.SpyObj<AnalyticsService>;
  let effect: AnalyticsEffect;

  const SEARCH: ScheduleFilterPayload = {
    bookingType: 'one_way',
    numberOfPassengers: 2,
    fromStop: 'chonburi',
    toStop: 'bangkok',
    departureDate: '2026-08-01',
  };

  function scheduleList(departures: number, returns = 0): ScheduleList {
    const row = (id: number) => ({ id } as unknown as Schedule);
    return {
      departureSchedules: Array.from({ length: departures }, (_, i) => row(i + 1)),
      arrivalSchedules: Array.from({ length: returns }, (_, i) => row(100 + i)),
    };
  }

  function build(): void {
    TestBed.resetTestingModule();
    analytics = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['track']);
    TestBed.configureTestingModule({
      providers: [
        AnalyticsEffect,
        provideMockActions(() => actions$),
        { provide: AnalyticsService, useValue: analytics },
      ],
    });
    effect = TestBed.inject(AnalyticsEffect);
  }

  /** Runs the request effect so the effect remembers the query, then the success effect. */
  function search(list: ScheduleList | null, filter: ScheduleFilterPayload = SEARCH): void {
    actions$ = of(invokeGetScheduleListApi({ schedule_filter: filter }));
    effect.searchSubmitted$.subscribe();

    actions$ = of(invokeGetScheduleListApiSuccess({ schedule_list: list }));
    effect.searchResultsShown$.subscribe();
  }

  beforeEach(() => build());

  it('reports the submitted search with its route, date and party size', () => {
    actions$ = of(invokeGetScheduleListApi({ schedule_filter: SEARCH }));

    effect.searchSubmitted$.subscribe();

    expect(analytics.track).toHaveBeenCalledWith('search_submitted', {
      route_from: 'chonburi',
      route_to: 'bangkok',
      search_date: '2026-08-01',
      passenger_count: 2,
      trip_type: 'one_way',
    });
  });

  it('reports a non-empty result with has_results true and the count', () => {
    search(scheduleList(3));

    expect(analytics.track).toHaveBeenCalledWith(
      'search_results_shown',
      jasmine.objectContaining({
        has_results: true,
        result_count: 3,
        route_from: 'chonburi',
        search_date: '2026-08-01',
      })
    );
  });

  it('does NOT fire search_no_results when something was found', () => {
    search(scheduleList(3));

    const names = analytics.track.calls.allArgs().map((args) => args[0]);
    expect(names).not.toContain('search_no_results');
  });

  describe('AC-3 — an empty result must name the route and the date', () => {
    it('fires search_no_results carrying both', () => {
      search(scheduleList(0));

      expect(analytics.track).toHaveBeenCalledWith('search_no_results', {
        route_from: 'chonburi',
        route_to: 'bangkok',
        search_date: '2026-08-01',
        passenger_count: 2,
        trip_type: 'one_way',
      });
    });

    it('still names them when the response itself is null', () => {
      search(null);

      expect(analytics.track).toHaveBeenCalledWith(
        'search_no_results',
        jasmine.objectContaining({
          route_from: 'chonburi',
          route_to: 'bangkok',
          search_date: '2026-08-01',
        })
      );
    });

    it('also flags the same search on search_results_shown', () => {
      search(scheduleList(0));

      expect(analytics.track).toHaveBeenCalledWith(
        'search_results_shown',
        jasmine.objectContaining({ has_results: false, result_count: 0 })
      );
    });
  });

  it('treats an outbound-only round trip as a result, not an empty one', () => {
    // A round trip that finds an outbound leg but no return is a partial
    // result. Counting it as "no results" would inflate exactly the number
    // OBRS-862 is prioritised on.
    search(scheduleList(2, 0), { ...SEARCH, bookingType: 'return' });

    expect(analytics.track).toHaveBeenCalledWith(
      'search_results_shown',
      jasmine.objectContaining({ has_results: true, result_count: 2, return_count: 0 })
    );
    const names = analytics.track.calls.allArgs().map((args) => args[0]);
    expect(names).not.toContain('search_no_results');
  });

  it('carries no personal data of any kind', () => {
    search(scheduleList(0));

    const allCalls = analytics.track.calls.allArgs();
    // Not vacuous: assert there was something to inspect before inspecting it.
    expect(allCalls.length).toBeGreaterThan(0);

    for (const [, params] of allCalls) {
      const keys = Object.keys((params ?? {}) as Record<string, unknown>);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key)
          .withContext(`parameter '${key}'`)
          .not.toMatch(/name|email|phone|seat|ticket|booking|user|id$/i);
      }
    }
  });

  it('reports blanks rather than a stale query when success arrives with no request seen', () => {
    // Defensive: NgRx guarantees the request precedes its success, but a future
    // refactor that dispatches the success action directly (e.g. from a cache)
    // must not attribute the results to whatever was searched last.
    actions$ = of(invokeGetScheduleListApiSuccess({ schedule_list: scheduleList(0) }));

    effect.searchResultsShown$.subscribe();

    expect(analytics.track).toHaveBeenCalledWith('search_no_results', {
      route_from: '',
      route_to: '',
      search_date: '',
      passenger_count: 0,
      trip_type: '',
    });
  });
});
