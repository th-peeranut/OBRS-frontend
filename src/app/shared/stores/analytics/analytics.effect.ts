import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { tap } from 'rxjs/operators';
import { AnalyticsService } from '../../../services/analytics/analytics.service';
import { ScheduleFilterPayload } from '../../interfaces/schedule.interface';
import {
  invokeGetScheduleListApi,
  invokeGetScheduleListApiSuccess,
} from '../schedule-list/schedule-list.action';

/**
 * OBRS-867 — the search half of the funnel, measured at the store rather than
 * at a component.
 *
 * WHY HERE AND NOT IN `ScheduleBookingFilterComponent`
 * A search reaches the backend from three different places: the Search button
 * on the results page, the home page's own search, and the silent auto-search
 * that fires when a saved filter is restored on page load
 * (`schedule-booking-filter.component.ts` ngOnInit). Instrumenting the button
 * would miss two of the three and quietly under-report the top of the funnel —
 * the exact failure mode that makes a funnel chart worse than no chart, because
 * it looks authoritative. `invokeGetScheduleListApi` is the one edge all three
 * cross.
 *
 * THE `lastSearch` FIELD
 * `invokeGetScheduleListApiSuccess` carries the results but not the query, and
 * AC-3 requires the "no results" event to name the route and date — a bare
 * count tells us a problem exists and nothing about where. NgRx guarantees the
 * request action is dispatched before its own success action, so remembering
 * the last payload here is sound. It is deliberately NOT read from
 * `selectScheduleFilter`: that slice holds the *form's* shape (station IDs,
 * Date objects, round-trip dropdown objects) rather than the query that was
 * actually sent, and the two drift apart the moment someone edits a field
 * while a search is in flight.
 */
@Injectable()
export class AnalyticsEffect {
  private actions$ = inject(Actions);
  private analytics = inject(AnalyticsService);

  /** The query behind the search currently in flight. */
  private lastSearch: ScheduleFilterPayload | null = null;

  searchSubmitted$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(invokeGetScheduleListApi),
        tap((action) => {
          this.lastSearch = action.schedule_filter;
          this.analytics.track('search_submitted', this.searchParams());
        })
      ),
    { dispatch: false }
  );

  searchResultsShown$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(invokeGetScheduleListApiSuccess),
        tap((action) => {
          const departureCount = action.schedule_list?.departureSchedules?.length ?? 0;
          const returnCount = action.schedule_list?.arrivalSchedules?.length ?? 0;

          // "Found something" means an OUTBOUND trip exists. A round-trip
          // search that returns outbound-only is a partial result, not an empty
          // one, and `return_count` is what tells the two apart in the chart.
          const hasResults = departureCount > 0;

          this.analytics.track('search_results_shown', {
            ...this.searchParams(),
            has_results: hasResults,
            result_count: departureCount,
            return_count: returnCount,
          });

          if (!hasResults) {
            // Redundant by design — see `search_no_results` in
            // analytics.interface.ts. This is the number OBRS-862 is waiting on.
            this.analytics.track('search_no_results', this.searchParams());
          }
        })
      ),
    { dispatch: false }
  );

  /**
   * The route and date behind the current search. Station SLUGS, never the
   * numeric IDs the form carries: a slug (`chonburi`) reads directly in a GA4
   * report, where an ID needs a join against a table nobody looking at the
   * dashboard has.
   */
  private searchParams(): Record<string, string | number | boolean> {
    return {
      route_from: this.lastSearch?.fromStop ?? '',
      route_to: this.lastSearch?.toStop ?? '',
      search_date: this.lastSearch?.departureDate ?? '',
      passenger_count: this.lastSearch?.numberOfPassengers ?? 0,
      trip_type: this.lastSearch?.bookingType ?? '',
    };
  }
}
