import {
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
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
})
export class RouteMapHomeComponent implements OnInit, OnDestroy {
  @Output() pickupDropoffConfirmed =
    new EventEmitter<PickupDropoffConfirmedEvent>();

  @ViewChild('mapPanelRef') mapPanelRef!: ElementRef;

  loadState: LoadState = 'loading';
  routeMeta: RouteMeta | null = null;
  pickupStops: RouteStop[] = [];
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
    this.dropoffStops = data.dropoff ?? [];

    if (this.pickupStops.length === 0 && this.dropoffStops.length === 0) {
      this.loadState = 'empty';
    } else {
      this.loadState = 'loaded';
    }
  }

  onPickupStopSelected(stop: RouteStop): void {
    this.selectedPickupSlug = stop.slug;
    this.selectedPickupStop = stop;
  }

  onDropoffStopSelected(stop: RouteStop): void {
    this.selectedDropoffSlug = stop.slug;
    this.selectedDropoffStop = stop;
  }

  onViewMapClicked(): void {
    if (this.mapPanelRef?.nativeElement) {
      this.mapPanelRef.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }

  onConfirmPickup(): void {
    this.onConfirm();
  }

  onConfirmDropoff(): void {
    this.onConfirm();
  }

  private onConfirm(): void {
    if (!this.selectedPickupSlug || !this.selectedDropoffSlug) {
      const msg = this.translateService.instant(
        'HOME.ROUTE_MAP.VALIDATION_SELECT_BOTH'
      );
      this.alertService.warning(msg);
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
