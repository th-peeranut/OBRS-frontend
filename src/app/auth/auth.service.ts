import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { Register } from '../interfaces/auth.interface';
import { ResponseAPI } from '../interfaces/response.interface';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly USERNAME_KEY = 'auth_username';

  // Observable to track authentication status
  private authStatusSubject = new BehaviorSubject<boolean>(
    this.isAuthenticated()
  );
  authStatus$ = this.authStatusSubject.asObservable();

  constructor(private http: HttpClient, private router: Router) {}

  login(payload: {
    username: string;
    password: string;
  }): Promise<ResponseAPI<{ token: string }>> {
    return this.callLogin(payload);
  }

  private callLogin(payload: {
    username: string;
    password: string;
  }): Promise<ResponseAPI<{ token: string }>> {
    return this.http
      .post<ResponseAPI<{ token: string }>>(
        `${environment.apiUrl}/auth/login`,
        payload
      )
      .toPromise()
      .then((response) => {
        if (response?.code === 200) {
          this.storeAuthData(response?.data.token, payload.username);
        }
        return response;
      })
      .catch((err) => {
        if (err?.error.includes('JWT expired')) {
          this.clearAuthData();
          return this.callLogin(payload);
        }
        return err;
      });
  }

  private storeAuthData(token: string, username: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USERNAME_KEY, username);
    this.authStatusSubject.next(true);
  }

  clearAuthData(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USERNAME_KEY);
    this.authStatusSubject.next(false);
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

  register(payload: Register): Promise<ResponseAPI<any>> {
    return this.http
      .post<ResponseAPI<any>>(`${environment.apiUrl}/auth/signup`, payload)
      .toPromise()
      .then((response) => response)
      .catch((err) => err);
  }

  loginByPhoneNo(payload: {
    phoneNo: string;
  }): Promise<ResponseAPI<any> | undefined> {
    return this.http
      .post<ResponseAPI<any>>(
        `${environment.apiUrl}/auth/loginByPhoneNo`,
        payload
      )
      .toPromise()
      .then((response) => response);
  }

  forgetPassword(payload: {
    phoneNo: string;
  }): Promise<ResponseAPI<any> | undefined> {
    return this.http
      .post<ResponseAPI<any>>(
        `${environment.apiUrl}/auth/forgetpassword`,
        payload
      )
      .toPromise()
      .then((response) => response);
  }

  resendOTP(payload: {
    otpCode: string;
  }): Promise<ResponseAPI<any> | undefined> {
    return this.http
      .post<ResponseAPI<any>>(`${environment.apiUrl}/auth/resendOTP`, payload)
      .toPromise()
      .then((response) => response);
  }
}
