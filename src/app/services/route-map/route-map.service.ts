import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  RouteListItem,
  RoutePickupDropoffResponse,
  RouteStatusValue,
} from '../../shared/interfaces/route-map.interface';

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
      `${environment.apiUrl}/api/routes/${slug}/pickup-dropoff`
    );
  }

  getFirstActiveRouteSlug(): Observable<string | null> {
    return this.http
      .get<RouteListResponse>(`${environment.apiUrl}/api/routes`)
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
