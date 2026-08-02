import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { distinctUntilChanged, filter, map, takeUntil } from 'rxjs/operators';
import { isRestrictedRoute } from '../../shared/lib/analytics-route-scope';

/**
 * Three states, not two. The third one is the point.
 *
 * `unknown` is the window between bootstrap and the first `NavigationEnd`, and
 * it is exactly where a deep link to `/staff/sell` lives: a staff member who
 * accepted the banner on a previous visit arrives with `granted` already in
 * localStorage, so a loader that only asked "granted?" would inject Clarity
 * before anything in the app knew which page was opening. There is no unloading
 * a tag once it is in the document, so this window has to be pessimistic.
 */
export type AnalyticsRouteScope = 'unknown' | 'measurable' | 'restricted';

/**
 * OBRS-887 — route scope for measurement, in one service.
 *
 * Two consumers want opposite defaults for `unknown`, and both are right:
 *
 * - **The tag loader** ({@link AnalyticsService}) waits for `measurable`. Not
 *   knowing the route is a reason to load nothing, per the deep-link window
 *   above.
 * - **The consent banner** hides only on `restricted`. It is a bar at the
 *   bottom of the screen; hiding it while the first route resolves buys no
 *   privacy and costs a flash of missing UI.
 *
 * `isRestricted` (the synchronous getter) re-reads the live router snapshot
 * rather than the cached subject on purpose. `AnalyticsService` also subscribes
 * to `router.events`, and which of the two subscriptions runs first is an
 * accident of construction order; a `page_view` must not be sent or dropped on
 * the strength of that ordering.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsRouteScopeService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly scopeSubject = new BehaviorSubject<AnalyticsRouteScope>('unknown');

  /** The current scope, as a stream. Replays the latest value on subscribe. */
  readonly scope$: Observable<AnalyticsRouteScope>;

  /** `true` only once a route has resolved AND it is not a staff/admin page. */
  readonly isMeasurable$: Observable<boolean>;

  /** `true` only once a route has resolved AND it IS a staff/admin page. */
  readonly isRestricted$: Observable<boolean>;

  constructor(private readonly router: Router) {
    this.scope$ = this.scopeSubject.asObservable().pipe(distinctUntilChanged());
    this.isMeasurable$ = this.scope$.pipe(
      map((scope) => scope === 'measurable'),
      distinctUntilChanged()
    );
    this.isRestricted$ = this.scope$.pipe(
      map((scope) => scope === 'restricted'),
      distinctUntilChanged()
    );

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => this.scopeSubject.next(this.readScope()));
  }

  /** The current scope, synchronously. */
  get scope(): AnalyticsRouteScope {
    return this.scopeSubject.value;
  }

  /**
   * Whether the page on screen right now is a staff/admin page — read live from
   * the router, so it is correct no matter who was notified first.
   */
  get isRestricted(): boolean {
    return isRestrictedRoute(this.router.routerState.snapshot.root);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private readScope(): AnalyticsRouteScope {
    return isRestrictedRoute(this.router.routerState.snapshot.root)
      ? 'restricted'
      : 'measurable';
  }
}
