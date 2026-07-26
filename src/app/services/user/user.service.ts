import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly url = `${environment.apiUrl}/api/users/check-duplicate`;

  constructor(private http: HttpClient) {}

  // OBRS-713: `checkExistUsername` stood here, hard-coded to `of({ data: false })`
  // — "always available" for a field the user model does not have. Its one caller
  // (the register form's username control) is gone, so the stub went with it
  // rather than staying as a lie a future caller could believe.
  checkExistEmail(email: string): Observable<ResponseAPI<boolean>> {
    return this.http.get<ResponseAPI<boolean>>(`${this.url}/email/${email}`);
  }

  checkExistPhoneNumber(phoneNumber: string): Observable<ResponseAPI<boolean>> {
    return this.http.get<ResponseAPI<boolean>>(`${this.url}/phoneNumber/${phoneNumber}`);
  }
}
