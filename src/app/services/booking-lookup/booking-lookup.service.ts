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
import {
  BookingLookupRequest,
  BookingLookupResult,
} from '../../shared/interfaces/booking-lookup.interface';

/**
 * OBRS-857 — the public booking lookup (`POST /api/bookings/lookup`).
 *
 * `permitAll` on the backend: there is no `/api/private` segment on this path, and there is no
 * principal to authorize — a guest has no account, which is the whole point of the card. What
 * stands in for the role guard is the credential itself (booking number + the phone the booking
 * was made with) and a per-IP cap.
 *
 * <p><b>POST for a read, deliberately.</b> The request body carries a phone number. A GET would
 * put it in the query string, where it lands in every proxy's access log and in the visitor's
 * browser history — a PDPA leak created by the request's SHAPE, which no amount of care on the
 * response side undoes. `RequestResponseLoggingFilter` masks JSON bodies; it cannot mask a URL.
 */
@Injectable({ providedIn: 'root' })
export class BookingLookupService {
  /**
   * The same three tokens `ParcelTrackingService` sets, for the same three reasons (OBRS-305):
   *
   * - `SKIP_AUTH_LOGOUT` — `authInterceptor` attaches a bearer to EVERY request whenever a token
   *   exists in storage, including this public one. A staff member browsing this page with an
   *   expired token would otherwise be force-logged-out by a 401 on a page that never required
   *   auth. A guest, sending no bearer, is unaffected either way.
   * - `SKIP_GLOBAL_ERROR_ALERT` — a wrong pair is the NORMAL outcome of a typo, not an incident.
   *   The page renders its own inline "not found" state; a global red toast on every mistyped
   *   digit would be both wrong in tone and, on a throttled endpoint, a nudge to retry faster.
   * - `SKIP_GLOBAL_LOADING_ALERT` — same, for the blocking spinner.
   */
  private readonly publicContext = new HttpContext()
    .set(SKIP_GLOBAL_ERROR_ALERT, true)
    .set(SKIP_GLOBAL_LOADING_ALERT, true)
    .set(SKIP_AUTH_LOGOUT, true);

  constructor(private readonly http: HttpClient) {}

  lookup(request: BookingLookupRequest): Observable<ResponseAPI<BookingLookupResult>> {
    return this.http.post<ResponseAPI<BookingLookupResult>>(
      `${environment.apiUrl}/api/bookings/lookup`,
      request,
      { context: this.publicContext }
    );
  }
}
