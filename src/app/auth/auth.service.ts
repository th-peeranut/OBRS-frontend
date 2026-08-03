import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
} from '../shared/interceptors/http-context-tokens';
import { hasOwnKey } from '../shared/lib/own-key';
import { clearTtl, readWithTtl, writeWithTtl } from '../shared/lib/ttl-storage';
import { clearBookingContext } from '../shared/lib/booking-context-storage';
import {
  EmailChangeConfirmResponse,
  EmailChangeRequestResponse,
  LoginResponseData,
  PasswordResetConfirmResponse,
  PasswordResetRequestResponse,
  Register,
  SignUpPayload,
} from '../shared/interfaces/auth.interface';
import { ResponseAPI } from '../shared/interfaces/response.interface';
import { LoginOtpVerify } from '../shared/interfaces/otp.interface';
import { PRIVACY_POLICY_VERSION } from '../modules/privacy-policy/privacy-policy.version';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  // OBRS-855: the long-lived half of the session. The access token above lives one hour and
  // cannot be extended; this one buys a replacement for it. Kept in localStorage beside the
  // access token rather than in a cookie because the backend is a separate origin with CSRF
  // disabled (WebSecurityConfig) — a cookie would ride along on cross-site requests
  // automatically, which is exactly what CSRF needs and what a header-carried token cannot do.
  private readonly REFRESH_TOKEN_KEY = 'auth_refresh_token';
  private readonly USERNAME_KEY = 'auth_username';
  private readonly ROLES_KEY = 'auth_roles';
  /**
   * OBRS-187 created this; OBRS-903 moved it out of `sessionStorage`.
   *
   * A first-time booker is bounced here from the booking flow, registers, and
   * then has to open the verification mail — which opens a NEW TAB.
   * `sessionStorage` is per-tab, so the tab that reads this was never the tab
   * that wrote it: the value read as absent and `navigateAfterLogin` sent every
   * one of them to the home route with nothing logged anywhere. localStorage
   * crosses the tab boundary; the TTL below is what keeps it from also crossing
   * the day boundary and redirecting someone who never asked.
   */
  private readonly RETURN_URL_KEY = 'auth_return_url';
  private static readonly RETURN_URL_VERSION = 1;
  /** 30 minutes — long enough for the mail-app detour, short enough that a
   *  forgotten entry does not hijack an unrelated login the next morning. */
  private static readonly RETURN_URL_TTL_MS = 30 * 60 * 1000;

  // Area-based access model (frontend routing only — the backend keeps its own
  // WebSecurityConfig#roleHierarchy, where admin > owner > salesperson >
  // driver > user). Each role is granted the set of roles it may satisfy:
  //   - owner       → all-access superset (admin + staff + customer)
  //   - admin       → cross-portal superset mirroring the backend hierarchy
  //                   (admin + owner + staff + customer) — near-owner reach
  //   - salesperson → the staff portal; still outranks driver within it
  //   - driver      → the staff portal (driver pages)
  //   - customer    → the public/customer area only
  // NOTE (OBRS-176): the FE previously narrowed admin to the admin portal
  // only, a deliberate UX confinement introduced with no backing card. That
  // confinement is now reversed — admin is a cross-portal superset, matching
  // the fact that the backend already authorizes admin on every endpoint
  // (staff, customer, even owner-only). See docs/adr/0012-admin-cross-area-access.md.
  //
  // CONSEQUENCE (OBRS-446) — owner and admin grant EACH OTHER above, so any
  // route declaring requiredRoles: ['admin'], ['owner'] or ['admin', 'owner']
  // resolves to the identical predicate "admin or owner". Those literals are
  // inert: they record intent, they do not gate. The admin module leans on
  // this (settlements declares ['owner'] and admin reaches it anyway). What
  // actually keeps everyone else out of /admin is the parent route's guard in
  // app-routing.module.ts, not the per-page literal. Deliberate, not a bug —
  // the literals are expected to start biting only when owner-scoping lands
  // (OBRS-148/150). Pinned by auth.service.spec.ts 'admin-module
  // requiredRoles variants'. NOTE: the backend is NOT symmetric — it has real
  // admin-only endpoints that 403 an owner (OBRS-370), so do not carry this
  // equivalence across to API expectations.
  private static readonly ROLE_GRANTS: Record<string, readonly string[]> = {
    owner: ['owner', 'admin', 'salesperson', 'driver', 'customer'],
    admin: ['admin', 'owner', 'salesperson', 'driver', 'customer'],
    salesperson: ['salesperson', 'driver'],
    driver: ['driver'],
    customer: ['customer'],
  };

  // OBRS-1001 deleted PORTAL_ONLY_ROLES and canAccessCustomerArea() from this
  // file. They confined salesperson/driver to the staff portal, which made the
  // staff shell's own brand link (routerLink="/", aria-label "หน้าแรก") a
  // guaranteed no-op for the only two roles that ever see that shell: the guard
  // bounced them straight back to getHomeRoute(). OBRS-176 had already reversed
  // the same confinement for admin; this finishes it. See
  // docs/adr/0037-no-frontend-portal-confinement.md — in particular that the
  // backend's role hierarchy (ROLE_SALESPERSON > ROLE_DRIVER > ROLE_USER) has
  // always authorized these roles on customer endpoints, so the frontend list
  // was a UX confinement and never a security boundary.

  // Observable to track authentication status
  private authStatusSubject = new BehaviorSubject<boolean>(
    this.isAuthenticated()
  );
  authStatus$ = this.authStatusSubject.asObservable();

  constructor(private http: HttpClient, private router: Router) {}

  login(payload: {
    email: string;
    password: string;
  }): Promise<ResponseAPI<LoginResponseData>> {
    return this.callLogin(payload);
  }

  private callLogin(payload: {
    email: string;
    password: string;
  }): Promise<ResponseAPI<LoginResponseData>> {
    return this.http
      .post<ResponseAPI<LoginResponseData>>(
        `${environment.apiUrl}/api/auth/login`,
        payload
      )
      .toPromise()
      .then((response) => {
        if (response?.code === 200) {
          const token = response?.data?.accessToken;
          const username = response?.data?.user?.email ?? payload.email;
          const roles = response?.data?.user?.roles;
          this.storeAuthData(token, username, roles, response?.data?.refreshToken);
        }
        return response;
      })
      .catch((err) => {
        if (typeof err?.error === 'string' && err.error.includes('JWT expired')) {
          this.clearAuthData();
          return this.callLogin(payload);
        }
        return err;
      });
  }

  private storeAuthData(
    token: string | null | undefined,
    username: string | null | undefined,
    roles?: string[] | null | undefined,
    refreshToken?: string | null | undefined
  ): void {
    if (!token) return;
    localStorage.setItem(this.TOKEN_KEY, token);
    // OBRS-855: WRITE-OR-REMOVE, never "keep what was there". A response with no refreshToken
    // means this session cannot be refreshed, and leaving the previous value in place would have
    // the interceptor later present a token belonging to a session that has already been
    // replaced. The backend reads that as replay and answers by revoking EVERY live token the
    // user holds (RefreshTokenService#rotate) — so signing in would be what signs them out.
    if (refreshToken) {
      localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    } else {
      localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    }
    if (username) {
      localStorage.setItem(this.USERNAME_KEY, username);
    } else {
      localStorage.removeItem(this.USERNAME_KEY);
    }

    const normalizedRoles = Array.isArray(roles)
      ? roles
          .map((role) => String(role ?? '').trim().toLowerCase())
          .filter((role) => role.length > 0)
      : [];
    localStorage.setItem(this.ROLES_KEY, JSON.stringify(normalizedRoles));

    this.authStatusSubject.next(true);
  }

  clearAuthData(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USERNAME_KEY);
    localStorage.removeItem(this.ROLES_KEY);
    this.authStatusSubject.next(false);
  }

  setPostLoginRedirectUrl(url: string | null | undefined): void {
    if (!url || this.isAuthPage(url)) {
      return;
    }

    writeWithTtl(this.RETURN_URL_KEY, url, AuthService.RETURN_URL_VERSION);
  }

  consumePostLoginRedirectUrl(defaultUrl: string = '/'): string {
    const url = readWithTtl<string>(
      this.RETURN_URL_KEY,
      AuthService.RETURN_URL_TTL_MS,
      AuthService.RETURN_URL_VERSION
    );
    clearTtl(this.RETURN_URL_KEY);

    // The auth-page check stays on BOTH sides of storage. A value can be written
    // by one build and read by the next, and this is the guard that stops a
    // /login → /login redirect loop (and OBRS-613's spent reset-password token).
    if (!url || this.isAuthPage(url)) {
      return defaultUrl;
    }

    return url;
  }

  navigateAfterLogin(defaultUrl: string = this.getHomeRoute()): Promise<boolean> {
    const targetUrl = this.consumePostLoginRedirectUrl(defaultUrl);
    return this.router.navigateByUrl(targetUrl);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  /**
   * OBRS-855: trades the stored refresh token for a fresh access token, and emits it.
   *
   * Returns an Observable rather than following the Promise style of the login methods above
   * because its one caller is `auth.interceptor.ts`, which has to splice the result back into an
   * in-flight `HttpHandlerFn` chain. The interceptor also owns the single-flight guard — this
   * method deliberately has none, so calling it twice really does spend two refresh tokens.
   *
   * SKIP_AUTH_LOGOUT and SKIP_GLOBAL_ERROR_ALERT are both set: the interceptor is already
   * mid-401-handling when this runs, and a second force-logout or a second toast fired from
   * inside the recovery attempt would step on the one the caller is about to decide on. (The
   * `/api/auth/` prefix already exempts this call from the force-logout path — the context token
   * says so explicitly rather than resting on the URL happening to match.)
   */
  refreshSession(): Observable<string> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('AUTH_NO_REFRESH_TOKEN'));
    }

    return this.http
      .post<ResponseAPI<LoginResponseData>>(
        `${environment.apiUrl}/api/auth/refresh`,
        { refreshToken },
        {
          context: new HttpContext()
            .set(SKIP_AUTH_LOGOUT, true)
            .set(SKIP_GLOBAL_ERROR_ALERT, true),
        }
      )
      .pipe(
        map((response) => {
          const accessToken = response?.data?.accessToken;
          // A 200 carrying no accessToken is a failed refresh however friendly it looks, and it
          // must throw rather than resolve — the interceptor branches on success/failure, and
          // resolving here would have it retry the original request with the SAME dead token.
          if (response?.code !== 200 || !accessToken) {
            throw new Error('AUTH_REFRESH_REJECTED');
          }

          // The refresh ROTATES: response.data.refreshToken is a different value from the one
          // just sent, and the one just sent is now dead. storeAuthData's write-or-remove rule
          // means a response that somehow omits it clears the stored token instead of leaving a
          // spent one behind for the next refresh to replay.
          this.storeAuthData(
            accessToken,
            response?.data?.user?.email ?? this.getUsername(),
            response?.data?.user?.roles,
            response?.data?.refreshToken
          );

          return accessToken;
        })
      );
  }

  getUsername(): string | null {
    return localStorage.getItem(this.USERNAME_KEY);
  }

  getRoles(): string[] {
    const rawRoles = localStorage.getItem(this.ROLES_KEY);
    if (!rawRoles) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawRoles);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((role) => String(role ?? '').trim().toLowerCase())
        .filter((role) => role.length > 0);
    } catch {
      return [];
    }
  }

  hasAnyRole(requiredRoles: string[]): boolean {
    if (!Array.isArray(requiredRoles) || requiredRoles.length === 0) {
      return true;
    }

    // Expand each held role into the set of roles it is granted (see
    // ROLE_GRANTS): owner and admin both satisfy everything (cross-portal
    // superset), salesperson still covers driver within the staff portal. An
    // unrecognised role only matches itself.
    const effectiveRoles = new Set<string>();
    for (const role of this.getRoles()) {
      // OBRS-601: hasOwnKey, not a bare lookup. `getRoles()` reads
      // localStorage, which the browser user can edit, and lower-cases each
      // entry — leaving `constructor` and `__proto__` as valid JSON strings
      // that resolve to the `Object` function. `if (grants)` would pass and
      // `grants.forEach` would throw, taking `hasAnyRole()` and therefore
      // every route guard down with it. The `else` below is exactly the
      // intended handling ("an unrecognised role only matches itself") and is
      // what the unguarded lookup skipped.
      const grants = hasOwnKey(AuthService.ROLE_GRANTS, role)
        ? AuthService.ROLE_GRANTS[role]
        : undefined;
      if (grants) {
        grants.forEach((granted) => effectiveRoles.add(granted));
      } else {
        effectiveRoles.add(role);
      }
    }

    return requiredRoles.some((role) =>
      effectiveRoles.has(String(role ?? '').trim().toLowerCase())
    );
  }

  // The route a user should land on / be sent back to for their portal. Owner
  // is all-access so it defaults to the public home; admin → /admin; staff
  // roles → /staff; customer / unknown / guest → public home.
  getHomeRoute(): string {
    const roles = this.getRoles();
    if (roles.includes('owner')) {
      return '/';
    }
    if (roles.includes('admin')) {
      return '/admin';
    }
    if (roles.includes('salesperson') || roles.includes('driver')) {
      return '/staff';
    }
    return '/';
  }

  /**
   * OBRS-855: signing out now revokes the session server-side as well as locally.
   *
   * Clearing localStorage was enough while a session was one unrevokable hour of JWT. With a
   * refresh token the untouched half would have kept working for a week after the user pressed
   * "sign out" — on a shared machine that is the whole point of the button, undone.
   *
   * Order matters: local state is cleared and the navigation queued BEFORE the request, and the
   * request is fire-and-forget. A slow or failed network must not leave the user sitting on a
   * page that still believes they are signed in, and there is nothing useful to tell them about
   * a logout call that failed — the backend answers 200 for every token it is handed anyway.
   */
  logout(): void {
    const refreshToken = this.getRefreshToken();
    this.clearAuthData();
    // OBRS-903: the cross-tab booking context outlives a tab by design, so
    // pressing "sign out" on a shared machine has to end it too. Deliberately
    // here and NOT in `clearAuthData()` — that also runs on the JWT-expired
    // login retry (`callLogin`) and inside the interceptor's 401 handling, where
    // wiping the customer's trip selection would recreate this very bug.
    clearBookingContext();

    if (refreshToken) {
      this.http
        .post(
          `${environment.apiUrl}/api/auth/logout`,
          { refreshToken },
          {
            context: new HttpContext()
              .set(SKIP_AUTH_LOGOUT, true)
              .set(SKIP_GLOBAL_ERROR_ALERT, true),
          }
        )
        .subscribe({ error: () => undefined });
    }

    this.router.navigate(['/login']);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // OBRS-605: setRegisterValue/getRegisterValue/clearRegisterValue existed only to carry
  // the signup form ACROSS the phone-OTP screen. They stashed the whole form - including
  // the plaintext password - in sessionStorage under 'register_value'. With the OTP screen
  // out of the signup path the form never leaves the component, so the stash is gone too.

  register(payload: Register): Promise<ResponseAPI<unknown>> {
    const signUpPayload: SignUpPayload = {
      title: payload.title,
      firstName: payload.firstName,
      middleName: payload.middleName,
      lastName: payload.lastName,
      email: payload.email,
      phoneNumber: payload.phoneNumber,
      password: payload.password,
      preferredLocale: payload.preferredLocale,
      pdpaConsent: payload.pdpaConsent,
      // OBRS-632: stamped here, not in the form. PDPA ม.19 only means something against a specific
      // text, and the text this build showed is the one this build knows — a component that had to
      // remember to pass it would eventually forget and the column would fill with nulls.
      pdpaConsentVersion: PRIVACY_POLICY_VERSION,
    };

    return this.http
      .post<ResponseAPI<unknown>>(
        `${environment.apiUrl}/api/auth/signup`,
        signUpPayload
      )
      .toPromise()
      .then((response) => response)
      .catch((err) => err);
  }

  loginWithOtp(payload: LoginOtpVerify): Promise<ResponseAPI<LoginResponseData> | undefined> {
    const endpoint = environment.useDevApiEndpoints
      ? '/api/auth/login/otp/test'
      : '/api/auth/login/otp';

    return (
      this.http
        .post<ResponseAPI<LoginResponseData>>(
          `${environment.apiUrl}${endpoint}`,
          payload
        )
        .toPromise()
        .then((response) => {
          if (response?.code === 200) {
            const token = response?.data?.accessToken;
            const username = response?.data?.user?.email;
            const roles = response?.data?.user?.roles;
            this.storeAuthData(token, username, roles, response?.data?.refreshToken);
          }
          return response;
        })
        .catch((err) => {
          if (typeof err?.error === 'string' && err.error.includes('JWT expired')) {
            this.clearAuthData();
          }
          return err;
        })
    );
  }

  loginWithGoogle(payload: {
    idToken: string;
    pdpaConsent: boolean;
  }): Promise<ResponseAPI<LoginResponseData> | undefined> {
    return this.http
      .post<ResponseAPI<LoginResponseData>>(
        `${environment.apiUrl}/api/auth/social/google`,
        // OBRS-632: same stamp as the email signup above — the Google button sits beside the same
        // consent box, so it must record the same fact.
        { ...payload, pdpaConsentVersion: PRIVACY_POLICY_VERSION },
        { context: new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true) }
      )
      .toPromise()
      .then((response) => {
        if (response?.code === 200) {
          const token = response?.data?.accessToken;
          const username = response?.data?.user?.email;
          const roles = response?.data?.user?.roles;
          this.storeAuthData(token, username, roles, response?.data?.refreshToken);
        }
        return response;
      });
  }

  verifyEmail(payload: {
    token: string;
  }): Promise<ResponseAPI<unknown> | undefined> {
    return this.http
      .post<ResponseAPI<unknown>>(
        `${environment.apiUrl}/api/auth/verify-email`,
        payload,
        { context: new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true) }
      )
      .toPromise();
  }

  resendVerification(payload: {
    email: string;
  }): Promise<ResponseAPI<unknown> | undefined> {
    return this.http
      .post<ResponseAPI<unknown>>(
        `${environment.apiUrl}/api/auth/verify-email/resend`,
        payload,
        { context: new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true) }
      )
      .toPromise();
  }

  forgetPassword(payload: {
    email: string;
  }): Promise<ResponseAPI<PasswordResetRequestResponse> | undefined> {
    return this.http
      .post<ResponseAPI<PasswordResetRequestResponse>>(
        `${environment.apiUrl}/api/auth/password-reset/request`,
        payload
      )
      .toPromise()
      .then((response) => response);
  }

  // OBRS-613: public endpoint — the reset link is opened logged out. Mirrors
  // confirmEmailChange() for SKIP_GLOBAL_ERROR_ALERT: a reset link is single-use and
  // expires, so "invalid or already used" is the ordinary case, and the page renders it
  // inline with a way forward instead of a red global toast.
  confirmPasswordReset(payload: {
    token: string;
    newPassword: string;
  }): Promise<ResponseAPI<PasswordResetConfirmResponse> | undefined> {
    return this.http
      .post<ResponseAPI<PasswordResetConfirmResponse>>(
        `${environment.apiUrl}/api/auth/password-reset/confirm`,
        payload,
        { context: new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true) }
      )
      .toPromise()
      .then((response) => response);
  }

  // OBRS-84: verified self-service login-email change. `newEmail` is not yet
  // applied to the account — the backend only flips it once the user clicks
  // the emailed confirmation link (confirmEmailChange below).
  requestEmailChange(payload: {
    currentPassword: string;
    newEmail: string;
  }): Promise<ResponseAPI<EmailChangeRequestResponse> | undefined> {
    return this.http
      .post<ResponseAPI<EmailChangeRequestResponse>>(
        `${environment.apiUrl}/api/private/users/me/email/change-request`,
        payload,
        {
          // SKIP_AUTH_LOGOUT: a wrong-current-password response must NOT
          // force-logout the user out of their own account settings
          // (OBRS-187 lesson). SKIP_GLOBAL_ERROR_ALERT: the dialog renders
          // the error inline under the relevant field instead of a global
          // toast.
          context: new HttpContext()
            .set(SKIP_AUTH_LOGOUT, true)
            .set(SKIP_GLOBAL_ERROR_ALERT, true),
        }
      )
      .toPromise();
  }

  // Public endpoint (the confirmation link is opened logged-out or with a
  // stale token) — mirrors verifyEmail() above for SKIP_GLOBAL_ERROR_ALERT:
  // the confirm page renders its own inline state (including a deliberately
  // NEUTRAL, non-scary "already used/expired" state), so the global toast is
  // suppressed rather than stacking on top of it.
  confirmEmailChange(payload: {
    token: string;
  }): Promise<ResponseAPI<EmailChangeConfirmResponse> | undefined> {
    return this.http
      .post<ResponseAPI<EmailChangeConfirmResponse>>(
        `${environment.apiUrl}/api/auth/change-email/confirm`,
        payload,
        { context: new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true) }
      )
      .toPromise();
  }

  // No SKIP_AUTH_LOGOUT: unlike requestEmailChange, a real 401 here means the
  // session is genuinely dead — force-logout is the correct behavior.
  resendEmailChangeVerification(): Promise<ResponseAPI<unknown> | undefined> {
    return this.http
      .post<ResponseAPI<unknown>>(
        `${environment.apiUrl}/api/auth/change-email/resend`,
        {},
        { context: new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true) }
      )
      .toPromise();
  }

  private isAuthPage(url: string): boolean {
    const path = url.split('?')[0].split('#')[0];

    return (
      path.startsWith('/login') ||
      path.startsWith('/login-mobile') ||
      path.startsWith('/register') ||
      path.startsWith('/otp') ||
      path.startsWith('/forget-password') ||
      // OBRS-613: without this, resetting from an emailed link and then signing in sends
      // the user straight back to /reset-password carrying a token the reset just spent.
      path.startsWith('/reset-password') ||
      path.startsWith('/verify-email')
    );
  }
}
