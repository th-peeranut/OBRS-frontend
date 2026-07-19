import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import { CustomerTripPositionRespDto } from '../../shared/lib/trip-track-view';

/**
 * S1 (SPEC-OBRS-426) — `GET /api/private/tickets/{ticketId}/vehicle-position`.
 * Shipped by OBRS-425 and consumed here unchanged (no field added/requested).
 * Follows `StaffApiService`'s shape: inline URL (there is no endpoint-
 * constants file on the FE), `Observable<ResponseAPI<T>>`.
 *
 * BR-19: `SKIP_GLOBAL_ERROR_ALERT` + `SKIP_GLOBAL_LOADING_ALERT` are set — a
 * 60s poll must never raise a modal or flash the global loader — but
 * `SKIP_AUTH_LOGOUT` is deliberately NOT set: a genuine 401 on this private
 * endpoint must still drive the app's normal force-logout path (the
 * OBRS-181/OBRS-187 trap — that token belongs on endpoints whose 4xx is a
 * *domain* outcome, and 401 here never is).
 */
@Injectable({ providedIn: 'root' })
export class TripTrackService {
  private readonly context = new HttpContext()
    .set(SKIP_GLOBAL_ERROR_ALERT, true)
    .set(SKIP_GLOBAL_LOADING_ALERT, true);

  constructor(private readonly http: HttpClient) {}

  getVehiclePosition(
    ticketId: number
  ): Observable<ResponseAPI<CustomerTripPositionRespDto>> {
    return this.http.get<ResponseAPI<CustomerTripPositionRespDto>>(
      `${environment.apiUrl}/api/private/tickets/${ticketId}/vehicle-position`,
      { context: this.context }
    );
  }
}
