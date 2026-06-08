import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ResponseAPI } from '../../shared/interfaces/response.interface';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly url = `${environment.apiUrl}/api/users/check-duplicate`;

  constructor(private http: HttpClient) {}

  // NOTE: The backend no longer exposes a username duplicate-check endpoint
  // (the user model is now email-based and has no username field). This
  // resolves to "not taken" without an HTTP call so callers keep working.
  checkExistUsername(_username: string): Promise<ResponseAPI<boolean>> {
    return Promise.resolve({ code: 200, message: 'OK', data: false });
  }

  checkExistEmail(email: string): Promise<ResponseAPI<any>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .get<ResponseAPI<any>>(this.url + `/email/${email}`, {
        headers,
      })
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to get api');
        return response;
      });
  }

  checkExistPhoneNumber(phoneNumber: string): Promise<ResponseAPI<any>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .get<ResponseAPI<any>>(this.url + `/phoneNumber/${phoneNumber}`, {
        headers,
      })
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to get api');
        return response;
      });
  }
}
