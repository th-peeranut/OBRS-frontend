import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

// OBRS-629: the parcel carriage limits as ParcelIntakeService actually enforces
// them. Third sibling of BookingPolicyService and CancellationPolicyService, and
// the same OBRS-564 rule they exist for -- a limit a customer reads is NEVER
// hardcoded in a translation file.
//
// Two live defects this replaces, both measured 2026-08-02:
//   1. "100" kg was typed into FIVE places (two of them on the staff walk-in
//      consign form, the ONLY parcel channel open at go-live after OBRS-622
//      gated the online wizard) while validateWeight read parcel.max_weight_kg.
//   2. The consign form asked the sender to attest their parcel holds nothing
//      prohibited and showed them NO list at all -- there was no
//      STAFF.PARCEL_CONSIGN.PROHIBITED.* key in any locale -- while the customer
//      wizard showed five categories typed into i18n that nothing kept in step
//      with the config intake blocks on.
export interface ParcelPolicyDto {
  /** Parcels above this many kilograms are refused at intake. */
  maxWeightKg: number;
  /**
   * A carry-on item whose largest dimension exceeds this many inches stops
   * riding free and buys a seat. NOT a refusal threshold.
   */
  carryOnFreeSizeMaxInch: number;
  /** Free-aisle carry-on items one trip will take before refusing more. */
  carryOnFreeAisleMaxPerTrip: number;
  /**
   * Raw config slugs ('flammable', 'explosive', ...) -- the match keys intake
   * does a case-insensitive substring compare against, not display text.
   * An EMPTY array is a meaningful answer, not a missing one: the config has no
   * hardcoded fallback, so an unset row means intake blocks nothing.
   */
  prohibitedCategories: string[];
}

@Injectable({
  providedIn: 'root',
})
export class ParcelPolicyService {
  constructor(private readonly http: HttpClient) {}

  // Same two context tokens as its two siblings, for the same reasons: each
  // caller owns its own failure UX, so the global loading overlay must not block
  // a form on a background read and the global error modal must not stack on top
  // of the inline message the caller already shows. Deliberately NOT
  // SKIP_AUTH_LOGOUT: this endpoint is unauthenticated and never 401s.
  getParcelPolicy(): Observable<ResponseAPI<ParcelPolicyDto>> {
    const context = new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true);

    return this.http.get<ResponseAPI<ParcelPolicyDto>>(
      `${environment.apiUrl}/api/parcel-policy`,
      { context }
    );
  }
}
