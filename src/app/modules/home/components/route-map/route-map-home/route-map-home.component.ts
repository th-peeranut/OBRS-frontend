import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { TranslateService } from '@ngx-translate/core';
import { catchError, forkJoin, Observable, of, Subject, takeUntil } from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import { RouteMapService } from '../../../../../services/route-map/route-map.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import {
  PickupDropoffConfirmedEvent,
  RouteListItem,
  RouteMeta,
  RoutePickupDropoffData,
  RoutePickupDropoffResponse,
  RouteStop,
} from '../../../../../shared/interfaces/route-map.interface';
import { UserLocatedEvent } from '../route-map-panel/route-map-panel.component';

type LoadState = 'loading' | 'loaded' | 'error' | 'empty';
type ErrorRetryTarget = 'directions' | 'pickupDropoff';

interface DirectionOption {
  label: string;
  value: string;
}

@Component({
    selector: 'app-route-map-home',
    templateUrl: './route-map-home.component.html',
    styleUrl: './route-map-home.component.scss',
    standalone: false
})
export class RouteMapHomeComponent implements OnInit, OnDestroy {
  @Output() pickupDropoffConfirmed =
    new EventEmitter<PickupDropoffConfirmedEvent>();

  loadState: LoadState = 'loading';
  routeMeta: RouteMeta | null = null;
  pickupStops: RouteStop[] = [];
  /**
   * The drop-offs OFFERED for the currently selected pickup — not the raw API list.
   *
   * OBRS-1052: `pickup` and `dropoff` stopped being disjoint. A stop whose `boarding_type` is
   * `BOTH` (จุดพักรถลาดกระบัง 1 ขาออก on bangkok_chonburi) is returned in both arrays, so binding
   * this straight to `data.dropoff` would offer the user the stop they are already boarding at,
   * plus any stop the van passes BEFORE it. Neither pair exists in `segments`, and the backend
   * answers a non-existent pair with a 404 from SegmentService rather than a zero fare — so the
   * failure would land at the moment of booking, not at selection.
   *
   * Recomputed on route load and on pickup change (see `refreshDropoffOptions`) and NOT exposed as
   * a getter: it is an `@Input` to route-map-panel, whose `ngOnChanges` re-fits the map bounds, and
   * a getter allocating a fresh array every change-detection pass would re-fire that forever.
   */
  dropoffStops: RouteStop[] = [];

  selectedPickupSlug: string | null = null;
  selectedDropoffSlug: string | null = null;
  selectedPickupStop: RouteStop | null = null;
  selectedDropoffStop: RouteStop | null = null;

  // Direction selector
  directionOptions: DirectionOption[] = [];
  selectedRouteSlug: string = environment.homeRouteSlug ?? '';

  isDesktop = true;
  mapsApiKey = environment.mapsApiKey;
  activeTabIndex: number = 0;

  /**
   * Straight-line distance (km) from the user's location to each pickup stop,
   * keyed by slug. Null until the user taps "Use my location"; reset when the
   * route changes since the pickup set is then different.
   */
  pickupDistancesKm: Record<string, number> | null = null;

  /**
   * Every drop-off the route offers, exactly as the API returned it. `dropoffStops` is this list
   * narrowed to what is reachable from the chosen pickup; the empty-state check reads THIS one, so
   * "this route has no drop-offs" stays distinguishable from "the stop you picked is the last one".
   */
  private allDropoffStops: RouteStop[] = [];

  private errorRetryTarget: ErrorRetryTarget = 'directions';
  private activeRoutes: RouteListItem[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private routeMapService: RouteMapService,
    private alertService: AlertService,
    private translateService: TranslateService,
    private breakpointObserver: BreakpointObserver
  ) {}

