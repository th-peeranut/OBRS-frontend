import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  RouteListItem,
  RoutePickupDropoffData,
  RoutePickupDropoffResponse,
  RouteStatusValue,
} from '../../shared/interfaces/route-map.interface';
import {
  SKIP_AUTH_LOGOUT,
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
  /**
   * Session-scoped in-memory request-dedup cache for `getPickupDropoffCached`,
   * keyed by route slug. Intentionally lighter than the map's two-tier
   * Directions cache (localStorage + TTL) — this is purely a dedup so N rows
   * referencing the same route on one page fire a single HTTP call; the
   * server already `@Cacheable`s `getPickupDropoff` itself. Not persisted
   * across page loads/reloads.
   */
  private pickupDropoffCache = new Map<
    string,
    Observable<RoutePickupDropoffData | null>
  >();

  constructor(private http: HttpClient) {}

  getPickupDropoff(slug: string): Observable<RoutePickupDropoffResponse> {
    return this.http.get<RoutePickupDropoffResponse>(
      `${environment.apiUrl}/api/routes/${slug}/pickup-dropoff`,
      { context: this.selfHandledContext() }
    );
  }

  /**
   * Same data as `getPickupDropoff`, memoized per slug for the life of the
   * browser session (page load) and swallowing errors to `null` instead of
   * propagating — callers (per-row trip-estimate chips) treat a failure the
   * same as "not yet resolved": the chip simply stays absent, no AlertService
   * involved. `shareReplay({ refCount: false })` keeps the single in-flight/
   * completed request alive and replayed to every subscriber (each schedule
   * row on the same route), regardless of how many unsubscribe.
   */
  getPickupDropoffCached(slug: string): Observable<RoutePickupDropoffData | null> {
    const cached = this.pickupDropoffCache.get(slug);
    if (cached) {
      return cached;
    }

    const request$ = this.getPickupDropoff(slug).pipe(
      map((response) => response?.data ?? null),
      catchError(() => of<RoutePickupDropoffData | null>(null)),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.pickupDropoffCache.set(slug, request$);
    return request$;
  }

  getActiveRoutes(): Observable<RouteListItem[]> {
    return this.http
      .get<RouteListResponse>(`${environment.apiUrl}/api/routes`, {
        context: this.selfHandledContext(),
      })
      .pipe(
        map((response) => {
          const routes = response?.data ?? [];
          return routes.filter(
            (r) => this.isActiveStatus(r.status) && !this.isTestRoute(r.slug)
          );
        })
      );
  }

  getFirstActiveRouteSlug(): Observable<string | null> {
    return this.getActiveRoutes().pipe(
      map((routes) => routes[0]?.slug ?? null)
    );
  }

  // The route-map component renders its own loading spinner and inline error
  // state, so opt out of the global loading/error interceptor (which would
  // otherwise pop a blocking SweetAlert over the home page on any failure).
  // `/api/routes` is public (anonymous /home page) — SKIP_AUTH_LOGOUT (OBRS-187)
  // ensures an unauthenticated visitor never gets bounced to /login by it.
  private selfHandledContext(): HttpContext {
    return new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true)
      .set(SKIP_AUTH_LOGOUT, true);
  }

  // Guard against E2E test fixtures leaking into the public direction selector.
  // The SIT-LIVE admin E2E lane (ADR-0001) writes routes prefixed `TEST-` to the real
  // backend; e2e/support/sit-sweep.ts now removes them at the start and end of that run
  // (OBRS-617). This guard stays as defense-in-depth: a `TEST-` route still exists on SIT
  // *during* a run, when anonymous /home visitors are hitting GET /api/routes, and the
  // sweep is best-effort (a crashed run leaves the route until the next sweep).
  //
  // Anchored `^TEST-` on purpose. The old pattern also matched `e2e` anywhere in a slug,
  // which would silently hide any real route that happened to contain the substring
  // `e2e`. Test fixtures follow the ADR's `TEST-{runId}` convention, so the prefix alone
  // is the exact, non-overreaching signal.
  private isTestRoute(slug: string | undefined | null): boolean {
    return /^TEST-/.test(String(slug ?? ''));
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
