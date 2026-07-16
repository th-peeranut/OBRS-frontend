import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
} from '../shared/interceptors/http-context-tokens';
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

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly USERNAME_KEY = 'auth_username';
  private readonly ROLES_KEY = 'auth_roles';
  private readonly REGISTER_VALUE_KEY = 'register_value';
  private readonly RETURN_URL_KEY = 'auth_return_url';

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

  // Roles that are confined to a non-public portal. A logged-in user holding
  // only these (and not owner/customer) must be bounced out of customer
  // pages. Admin is deliberately NOT in this list (OBRS-176): admin now has
  // cross-area access and may reach the customer area, mirroring owner.
  private static readonly PORTAL_ONLY_ROLES = ['salesperson', 'driver'];

  // Observable to track authentication status
  private authStatusSubject = new BehaviorSubject<boolean>(
    this.isAuthenticated()
  );
  authStatus$ = this.authStatusSubject.asObservable();

  registerValue?: Register;

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
          this.storeAuthData(token, username, roles);
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
    roles?: string[] | null | undefined
  ): void {
    if (!token) return;
    localStorage.setItem(this.TOKEN_KEY, token);
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
    localStorage.removeItem(this.USERNAME_KEY);
    localStorage.removeItem(this.ROLES_KEY);
    this.authStatusSubject.next(false);
  }

  setPostLoginRedirectUrl(url: string | null | undefined): void {
    if (!url || this.isAuthPage(url)) {
      return;
    }

    sessionStorage.setItem(this.RETURN_URL_KEY, url);
  }

  consumePostLoginRedirectUrl(defaultUrl: string = '/'): string {
    const url = sessionStorage.getItem(this.RETURN_URL_KEY);
    sessionStorage.removeItem(this.RETURN_URL_KEY);

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
      const grants = AuthService.ROLE_GRANTS[role];
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

  // Whether the current identity may sit on public/customer pages. Guests and
  // customers/owners/admins belong there; a user with no recognised portal
  // role fails open to the public site. Only users confined to a staff
  // portal (salesperson/driver and not also owner/customer/admin) are
  // excluded — the guard bounces them home.
  canAccessCustomerArea(): boolean {
    const roles = this.getRoles();
    if (roles.length === 0) {
      return true;
    }
    if (roles.includes('owner') || roles.includes('customer')) {
      return true;
    }
    return !roles.some((role) =>
      AuthService.PORTAL_ONLY_ROLES.includes(role)
    );
  }

  logout(): void {
    this.clearAuthData();
    this.router.navigate(['/login']);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  setRegisterValue(payload: Register) {
    this.registerValue = payload;
    sessionStorage.setItem(this.REGISTER_VALUE_KEY, JSON.stringify(payload));
  }

  getRegisterValue(): Register | undefined {
    if (this.registerValue) return this.registerValue;
    const raw = sessionStorage.getItem(this.REGISTER_VALUE_KEY);
    if (!raw) return undefined;
    try {
      this.registerValue = JSON.parse(raw) as Register;
      return this.registerValue;
    } catch {
      return undefined;
    }
  }

  clearRegisterValue() {
    this.registerValue = {
      title: null,
      email: '',
      firstName: '',
      isPhoneNumberVerify: false,
      lastName: '',
      middleName: '',
      password: '',
      phoneNumber: '',
      roles: [],
      preferredLocale: '',
      username: '',
      pdpaConsent: false,
    };
    sessionStorage.removeItem(this.REGISTER_VALUE_KEY);
  }

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
            this.storeAuthData(token, username, roles);
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
        payload,
        { context: new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true) }
      )
      .toPromise()
      .then((response) => {
        if (response?.code === 200) {
          const token = response?.data?.accessToken;
          const username = response?.data?.user?.email;
          const roles = response?.data?.user?.roles;
          this.storeAuthData(token, username, roles);
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

  confirmPasswordReset(payload: {
    token: string;
    newPassword: string;
  }): Promise<ResponseAPI<PasswordResetConfirmResponse> | undefined> {
    return this.http
      .post<ResponseAPI<PasswordResetConfirmResponse>>(
        `${environment.apiUrl}/api/auth/password-reset/confirm`,
        payload
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
      path.startsWith('/verify-email')
    );
  }
}
