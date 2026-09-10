import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

// OBRS-703 AC-10: mirrors BookingPolicyService exactly -- see that file's own
// comment for why this is its own small service in `services/` rather than
// `services/admin/`. The no-show cutoff used to be hardcoded as "10" in two
// customer-facing i18n strings (business-policy's TRAVEL_CONDITIONS item 3,
// how-to-book's TIP_1); an owner who set their own cutoff via
// /admin/settings/operations left both pages announcing a number that was no
// longer true. The rule going forward is the same as booking-policy's: this
// number is NEVER hardcoded in i18n again, only ever rendered from this API.
//
// PUBLIC endpoint (`GET /api/operations-policy`, no token) -- distinct from
// the owner admin GET/PUT/DELETE pair on AdminApiService
// (`/private/owner/configs/operations`), which this service does not call.
export interface OperationsPolicyDto {
  /** The STRICTEST (lowest) no-show cutoff across every owner, not the
   * platform default: understating it costs a passenger nothing worse than
   * arriving early, while overstating it costs them a ticket with no refund
   * (see OwnerOperationsConfigDto.noShowCutoffMinutes). */
  noShowCutoffMinutes: number;
}

@Injectable({
  providedIn: 'root',
})
export class OperationsPolicyService {
  constructor(private readonly http: HttpClient) {}

  // Same two context tokens as BookingPolicyService, for the same reason:
  // business-policy and how-to-book each own their own failure UX (an inline
  // error/retry, or in how-to-book's case simply not interpolating), so the
  // global loading overlay and global error modal must both be skipped.
  getOperationsPolicy(): Observable<ResponseAPI<OperationsPolicyDto>> {
    const context = new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true);

    return this.http.get<ResponseAPI<OperationsPolicyDto>>(
      `${environment.apiUrl}/api/operations-policy`,
      { context }
    );
  }
}
