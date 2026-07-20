import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';

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

@Injectable({
  providedIn: 'root',
})
export class BookingPolicyService {
  constructor(private readonly http: HttpClient) {}

  getBookingPolicy(): Observable<ResponseAPI<BookingPolicyDto>> {
    return this.http.get<ResponseAPI<BookingPolicyDto>>(
      `${environment.apiUrl}/api/booking-policy`
    );
  }
}
