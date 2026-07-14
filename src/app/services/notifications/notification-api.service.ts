import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import { PageResponse } from '../../shared/interfaces/payment.interface';
import {
  NotificationItem,
  NotificationMarkAllReadResultDto,
  NotificationMarkReadResultDto,
  NotificationUnreadCountDto,
} from '../../shared/interfaces/notification.interface';

export interface GetNotificationsParams {
  unreadOnly?: boolean;
  page: number;
  size: number;
}

/**
 * OBRS-317: HTTP client for the role-agnostic in-app notification inbox
 * (`/api/private/notifications`). Deliberately its OWN service, NOT folded
 * into `AdminApiService` — that service is admin-scoped (its base path and
 * every existing method assume an admin-area caller), while this endpoint
 * must also serve staff (salesperson/driver), who cannot reach
 * `AdminApiService`'s admin-only routes. Mirrors `AdminApiService`'s
 * get/post request-options convention (context tokens suppressing the
 * global loading/error UI — callers here surface their own errors via
 * `NotificationInboxService` + `AlertService`).
 */
@Injectable({ providedIn: 'root' })
export class NotificationApiService {
  private readonly baseUrl = `${environment.apiUrl}/api/private/notifications`;

  constructor(private readonly http: HttpClient) {}

  private context(): HttpContext {
    return new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true);
  }

  // Spring `Page` nests under `data` — callers read `data.content` /
  // `data.totalElements` / `data.number` (see `PageResponse<T>`).
  getNotifications(
    params: GetNotificationsParams
  ): Observable<ResponseAPI<PageResponse<NotificationItem>>> {
    let httpParams = new HttpParams()
      .set('page', String(params.page))
      .set('size', String(params.size));
    if (params.unreadOnly !== undefined) {
      httpParams = httpParams.set('unreadOnly', String(params.unreadOnly));
    }

    return this.http.get<ResponseAPI<PageResponse<NotificationItem>>>(this.baseUrl, {
      context: this.context(),
      params: httpParams,
    });
  }

  getUnreadCount(): Observable<ResponseAPI<NotificationUnreadCountDto>> {
    return this.http.get<ResponseAPI<NotificationUnreadCountDto>>(
      `${this.baseUrl}/unread-count`,
      { context: this.context() }
    );
  }

  markRead(id: number): Observable<ResponseAPI<NotificationMarkReadResultDto>> {
    return this.http.post<ResponseAPI<NotificationMarkReadResultDto>>(
      `${this.baseUrl}/${id}/read`,
      {},
      { context: this.context() }
    );
  }

  markAllRead(): Observable<ResponseAPI<NotificationMarkAllReadResultDto>> {
    return this.http.post<ResponseAPI<NotificationMarkAllReadResultDto>>(
      `${this.baseUrl}/read-all`,
      {},
      { context: this.context() }
    );
  }
}