  ngOnInit(): void {
    this.breakpointObserver
      .observe(['(min-width: 1200px)'])
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.isDesktop = state.matches;
      });

    this.translateService.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.buildDirectionOptions();
      });

    this.loadDirections();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDirections(): void {
    this.loadState = 'loading';
    const homeSlug = environment.homeRouteSlug || null;

    // Pre-fetch pickup-dropoff concurrently when the slug is already known from
    // the environment config.  When homeSlug is absent, prefetch$ emits null
    // immediately so forkJoin degrades to the original sequential behaviour.
    const prefetch$: Observable<RoutePickupDropoffResponse | null> = homeSlug
      ? this.routeMapService
          .getPickupDropoff(homeSlug)
          .pipe(catchError(() => of<RoutePickupDropoffResponse | null>(null)))
      : of<RoutePickupDropoffResponse | null>(null);

    forkJoin({
      routes: this.routeMapService.getActiveRoutes().pipe(
        catchError(() => {
          this.loadState = 'error';
          this.errorRetryTarget = 'directions';
          return of<RouteListItem[]>([]);
        })
      ),
      prefetchedPickupDropoff: prefetch$,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ routes, prefetchedPickupDropoff }) => {
        if (this.loadState === 'error') {
          return;
        }
        this.activeRoutes = routes;
        this.buildDirectionOptions();
        this.setDefaultRoute();

        if (!this.selectedRouteSlug) {
          this.loadState = 'empty';
          return;
        }

        if (homeSlug && this.selectedRouteSlug === homeSlug) {
          // We pre-fetched for this exact slug — use it or surface the error.
          if (prefetchedPickupDropoff) {
            this.applyRouteData(prefetchedPickupDropoff.data);
          } else {
            this.loadState = 'error';
            this.errorRetryTarget = 'pickupDropoff';
          }
        } else {
          // homeSlug absent, or the default route resolved to a different slug
          // than what we pre-fetched — fetch the correct slug now.
          this.loadPickupDropoff(this.selectedRouteSlug);
        }
      });
  }

  loadPickupDropoff(slug: string): void {
    this.loadState = 'loading';
    this.routeMapService
      .getPickupDropoff(slug)
      .pipe(
        catchError(() => {
          this.loadState = 'error';
          this.errorRetryTarget = 'pickupDropoff';
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((response) => {
        if (this.loadState === 'error') {
          return;
        }
        if (!response) {
          this.loadState = 'empty';
          return;
        }
        this.applyRouteData(response.data);
      });
  }

  onDirectionChange(value: string): void {
    if (!value) {
      return;
    }
    this.selectedPickupSlug = null;
    this.selectedDropoffSlug = null;
    this.selectedPickupStop = null;
    this.selectedDropoffStop = null;
    this.routeMeta = null;
    this.pickupStops = [];
    this.dropoffStops = [];
    this.allDropoffStops = [];
    // Distances belong to the previous route's pickup set — clear them; the
    // panel re-emits fresh distances if the user has already located.
    this.pickupDistancesKm = null;
    this.loadState = 'loading';
    this.loadPickupDropoff(value);
  }

  onRetry(): void {
    if (this.errorRetryTarget === 'directions') {
      this.loadDirections();
    } else {
      this.loadPickupDropoff(this.selectedRouteSlug);
    }
  }

  private buildDirectionOptions(): void {
    const lang = this.translateService.currentLang ?? 'th';
    this.directionOptions = this.activeRoutes.map((route) => ({
      label:
        route.translations[lang as 'en' | 'th' | 'zh']?.label ??
        route.translations['en']?.label ??
        route.slug,
      value: route.slug,
    }));
  }

  private setDefaultRoute(): void {
    const envSlug = environment.homeRouteSlug;
    if (envSlug && this.activeRoutes.some((r) => r.slug === envSlug)) {
      this.selectedRouteSlug = envSlug;
    } else if (this.activeRoutes.length > 0) {
      this.selectedRouteSlug = this.activeRoutes[0].slug;
    }
  }

  private applyRouteData(data: RoutePickupDropoffData): void {
    this.routeMeta = data.route;
    this.pickupStops = data.pickup ?? [];
    this.allDropoffStops = data.dropoff ?? [];
    this.refreshDropoffOptions();

    if (this.pickupStops.length === 0 && this.allDropoffStops.length === 0) {
      this.loadState = 'empty';
    } else {
      this.loadState = 'loaded';
    }
  }

  /**
   * Narrows `allDropoffStops` to the stops the van reaches AFTER the chosen pickup, and drops a
   * selection that the new pickup has just invalidated.
   *
   * <p>With no pickup chosen yet the full list is offered — that is the pre-OBRS-1052 behaviour and
   * the only sensible one, since "after the pickup" has no meaning without a pickup.
   *
   * <p>The comparison is on `order` (the stop's position along the route), not on array index:
   * `pickup` and `dropoff` are two independently-ordered lists, so an index means nothing across
   * them, and `order` is the field the API already carries for exactly this.
   */
  private refreshDropoffOptions(): void {
    const pickupOrder = this.selectedPickupStop?.order ?? null;

    this.dropoffStops =
      pickupOrder === null
        ? this.allDropoffStops
        : this.allDropoffStops.filter((s) => s.order > pickupOrder);

    // A drop-off chosen before the pickup moved can now be upstream of it (or be the pickup
    // itself). Leaving it selected would submit exactly the pair this method exists to prevent —
    // the list on screen would no longer contain it, so nothing would show the user why.
    if (
      this.selectedDropoffSlug &&
      !this.dropoffStops.some((s) => s.slug === this.selectedDropoffSlug)
    ) {
      this.selectedDropoffSlug = null;
      this.selectedDropoffStop = null;
    }
  }

  onPickupStopSelected(stop: RouteStop): void {
    this.selectedPickupSlug = stop.slug;
    this.selectedPickupStop = stop;
    this.refreshDropoffOptions();
  }

  /**
   * The map panel resolved the user's location: store the per-stop distances
   * for the pickup list badges and auto-select the nearest pickup so the user
   * immediately sees which one is closest.
   */
  onUserLocated(event: UserLocatedEvent): void {
    this.pickupDistancesKm = event.distancesKm;

    if (event.nearestPickupSlug) {
      const nearest = this.pickupStops.find(
        (s) => s.slug === event.nearestPickupSlug
      );
      if (nearest) {
        this.selectedPickupSlug = nearest.slug;
        this.selectedPickupStop = nearest;
        // Auto-selecting the nearest pickup moves the pickup just as a tap does, so the drop-off
        // list has to follow. Missing this is how "use my location" would leave an upstream
        // drop-off selected and offered.
        this.refreshDropoffOptions();
      }
    }
  }

  onDropoffStopSelected(stop: RouteStop): void {
    this.selectedDropoffSlug = stop.slug;
    this.selectedDropoffStop = stop;
  }

  onConfirmPickup(): void {
    this.onConfirm();
  }

  onConfirmDropoff(): void {
    this.onConfirm();
  }

  private onConfirm(): void {
    if (!this.selectedPickupSlug && !this.selectedDropoffSlug) {
      const msg = this.translateService.instant(
        'HOME.ROUTE_MAP.VALIDATION_SELECT_BOTH'
      );
      this.alertService.toast(msg, 'warning');
      return;
    }

    if (!this.selectedPickupSlug) {
      const msg = this.translateService.instant(
        'HOME.ROUTE_MAP.VALIDATION_SELECT_PICKUP'
      );
      this.alertService.toast(msg, 'warning');
      this.activeTabIndex = 0;
      return;
    }

    if (!this.selectedDropoffSlug) {
      const msg = this.translateService.instant(
        'HOME.ROUTE_MAP.VALIDATION_SELECT_DROPOFF'
      );
      this.alertService.toast(msg, 'warning');
      this.activeTabIndex = this.isDesktop ? 1 : 2;
      return;
    }

    this.pickupDropoffConfirmed.emit({
      pickupSlug: this.selectedPickupSlug,
      dropoffSlug: this.selectedDropoffSlug,
    });
  }

  getRouteTitle(): string {
    const lang = this.translateService.currentLang ?? 'th';
    if (!this.routeMeta) {
      return '';
    }
    return (
      this.routeMeta.titleLocalized[lang as 'en' | 'th' | 'zh'] ??
      this.routeMeta.titleLocalized['th']
    );
  }
}
