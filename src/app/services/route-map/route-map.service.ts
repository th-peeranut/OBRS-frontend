import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
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
import {
  APP_LANGUAGE_KEY,
  DEFAULT_LANGUAGE,
} from '../../shared/services/language.service';

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
   * Session-scoped in-memory request-dedup cache, keyed by request URL (plus the
   * request language where the response is localized — see `languageScopedKey`).
   * Intentionally lighter than the map's two-tier Directions cache
   * (localStorage + TTL) — this is purely a dedup so N callers asking for the
   * same route on one page fire a single HTTP call; the server already
   * `@Cacheable`s these endpoints itself. Not persisted across page loads.
   *
   * OBRS-1213 moved it DOWN one level, from `getPickupDropoffCached`'s mapped
   * result to the raw GET, and widened it to `/api/routes`. The reason is that
   * /home now has two independent consumers of the same route data — the map
   * (`getPickupDropoff`, which needs the error to propagate so its "ลองใหม่"
   * button means something) and the booking form's origin/destination filter
   * (`getPickupDropoffCached`, which degrades to null). Deduping only the
   * error-swallowing variant would have left those two issuing separate GETs
   * for byte-identical data.
   */
  private sharedRequests = new Map<string, Observable<unknown>>();

  constructor(private http: HttpClient) {}

  getPickupDropoff(slug: string): Observable<RoutePickupDropoffResponse> {
    const url = `${environment.apiUrl}/api/routes/${slug}/pickup-dropoff`;
    return this.shared(this.languageScopedKey(url), () =>
      this.http.get<RoutePickupDropoffResponse>(url, {
        context: this.selfHandledContext(),
      })
    );
  }

  /**
   * OBRS-929: this payload's stop names, addresses and province labels are localized by the
   * BACKEND from the request's `Accept-Language` header, so one entry per URL would replay the
   * first language's payload for the rest of the page — the browser-side half of the trap the
   * backend already guards on its own cache (`RouteStopService` puts the language in its key).
   *
   * The language is read from localStorage exactly as `authInterceptor` reads it to BUILD that
   * header, not from `TranslateService`: the key then cannot disagree with what was actually
   * sent, and this service keeps its single `HttpClient` dependency.
   *
   * `getActiveRoutes` deliberately keeps the bare URL — `/api/routes` ships `translations` for
   * all three languages in one payload, so it is the same bytes whatever the header says.
   */
  private languageScopedKey(url: string): string {
    return `${url}|${localStorage.getItem(APP_LANGUAGE_KEY) || DEFAULT_LANGUAGE}`;
  }

  /**
   * Same data as `getPickupDropoff` (and the same single HTTP call — see
   * `shared()`), swallowing errors to `null` instead of propagating: callers
   * (per-row trip-estimate chips, the origin/destination filter) treat a
   * failure the same as "not yet resolved" — the chip stays absent, the
   * dropdown keeps offering every stop — with no AlertService involved.
   */
  getPickupDropoffCached(slug: string): Observable<RoutePickupDropoffData | null> {
    return this.getPickupDropoff(slug).pipe(
      map((response) => response?.data ?? null),
      catchError(() => of<RoutePickupDropoffData | null>(null))
    );
  }

  getActiveRoutes(): Observable<RouteListItem[]> {
    const url = `${environment.apiUrl}/api/routes`;
    return this.shared(url, () =>
      this.http.get<RouteListResponse>(url, {
        context: this.selfHandledContext(),
      })
    ).pipe(
      map((response) => {
        const routes = response?.data ?? [];
        return routes.filter(
          (r) => this.isActiveStatus(r.status) && !this.isTestRoute(r.slug)
        );
      })
    );
  }

  /**
   * Memoizes one GET per key for the life of the page, replaying its single
   * response to every subscriber (`refCount: false` keeps it alive across
   * unsubscribes), and re-raising a failure to each of them unchanged.
   *
   * <p>The eviction is the whole point of writing this by hand instead of a
   * bare `shareReplay`: `shareReplay` also replays the ERROR notification, so a
   * cached failure would be permanent — the map's retry button would re-subscribe
   * to the same dead observable and "fail" forever without a request ever leaving
   * the browser. Dropping the key inside `catchError` means the next caller
   * builds a fresh request, which is exactly what a retry is.
   */
  private shared<T>(key: string, factory: () => Observable<T>): Observable<T> {
    const hit = this.sharedRequests.get(key) as Observable<T> | undefined;
    if (hit) {
      return hit;
    }

    const request$ = factory().pipe(
      catchError((error) => {
        this.sharedRequests.delete(key);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.sharedRequests.set(key, request$);
    return request$;
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
