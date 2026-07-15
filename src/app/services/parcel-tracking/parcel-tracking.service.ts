import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import { ParcelTrackRespDto } from '../../shared/interfaces/parcel.interface';

/**
 * OBRS-305 Card 2 — public parcel tracking (`GET /api/parcels/track/{tn}`).
 * `permitAll` on the backend — there is no `/api/private` segment on this
 * path (see ../OBRS-backend/docs/api/parcels-consigned-delivery.md).
 */
@Injectable({ providedIn: 'root' })
export class ParcelTrackingService {
  /**
   * Scrutinize note (OBRS-305): `authInterceptor` attaches a bearer to EVERY
   * request whenever a token exists in storage — including this public,
   * `permitAll` call. A logged-in staff member browsing `/track-parcel` with
   * an EXPIRED token would otherwise be force-logged-out by a 401 on a page
   * that never required auth (the route is `customerArea: true`, no
   * `requireAuth`). `SKIP_AUTH_LOGOUT` immunizes this call — a guest sending
   * no bearer is unaffected either way. `SKIP_GLOBAL_ERROR_ALERT`/
   * `SKIP_GLOBAL_LOADING_ALERT` let the tracking page render its own inline
   * "not found" state instead of the global toast/spinner for an unknown
   * tracking number (404).
   */
  private readonly publicContext = new HttpContext()
    .set(SKIP_GLOBAL_ERROR_ALERT, true)
    .set(SKIP_GLOBAL_LOADING_ALERT, true)
    .set(SKIP_AUTH_LOGOUT, true);

  constructor(private readonly http: HttpClient) {}

  track(trackingNumber: string): Observable<ResponseAPI<ParcelTrackRespDto>> {
    return this.http.get<ResponseAPI<ParcelTrackRespDto>>(
      `${environment.apiUrl}/api/parcels/track/${encodeURIComponent(trackingNumber)}`,
      { context: this.publicContext }
    );
  }
}
