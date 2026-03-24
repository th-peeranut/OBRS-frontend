import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoginResponseData, Register } from '../shared/interfaces/auth.interface';
import { ResponseAPI } from '../shared/interfaces/response.interface';
import { LoginOtpVerify } from '../shared/interfaces/otp.interface';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly USERNAME_KEY = 'auth_username';
  private readonly REGISTER_VALUE_KEY = 'register_value';
  private readonly RETURN_URL_KEY = 'auth_return_url';

  // Observable to track authentication status
  private authStatusSubject = new BehaviorSubject<boolean>(
    this.isAuthenticated()
  );
  authStatus$ = this.authStatusSubject.asObservable();

  registerValue?: Register;

  constructor(private http: HttpClient, private router: Router) {}

  login(payload: {
    username: string;
    password: string;
  }): Promise<ResponseAPI<LoginResponseData>> {
    return this.callLogin(payload);
  }

  private callLogin(payload: {
    username: string;
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
          const username = response?.data?.user?.username ?? payload.username;
          this.storeAuthData(token, username);
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

  private storeAuthData(token: string | null | undefined, username: string | null | undefined): void {
    if (!token) return;
    localStorage.setItem(this.TOKEN_KEY, token);
    if (username) {
      localStorage.setItem(this.USERNAME_KEY, username);
    } else {
      localStorage.removeItem(this.USERNAME_KEY);
    }
    this.authStatusSubject.next(true);
  }

  clearAuthData(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USERNAME_KEY);
    this.authStatusSubject.next(false);
  }

  setPostLoginRedirectUrl(url: string | null | undefined): void {
    if (!url || this.isAuthPage(url)) {
      return;
    }

    sessionStorage.setItem(this.RETURN_URL_KEY, url);
  }

  consumePostLoginRedirectUrl(defaultUrl: string = '/home'): string {
    const url = sessionStorage.getItem(this.RETURN_URL_KEY);
    sessionStorage.removeItem(this.RETURN_URL_KEY);

    if (!url || this.isAuthPage(url)) {
      return defaultUrl;
    }

    return url;
  }

  navigateAfterLogin(defaultUrl: string = '/home'): Promise<boolean> {
    const targetUrl = this.consumePostLoginRedirectUrl(defaultUrl);
    return this.router.navigateByUrl(targetUrl);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getUsername(): string | null {
    return localStorage.getItem(this.USERNAME_KEY);
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
    };
    sessionStorage.removeItem(this.REGISTER_VALUE_KEY);
  }

  register(payload: Register): Promise<ResponseAPI<any>> {
    return this.http
      .post<ResponseAPI<any>>(`${environment.apiUrl}/api/auth/signup`, payload)
      .toPromise()
      .then((response) => response)
      .catch((err) => err);
  }

  loginWithOtp(payload: LoginOtpVerify): Promise<ResponseAPI<any> | undefined> {
    return (
      this.http
        .post<ResponseAPI<any>>(
          `${environment.apiUrl}/api/auth/login/otp/test`,
          payload
        )
        // .post<ResponseAPI<any>>(
        //   `${environment.apiUrl}/api/auth/login/otp`,
        //   payload
        // )
        .toPromise()
        .then((response) => {
          if (response?.code === 200) {
            const token = response?.data?.accessToken ?? response?.data?.token;
            const username = response?.data?.user?.username ?? response?.data?.username;
            this.storeAuthData(token, username);
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

  forgetPassword(payload: {
    phoneNo: string;
  }): Promise<ResponseAPI<any> | undefined> {
    return this.http
      .post<ResponseAPI<any>>(
        `${environment.apiUrl}/api/auth/forgetpassword`,
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
      path.startsWith('/forget-password')
    );
  }
}
