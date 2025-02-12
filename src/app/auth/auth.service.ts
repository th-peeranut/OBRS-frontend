import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { Register } from '../interfaces/auth.interface';
import { ResponseAPI } from '../interfaces/response.interface';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';

  constructor(private http: HttpClient, private router: Router) {}

  login(payload: {
    username: string;
    password: string;
    rememberMe: boolean;
  }): Promise<ResponseAPI<{ token: string }>> {
    return this.callLogin(payload);
  }

  callLogin(payload: {
    username: string;
    password: string;
    rememberMe: boolean;
  }): Promise<ResponseAPI<{ token: string }>> {
    return this.http
      .post<ResponseAPI<{ token: string }>>(
        `${environment.apiUrl}/auth/login`,
        {
          username: payload.username,
          password: payload.password,
        }
      )
      .toPromise()
      .then((response) => {
        if (response?.code === 200) {
          this.storeToken(response.data.token, payload.rememberMe);
        }
        return response;
      })
      .catch((err) => {
        if (err?.error.includes('JWT expired')) {
          this.clearToken();
          this.callLogin(payload);
        }

        return err;
      });
  }

  private storeToken(token: string, rememberMe: boolean): void {
    if (rememberMe) {
      localStorage.setItem(this.TOKEN_KEY, token);
    } else {
      sessionStorage.setItem(this.TOKEN_KEY, token);
    }
  }

  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
  }

  getToken(): string | null {
    return (
      localStorage.getItem(this.TOKEN_KEY) ||
      sessionStorage.getItem(this.TOKEN_KEY)
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
    this.router.navigate(['/login']);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  register(payload: Register): Promise<ResponseAPI<any>> {
    return this.http
      .post<ResponseAPI<any>>(`${environment.apiUrl}/auth/signup`, payload)
      .toPromise()
      .then((response) => {
        return response;
      })
      .catch((err) => {
        return err;
      });
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
      .then((response) => {
        return response;
      });
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
      .then((response) => {
        return response;
      });
  }

  resendOTP(payload: {
    otpCode: string;
  }): Promise<ResponseAPI<any> | undefined> {
    return this.http
      .post<ResponseAPI<any>>(`${environment.apiUrl}/auth/resendOTP`, payload)
      .toPromise()
      .then((response) => {
        return response;
      });
  }
}
