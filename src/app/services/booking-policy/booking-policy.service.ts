import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, startWith } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

// OBRS-564: real, owner-editable booking-policy numbers (max advance-booking
// days, minutes-before-departure cutoff). Fixes a usability defect where
// /business-policy claimed "60 days advance / 12 hours cutoff" while the
// actual backend enforced no advance cap at all and a 20-minute cutoff — the
// rule going forward is these numbers are NEVER hardcoded in i18n again, only
// ever rendered from this API.
//
// PUBLIC endpoint (`GET /api/booking-policy`, no token) — distinct from the
// admin GET/PUT pair added to AdminApiService
// (`/private/admin/configs/booking-policy`), which this service does not
// call. Kept as its own small service in `services/` (not `services/admin/`,
// which wraps every call in an admin-only loading/error HttpContext — see
// AdminApiService.createAdminContext) since both business-policy (customer
// shell) and home-booking (home module) consume it and neither should import
// the admin bounded context to reach a public, unauthenticated endpoint.
export interface BookingPolicyDto {
  maxAdvanceDays: number;
  cutoffMinutes: number;
}

// OBRS-698: the date-picker cap used only until the real config above
// resolves. It lives HERE, beside the call that supersedes it, because two
// entry points now need it (home-booking and schedule-booking-filter) and a
// per-component copy is exactly how they drift apart — the shape this card
// exists to close, one calendar over.
//
// A briefly-wrong value here is a date-picker AFFORDANCE, not a policy
// statement to a customer (contrast business-policy.component.ts, where the
// same number IS a statement and must not render before the real value is
// known), and the server re-validates the true cap on submit regardless.
// Kept equal to the backend's own SystemConfigConstant
// .BOOKING_MAX_ADVANCE_DAYS_DEFAULT (60 since OBRS-647) so a failed fetch
// degrades to the policy rather than to a STRICTER cap that would silently
// hide a month of sellable departures. Was 30 in home-booking until OBRS-698.
export const BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK = 60;

@Injectable({
  providedIn: 'root',
})
export class BookingPolicyService {
  /**
   * OBRS-862 — the advance-sale cap as a plain number, with the fallback, the
   * failure handling and the "don't block on the fetch" `startWith` applied
   * exactly ONCE.
   *
   * Every consumer that only wants the number reads THIS, never
   * `getBookingPolicy()` + its own copy of the pipeline. Not a tidiness point:
   * `/schedule-booking` renders the filter, the day strip and (when the list is
   * empty) the nearest-day hint together, and three independent in-flight GETs
   * can resolve at three different moments. While they disagree, the strip and
   * the list compute different day windows and therefore different
   * `availabilityRequestKey`s — which is precisely the dedup
   * `shared/lib/schedule-day-window.ts` exists to guarantee. One shared,
   * replayed source cannot disagree with itself.
   *
   * `refCount: false` so the answer survives the last unsubscribe: this is an
   * owner-edited config read on nearly every customer screen, and the server
   * re-validates the true cap on submit regardless. Built in the constructor
   * body (not a field initializer) because `getBookingPolicy()` needs `http`,
   * which class-field initialization order does not guarantee under
   * `useDefineForClassFields`. Cold until the first subscriber, so declaring
   * it fires no request on its own.
   */
  readonly maxAdvanceDays$: Observable<number>;

  constructor(private readonly http: HttpClient) {
    this.maxAdvanceDays$ = this.getBookingPolicy().pipe(
      map(
        (response) =>
          response.data?.maxAdvanceDays ?? BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK
      ),
      catchError(() => of(BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK)),
      startWith(BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK),
      shareReplay({ bufferSize: 1, refCount: false })
    );
  }

  // Both consumers own their own failure UX and neither should block the page:
  // business-policy renders an inline error + retry in place of policy item 1,
  // and home-booking silently keeps its date-picker fallback. Without these two
  // context tokens the global errorInterceptor would (a) throw the blocking
  // loading overlay over the HOME page and /business-policy on every visit for
  // a background enhancement, and (b) pop a global error modal on failure --
  // stacked on top of business-policy's inline error, and re-popped on every
  // Retry click. Same rule as the AuthService/parcel-tracking precedents:
  // a call whose component owns the error must skip the global alert.
  // Deliberately NOT SKIP_AUTH_LOGOUT -- this endpoint is public and
  // unauthenticated, so it never produces a 401 to tolerate.
  getBookingPolicy(): Observable<ResponseAPI<BookingPolicyDto>> {
    const context = new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true);

    return this.http.get<ResponseAPI<BookingPolicyDto>>(
      `${environment.apiUrl}/api/booking-policy`,
      { context }
    );
  }
}
