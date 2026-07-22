import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  MyAccountProfile,
  MyAccountProfileUpdate,
} from '../../shared/interfaces/my-account.interface';
import { PRIVACY_POLICY_VERSION } from '../../modules/privacy-policy/privacy-policy.version';
import { SKIP_GLOBAL_ERROR_ALERT } from '../../shared/interceptors/http-context-tokens';

/**
 * OBRS-632 — the caller's own account: read it, correct it, re-consent, close it.
 *
 * <p>Separate from {@link UserService}, which owns the PUBLIC check-duplicate endpoints; everything
 * here is under `/api/private` and only ever acts on the authenticated principal.
 *
 * <p>Every call opts out of the global error toast: the account page owns its own error UX, and the
 * close-account failure in particular must be explained, not flashed.
 */
@Injectable({
  providedIn: 'root',
})
export class MyAccountService {
  private readonly url = `${environment.apiUrl}/api/private/users/me`;

  constructor(private http: HttpClient) {}

  getProfile(): Observable<ResponseAPI<MyAccountProfile>> {
    return this.http.get<ResponseAPI<MyAccountProfile>>(this.url, {
      context: this.silentErrorContext(),
    });
  }

  /**
   * PDPA ม.35-36 (right to rectification). The endpoint has existed since OBRS-80; this is the
   * first caller. Email is deliberately NOT part of it — changing the login credential goes
   * through the verified change-email flow instead.
   */
  updateProfile(update: MyAccountProfileUpdate): Observable<ResponseAPI<unknown>> {
    return this.http.put<ResponseAPI<unknown>>(this.url, update, {
      context: this.silentErrorContext(),
    });
  }

  /**
   * PDPA ม.19 วรรคห้า — re-consent to the notice this build is serving. The version is read from
   * {@link PRIVACY_POLICY_VERSION} rather than passed in, so the value recorded is always the one
   * the user was actually shown by this build; a caller cannot record consent to a version it is
   * not displaying.
   */
  acceptCurrentPrivacyPolicy(): Observable<ResponseAPI<unknown>> {
    return this.http.post<ResponseAPI<unknown>>(
      `${this.url}/pdpa-consent`,
      { pdpaConsent: true, pdpaConsentVersion: PRIVACY_POLICY_VERSION },
      { context: this.silentErrorContext() }
    );
  }

  /**
   * PDPA ม.33 — closes the account. The backend anonymises in place rather than deleting the row
   * (transaction records are retained under accounting law), so the UI must never promise "all
   * your data is erased"; see the confirmation copy in ACCOUNT.CLOSE_*.
   */
  closeAccount(): Observable<ResponseAPI<unknown>> {
    return this.http.delete<ResponseAPI<unknown>>(this.url, {
      context: this.silentErrorContext(),
    });
  }

  /**
   * True when the account consented to a notice version this build no longer serves (or to no
   * version at all, for accounts created before OBRS-628 put a version on the page).
   */
  needsReConsent(profile: MyAccountProfile | null): boolean {
    if (!profile) {
      return false;
    }
    return profile.pdpaConsentVersion !== PRIVACY_POLICY_VERSION;
  }

  private silentErrorContext(): HttpContext {
    return new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true);
  }
}
