import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  RouteListItem,
  RoutePickupDropoffResponse,
  RouteStatusValue,
} from '../../shared/interfaces/route-map.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

interface RouteListResponse {
  status: string;
  message: string;
  data: RouteListItem[];
}

@Injectable({
  providedIn: 'root',
})
export class RouteMapService {
  constructor(private http: HttpClient) {}

  getPickupDropoff(slug: string): Observable<RoutePickupDropoffResponse> {
    return this.http.get<RoutePickupDropoffResponse>(
      `${environment.apiUrl}/api/routes/${slug}/pickup-dropoff`,
      { context: this.selfHandledContext() }
    );
  }

  getFirstActiveRouteSlug(): Observable<string | null> {
    return this.http
      .get<RouteListResponse>(`${environment.apiUrl}/api/routes`, {
        context: this.selfHandledContext(),
      })
      .pipe(
        map((response) => {
          const routes = response?.data ?? [];
          const active = routes.find((r) =>
            this.isActiveStatus(r.status)
          );
          return active?.slug ?? null;
        })
      );
  }

  // The route-map component renders its own loading spinner and inline error
  // state, so opt out of the global loading/error interceptor (which would
  // otherwise pop a blocking SweetAlert over the home page on any failure).
  private selfHandledContext(): HttpContext {
    return new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true);
  }

  private isActiveStatus(status: RouteStatusValue | undefined | null): boolean {
    if (status === null || status === undefined) {
      return false;
    }
    const normalized =
      typeof status === 'object'
        ? String(status?.code ?? status?.slug ?? '').toLowerCase()
        : String(status).toLowerCase();
    return normalized === 'active';
  }
}
