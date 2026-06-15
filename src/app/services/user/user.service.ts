import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly url = `${environment.apiUrl}/api/users/check-duplicate`;

  constructor(private http: HttpClient) {}

  // NOTE: The backend no longer exposes a username duplicate-check endpoint
  // (the user model is now email-based and has no username field). This
  // resolves to "not taken" without an HTTP call so callers keep working.
  checkExistUsername(_username: string): Observable<ResponseAPI<boolean>> {
    return of({ code: 200, message: 'OK', data: false });
  }

  checkExistEmail(email: string): Observable<ResponseAPI<boolean>> {
    return this.http.get<ResponseAPI<boolean>>(`${this.url}/email/${email}`);
  }

  checkExistPhoneNumber(phoneNumber: string): Observable<ResponseAPI<boolean>> {
    return this.http.get<ResponseAPI<boolean>>(`${this.url}/phoneNumber/${phoneNumber}`);
  }
}
