import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

// OBRS-623/659: the reschedule terms as they apply to any booking, for the PUBLIC
// /business-policy page. Until this card that page stated them as prose typed into
// public/i18n/*.json -- "1 change only, free, at least 24 hours ahead, 30 days out"
// -- and after OBRS-655/657 shipped not one of those four numbers was what the
// server enforced (2 hours, 60 days, uncapped). The page was not stale, it was
// wrong in the customer's favour in one direction and against them in another.
//
// Third sibling of BookingPolicyService and CancellationPolicyService, one per
// public policy endpoint, and deliberately separate for the reasons recorded on
// EndpointConstant.PUBLIC_RESCHEDULE_POLICY: /api/booking-policy shares its DTO
// with the admin config screen, and /api/cancellation-policy is named for and
// consumed by /refund-policy. Same OBRS-564 rule applies to all three -- a policy
// number a customer reads is NEVER hardcoded in a translation file.
export interface ReschedulePolicyDto {
  /** Rescheduling closes this many hours before departure. */
  rescheduleWindowHours: number;
  /** How far past the original departure a new departure may be set, in days. */
  rescheduleMaxDaysAhead: number;
  /** Flat fee per seat (THB) charged when the NEW departure is inside earlyWindowHours. */
  rescheduleFeeLateThb: number;
  /**
   * Hours before the NEW departure above which no fee is charged. Published alongside the fee
   * because a fee without the boundary it turns on is half a term -- see OBRS-656, which is open
   * and will remove the free branch entirely.
   */
  earlyWindowHours: number;
  /**
   * How many times one booking may be changed; 0 means UNLIMITED (OBRS-657, and 0 is the shipped
   * default). The page picks a SENTENCE off this rather than printing the number, because
   * "changed 0 times" is the opposite of what 0 means -- see business-policy.component.ts.
   */
  rescheduleMaxCount: number;
}

@Injectable({
  providedIn: 'root',
})
export class ReschedulePolicyService {
  constructor(private readonly http: HttpClient) {}

  // Same two context tokens, and the same reasons, as its two siblings: the component owns its
  // own failure UX (inline error + retry in place of the terms), so the global loading overlay
  // must not block a public page on a background read, and the global error modal must not stack
  // on top of -- and re-pop on every Retry click -- the inline error the component already shows.
  // Deliberately NOT SKIP_AUTH_LOGOUT: this endpoint is unauthenticated and never 401s.
  getReschedulePolicy(): Observable<ResponseAPI<ReschedulePolicyDto>> {
    const context = new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true);

    return this.http.get<ResponseAPI<ReschedulePolicyDto>>(
      `${environment.apiUrl}/api/reschedule-policy`,
      { context }
    );
  }
}
