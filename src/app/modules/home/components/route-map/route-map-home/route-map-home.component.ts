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
   * OBRS-1211: gates `<app-route-map-panel>` — the sole call site in the repo
   * that loads Google Maps JS — behind an explicit user request, instead of
   * mounting it (and firing the paid `maps.googleapis.com/maps/api/js` request)
   * on every `/home` page load. `false` until `revealMap()` runs.
   *
   * Deliberately NOT named `showMap`: that name is already taken by
   * `route-map-panel.component.ts:336`, where it means "the Maps JS SDK
   * finished loading" — a different signal entirely, one level down.
   */
  mapRevealed = false;

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
        this.reloadLocalizedStops();
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

  /**
   * OBRS-1211: reveals the gated map panel. Called both from the desktop/mobile
   * placeholder's own button and from `HomeComponent.onMapHintRequested()` (the
   * "not sure where to board?" link on the booking card above).
   *
   * On mobile, also switches the tab strip to the map tab (`1`) so the reveal
   * is visible without a second tap — desktop shows the map in its own column,
   * so `activeTabIndex` (0=pickup / 1=dropoff there) must NOT be touched.
   */
  revealMap(): void {
    this.mapRevealed = true;
    if (!this.isDesktop) {
      this.activeTabIndex = 1;
    }
  }

  /**
   * OBRS-1211: mobile `<p-tabs>` no longer uses `[(value)]` two-way binding —
   * tapping the map tab (index `1`) has to count as a reveal request too, and
   * a plain banana-in-a-box binding has no hook to do that from.
   *
   * `activeTabIndex` means something different per breakpoint (see
   * `revealMap()`'s comment), so this must stay guarded by `!this.isDesktop`
   * exactly like `revealMap()` — desktop's tab `1` is "drop-off", not "map".
   *
   * `value`'s type is `p-tabs`' own `valueChange` shape (`string | number |
   * undefined`) — this component only ever hands it numeric literals, but the
   * signature has to accept what PrimeNG actually emits.
   */
  onTabsValueChange(value: string | number | undefined): void {
    const index = Number(value);
    this.activeTabIndex = index;
    if (!this.isDesktop && index === 1) {
      this.mapRevealed = true;
    }
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

  /**
   * OBRS-929: re-fetches the same route because the LANGUAGE changed.
   *
   * `buildDirectionOptions()` above can only re-label the direction tabs — `titleLocalized` is the
   * one payload carrying all three languages at once. Everything else on this panel (province
   * labels, stop names, addresses) is localized by the backend from the `Accept-Language` header,
   * so it only changes by asking again.
   *
   * Deliberately NOT `loadPickupDropoff()`: that sets `loadState = 'loading'`, which unmounts
   * `<app-route-map-panel>` and would re-load the Google Maps JS SDK — the paid request OBRS-1211
   * exists to fire only on request — on every language switch. The list therefore stays on screen
   * in the old language for the one request it takes, and a failure leaves the working page alone
   * instead of replacing it with an error.
   */
  private reloadLocalizedStops(): void {
    if (this.loadState !== 'loaded' || !this.selectedRouteSlug) {
      return;
    }
    this.routeMapService
      .getPickupDropoff(this.selectedRouteSlug)
      .pipe(
        catchError(() => of(null)),
        takeUntil(this.destroy$)
      )
      .subscribe((response) => {
        if (response) {
          this.applyRouteData(response.data);
        }
      });
  }

  private applyRouteData(data: RoutePickupDropoffData): void {
    this.routeMeta = data.route;
    this.pickupStops = data.pickup ?? [];
    this.allDropoffStops = data.dropoff ?? [];
    // OBRS-929: the two selected stops are objects out of the PREVIOUS payload, and on a
    // language re-fetch the lists arrive re-localized while those two still carry the old
    // language's name and address — they are what the summary card under each list renders.
    // Re-point them at the new objects by slug, keeping the old one if the slug is gone so a
    // selection can never become `null` while its slug still says a stop is chosen. On first
    // load and on a direction change both slugs are null, so this is a no-op there.
    this.selectedPickupStop =
      this.pickupStops.find((s) => s.slug === this.selectedPickupSlug) ??
      this.selectedPickupStop;
    this.selectedDropoffStop =
      this.allDropoffStops.find((s) => s.slug === this.selectedDropoffSlug) ??
      this.selectedDropoffStop;
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
   * OBRS-1358: a tap in the stop LIST also carries the user to the side they have not
   * chosen yet, so the pair completes without a per-side "confirm" button in between.
   *
   * <p>Bound only to the list. The map panel keeps the plain handler above: it emits the
   * same event when a pin is tapped, and moving the tab strip out from under someone who
   * is reading the map is the surprise this card exists to remove, not add.
   */
  onPickupPickedFromList(stop: RouteStop): void {
    this.onPickupStopSelected(stop);
    // Do not advance once the pair is already complete - that would fight a user who is
    // changing their mind - and do not advance onto an empty tab: refreshDropoffOptions
    // legitimately leaves the list empty when the chosen pickup is the last stop served.
    if (!this.selectedDropoffSlug && this.dropoffStops.length > 0) {
      this.activeTabIndex = this.isDesktop ? 1 : 2;
    }
  }

  onDropoffPickedFromList(stop: RouteStop): void {
    this.onDropoffStopSelected(stop);
    if (!this.selectedPickupSlug) {
      this.activeTabIndex = 0;
    }
  }

  /** Both sides chosen - the only state in which confirming means anything. */
  get canConfirm(): boolean {
    return !!this.selectedPickupSlug && !!this.selectedDropoffSlug;
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

  /**
   * OBRS-1358: the three "you are missing a side" branches this used to open with are gone.
   * They were unreachable-by-design already (the button is disabled until `canConfirm`), and
   * reaching them was the reported symptom: a toast is a poor place to explain a button that
   * should not have been pressable, and on mobile the PDPA banner can cover it (OBRS-1372).
   * The guard that remains is the type narrowing, not a user-facing case.
   */
  onConfirm(): void {
    if (!this.selectedPickupSlug || !this.selectedDropoffSlug) {
      return;
    }

    this.pickupDropoffConfirmed.emit({
      pickupSlug: this.selectedPickupSlug,
      dropoffSlug: this.selectedDropoffSlug,
    });
  }
}
