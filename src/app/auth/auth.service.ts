import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { SKIP_GLOBAL_ERROR_ALERT } from '../shared/interceptors/http-context-tokens';
import {
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
  // WebSecurityConfig#roleHierarchy). Each role is granted the set of roles it
  // may satisfy:
  //   - owner       → all-access superset (admin + staff + customer)
  //   - admin       → the admin portal only (NOT a superset of staff/customer)
  //   - salesperson → the staff portal; still outranks driver within it
  //   - driver      → the staff portal (driver pages)
  //   - customer    → the public/customer area only
  // NOTE: this intentionally gates ADMIN *more tightly* than the backend
  // hierarchy (where admin still outranks staff). That is a deliberate UX
  // confinement — the FE never grants access the backend would deny, it only
  // narrows navigation, so no security boundary is weakened.
  private static readonly ROLE_GRANTS: Record<string, readonly string[]> = {
    owner: ['owner', 'admin', 'salesperson', 'driver', 'customer'],
    admin: ['admin'],
    salesperson: ['salesperson', 'driver'],
    driver: ['driver'],
    customer: ['customer'],
  };

  // Roles that are confined to a non-public portal. A logged-in user holding
  // only these (and not owner/customer) must be bounced out of customer pages.
  private static readonly PORTAL_ONLY_ROLES = ['admin', 'salesperson', 'driver'];

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
    // ROLE_GRANTS): owner satisfies everything, admin satisfies only admin,
    // salesperson still covers driver within the staff portal. An unrecognised
    // role only matches itself.
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
  // customers/owners belong there; a user with no recognised portal role fails
  // open to the public site. Only users confined to a portal (admin/staff and
  // not also owner/customer) are excluded — the guard bounces them home.
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
