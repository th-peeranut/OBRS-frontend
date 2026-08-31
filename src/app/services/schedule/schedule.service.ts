import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import { Observable } from 'rxjs';
import {
  ScheduleFilterPayload,
  ScheduleList,
  SeatMapRespDto,
} from '../../shared/interfaces/schedule.interface';

@Injectable({
  providedIn: 'root',
})
export class ScheduleService {
  constructor(private http: HttpClient) {}

  getByFilter(scheduleFilter: ScheduleFilterPayload): Observable<ResponseAPI<ScheduleList>> {
    return this.http.post<ResponseAPI<ScheduleList>>(
      `${environment.apiUrl}/api/schedules/search`,
      scheduleFilter
    );
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
