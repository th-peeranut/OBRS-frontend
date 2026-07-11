import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  NotificationPreferencesData,
  UpdateNotificationPreferenceItem,
} from '../../shared/interfaces/notification-preference.interface';
import { SKIP_GLOBAL_ERROR_ALERT } from '../../shared/interceptors/http-context-tokens';

/**
 * OBRS-141. Follows `UserService`'s pattern (constructor-injected
 * `HttpClient`, `Observable<ResponseAPI<T>>` returns, `environment.apiUrl` —
 * no `.toPromise()`/`firstValueFrom`, per CLAUDE.md §2). Both calls opt out
 * of the global error toast (`SKIP_GLOBAL_ERROR_ALERT`) because
 * `NotificationPreferencesPageComponent` owns its own error UX: the GET
 * renders an inline "try again" state and the PUT branches on
 * `err.error.errorCode` (critical-channel rule vs. generic failure).
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationPreferencesService {
  private readonly url = `${environment.apiUrl}/api/private/users/me/notification-preferences`;

  constructor(private http: HttpClient) {}

  getPreferences(): Observable<ResponseAPI<NotificationPreferencesData>> {
    return this.http.get<ResponseAPI<NotificationPreferencesData>>(this.url, {
      context: this.silentErrorContext(),
    });
  }

  updatePreferences(
    preferences: UpdateNotificationPreferenceItem[]
  ): Observable<ResponseAPI<NotificationPreferencesData>> {
    return this.http.put<ResponseAPI<NotificationPreferencesData>>(
      this.url,
      { preferences },
      { context: this.silentErrorContext() }
    );
  }

  private silentErrorContext(): HttpContext {
    return new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true);
  }
}
