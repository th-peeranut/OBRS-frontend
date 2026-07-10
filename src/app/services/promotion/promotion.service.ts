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

/**
 * Result of a stateless promo-code preview: no side effects, nothing is
 * persisted, and `currentUsage` is not incremented — the code is only
 * actually applied/counted when the booking itself is created (OBRS-109).
 */
export interface PromotionValidationResult {
  code: string;
  discountAmount: number;
  netAmount: number;
  label?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PromotionService {
  constructor(private readonly http: HttpClient) {}

  /**
   * Preview a customer-entered promo code against the current booking
   * amount. Silent: the field renders its own inline success/error state, so
   * the global loading dialog and error alert are both opted out of here.
   * Contract: POST /api/private/promotions/validate (see docs/handoff.md —
   * flagged as a Contract Request, not yet implemented on the backend).
   */
  validate(
    code: string,
    amount: number
  ): Observable<ResponseAPI<PromotionValidationResult>> {
    return this.http.post<ResponseAPI<PromotionValidationResult>>(
      `${environment.apiUrl}/api/private/promotions/validate`,
      { code, amount },
      { context: this.silentContext() }
    );
  }

  private silentContext(): HttpContext {
    return new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true)
      // OBRS-187: a 401 here can be a transient SIT cold-start blip on a
      // non-critical preview — must not force-logout (see OBRS-181 above).
      .set(SKIP_AUTH_LOGOUT, true);
  }
}
