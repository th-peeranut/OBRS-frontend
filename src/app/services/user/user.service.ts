import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpContext } from '@angular/common/http';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable } from 'rxjs';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

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
  // Production-readiness review 2026-09-11: the backend now rate-limits these two
  // endpoints per IP (429 after 60 calls / 15 min). They are on-blur hints, not a
  // gate — RegisterComponent.checkDuplicateData already swallows the error and lets
  // the signup endpoint's own duplicate refusal decide — so a 429 (or any failure)
  // must neither pop the global error modal nor block the page behind the loading
  // overlay. Same opt-out pattern as CancellationPolicyService.
  checkExistEmail(email: string): Observable<ResponseAPI<boolean>> {
    return this.http.get<ResponseAPI<boolean>>(`${this.url}/email/${email}`, {
      context: this.quietContext(),
    });
  }

  checkExistPhoneNumber(phoneNumber: string): Observable<ResponseAPI<boolean>> {
    return this.http.get<ResponseAPI<boolean>>(`${this.url}/phoneNumber/${phoneNumber}`, {
      context: this.quietContext(),
    });
  }

  private quietContext(): HttpContext {
    return new HttpContext().set(SKIP_GLOBAL_LOADING_ALERT, true).set(SKIP_GLOBAL_ERROR_ALERT, true);
  }
}
