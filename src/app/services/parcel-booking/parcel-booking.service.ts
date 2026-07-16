import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { PageResponse } from '../../shared/interfaces/payment.interface';
import {
  ParcelConsignedRespDto,
  ParcelMeDto,
  ParcelOnlineQuoteParams,
  ParcelOnlineReqDto,
  ParcelQuoteRespDto,
} from '../../shared/interfaces/parcel.interface';

/** The current user's own profile, the fields this flow reads (§3 of
 * UX-OBRS-415). `phoneNumber` is nullable — a social-login account may have
 * none. */
export interface ParcelBookingProfile {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phoneNumber?: string | null;
}

/**
 * OBRS-415 — customer-facing parcel booking. Deliberately its OWN service
 * (not `StaffApiService`): CLAUDE.md/UX-OBRS-415 §3 — do not import a
 * staff-scoped service into a customer module. `GET /api/private/users/me`
 * is the same "authenticated-any" endpoint `StaffApiService.getMe()` already
 * calls for the staff walk-in form, but that service lives in the staff
 * shell — this is a thin, parallel call from the customer shell, not a fork
 * of shared logic (there is none to share; both just hit the same plain
 * endpoint).
 */
@Injectable({ providedIn: 'root' })
export class ParcelBookingService {
  constructor(private readonly http: HttpClient) {}

  getMyProfile(): Observable<ResponseAPI<ParcelBookingProfile>> {
    return this.http.get<ResponseAPI<ParcelBookingProfile>>(
      `${environment.apiUrl}/api/private/users/me`
    );
  }

  /** GET /api/private/parcels/quote — auth loosened to authenticated-any per
   * ADR-0081 (SPEC-OBRS-415 §1.2). `parcelType=consigned` is added here
   * (not part of the caller-facing `ParcelOnlineQuoteParams`) since this
   * flow is consigned-only by construction. */
  getParcelQuote(params: ParcelOnlineQuoteParams): Observable<ResponseAPI<ParcelQuoteRespDto>> {
    const query = new HttpParams()
      .set('parcelType', 'consigned')
      .set('scheduleId', String(params.scheduleId))
      .set('pickupStopId', String(params.pickupStopId))
      .set('dropoffStopId', String(params.dropoffStopId))
      .set('weightKg', String(params.weightKg));

    return this.http.get<ResponseAPI<ParcelQuoteRespDto>>(
      `${environment.apiUrl}/api/private/parcels/quote`,
      { params: query }
    );
  }

  /** POST /api/private/parcels/online — the one new backend endpoint this
   * card introduces (SPEC-OBRS-415 §1.1). No `sender`/`paymentMethod`/
   * `parcelType`/`seatCount` on the wire — see `ParcelOnlineReqDto`. */
  createOnlineParcelBooking(
    payload: ParcelOnlineReqDto
  ): Observable<ResponseAPI<ParcelConsignedRespDto>> {
    return this.http.post<ResponseAPI<ParcelConsignedRespDto>>(
      `${environment.apiUrl}/api/private/parcels/online`,
      payload
    );
  }

  /** GET /api/private/parcels/me — the customer's own paginated parcel list
   * (SPEC-OBRS-415 comment, added 2026-07-16). Scoped server-side to the
   * authenticated customer's `actor_id`; there is deliberately no `userId`
   * param here (would be IDOR).
   *
   * No `status` param — `ParcelController#getMyParcels(Pageable pageable)`
   * on the backend takes ONLY `Pageable` (page/size/sort); a `status` param
   * would be silently dropped by Spring's binder, not filtered on. There is
   * also no status to filter BY today — the UX spec's filter-pill row never
   * defined any status beyond "All" — so this deliberately sends only
   * page/size rather than a parameter that goes nowhere. */
  getMyParcels(page: number, size: number): Observable<ResponseAPI<PageResponse<ParcelMeDto>>> {
    const params = new HttpParams().set('page', String(page)).set('size', String(size));

    return this.http.get<ResponseAPI<PageResponse<ParcelMeDto>>>(
      `${environment.apiUrl}/api/private/parcels/me`,
      { params }
    );
  }
}
