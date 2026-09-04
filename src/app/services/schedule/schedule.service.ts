import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import { catchError, map, Observable, of, shareReplay } from 'rxjs';
import {
  ScheduleAvailability,
  ScheduleAvailabilityReq,
  ScheduleFilterPayload,
  ScheduleList,
  SeatMapRespDto,
} from '../../shared/interfaces/schedule.interface';
import { availabilityRequestKey } from '../../shared/lib/schedule-day-window';

@Injectable({
  providedIn: 'root',
})
export class ScheduleService {
  /**
   * OBRS-862. Session-scoped request dedup, same shape as
   * `RouteMapService.sharedRequests` (the established precedent) and here for a
   * concrete reason: TWO components consume the same answer — the results-page
   * day strip and the list's empty state — so without it every search puts two
   * byte-identical POSTs on the wire.
   */
  private availabilityRequests = new Map<
    string,
    Observable<ScheduleAvailability | null>
  >();

  constructor(private http: HttpClient) {}

  getByFilter(scheduleFilter: ScheduleFilterPayload): Observable<ResponseAPI<ScheduleList>> {
    return this.http.post<ResponseAPI<ScheduleList>>(
      `${environment.apiUrl}/api/schedules/search`,
      scheduleFilter
    );
  }

  /**
   * OBRS-862 — POST /api/schedules/availability (public, OBRS-1251): which of
   * the next `days` days starting at `fromDate` have a sellable trip for this
   * stop pair. The caller must have clamped `fromDate` into
   * [today, today + maxAdvanceDays] already (see shared/lib/schedule-day-window).
   *
   * Silent on both counts, exactly as `getBlockedSeats` and
   * `BookingPolicyService.getBookingPolicy` are: this is a background
   * refinement of a page that already works, so the global loading overlay must
   * not flash over it and a failure must not pop a modal over a good result
   * list. A failure resolves to `null` — "we were told nothing" — never an
   * error UI, and the key is dropped so the next search retries.
   *
   * Staleness is accepted, deliberately: seats sell while the page is open, so
   * a day cached as available can go empty. Worst case the customer taps and
   * meets the existing empty state — the pre-card behaviour for every day.
   */
  getAvailabilityCached(
    request: ScheduleAvailabilityReq
  ): Observable<ScheduleAvailability | null> {
    const key = availabilityRequestKey(request);
    const hit = this.availabilityRequests.get(key);
    if (hit) {
      return hit;
    }

    const request$ = this.http
      .post<ResponseAPI<ScheduleAvailability>>(
        `${environment.apiUrl}/api/schedules/availability`,
        request,
        {
          context: new HttpContext()
            .set(SKIP_GLOBAL_LOADING_ALERT, true)
            .set(SKIP_GLOBAL_ERROR_ALERT, true),
        }
      )
      .pipe(
        map((response) => response.data ?? null),
        catchError(() => {
          this.availabilityRequests.delete(key);
          return of(null);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    this.availabilityRequests.set(key, request$);
    return request$;
  }

  /**
   * GET /api/schedules/{id}/seats — physical seat map (OBRS-362), used to
   * feed the wheelchair/extra-legroom badges on the passenger-info seat map.
   * Public endpoint, no auth.
   */
  getSeatMap(scheduleId: number | string): Observable<ResponseAPI<SeatMapRespDto[]>> {
    return this.http.get<ResponseAPI<SeatMapRespDto[]>>(
      `${environment.apiUrl}/api/schedules/${scheduleId}/seats`
    );
  }

  /**
   * GET /api/schedules/{id}/blocked-seats — the seats this passenger may not
   * take on this segment, because sitting there would put a monk beside a woman
   * or a nun beside a man (OBRS-1364). Public endpoint, no auth.
   *
   * It answers with seat numbers and nothing else: the other passengers' types
   * never cross the wire, because monk/nun is religious status under PDPA
   * section 26. The segment is required because occupancy is segment-scoped,
   * and it is sent as stop IDs because that is what the search filter holds.
   */
  getBlockedSeats(
    scheduleId: number | string,
    passengerType: string,
    fromStopId: number | string,
    toStopId: number | string
  ): Observable<ResponseAPI<string[]>> {
    const params = new HttpParams()
      .set('passengerType', passengerType)
      .set('fromStopId', String(fromStopId))
      .set('toStopId', String(toStopId));
    return this.http.get<ResponseAPI<string[]>>(
      `${environment.apiUrl}/api/schedules/${scheduleId}/blocked-seats`,
      {
        params,
        // Silent on both counts, because the caller already treats a failure as
        // "nothing is blocked" (`catchError(() => of([]))` in
        // passenger-info-form). Without these the global interceptor is louder
        // than the feature: every click on male/female/monk/nun flashes the
        // full-screen loading overlay, and one failed lookup opens a SweetAlert
        // whose backdrop swallows the click on Next (OBRS-1364).
        context: new HttpContext()
          .set(SKIP_GLOBAL_LOADING_ALERT, true)
          .set(SKIP_GLOBAL_ERROR_ALERT, true),
      }
    );
  }
}
