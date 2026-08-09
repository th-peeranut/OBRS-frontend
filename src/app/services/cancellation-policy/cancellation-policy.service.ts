import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

// OBRS-627: the cancellation/refund terms as they apply to any booking, for the
// PUBLIC /refund-policy page. Until this card that page stated those terms as
// prose typed into public/i18n/*.json, and the prose was never true: it demanded
// an original paper ticket plus ID copies and an in-person cash pickup, while the
// app has always let a customer cancel themselves and refunded automatically.
//
// Sibling of BookingPolicyService (booking-policy.service.ts), which reads the
// other public policy endpoint, and deliberately a separate service against a
// separate endpoint: /api/booking-policy answers "when may I book" and its DTO is
// shared with the admin GET/PUT config screen, which cannot edit any of the values
// here. Same OBRS-564 rule applies to both -- a policy number a customer reads is
// NEVER hardcoded in a translation file.
export interface CancellationPolicyDto {
  /** Cancellation closes this many hours before departure. */
  cancelWindowHours: number;
  /** Boundary (hours before departure) between the early and late refund rates. */
  earlyWindowHours: number;
  /** Refund rate as a 0.0-1.0 fraction, NOT a percentage -- see refund-policy.component.ts. */
  refundRateEarly: number;
  /** Refund rate as a 0.0-1.0 fraction, NOT a percentage. */
  refundRateLate: number;
  /**
   * OBRS-1136 AC-1 -- how long a refund that cannot be automated takes, in CALENDAR days from the
   * cancellation. Optional on the wire for one reason only: this frontend (Netlify) and the
   * backend (Koyeb) deploy separately, so a build can be live for a few minutes against a backend
   * that predates AC-1. The page answers that by not printing the sentence at all -- see
   * refund-policy.component.html. Once both sides are out the server always sends it
   * (SystemConfigService.getIntConfig falls through to a code default, so there is no "unset").
   */
  manualRefundDueDays?: number;
}

@Injectable({
  providedIn: 'root',
})
export class CancellationPolicyService {
  constructor(private readonly http: HttpClient) {}

  // Same two context tokens as BookingPolicyService.getBookingPolicy, for the same
  // reasons: the component owns its own failure UX (inline error + retry in place
  // of the rates section), so the global loading overlay must not block a public
  // page on a background read, and the global error modal must not stack on top of
  // -- and re-pop on every Retry click -- the inline error the component already
  // shows. Deliberately NOT SKIP_AUTH_LOGOUT: this endpoint is unauthenticated and
  // never produces a 401 to tolerate.
  getCancellationPolicy(): Observable<ResponseAPI<CancellationPolicyDto>> {
    const context = new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true);

    return this.http.get<ResponseAPI<CancellationPolicyDto>>(
      `${environment.apiUrl}/api/cancellation-policy`,
      { context }
    );
  }
}
