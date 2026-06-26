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
import { Subject } from 'rxjs';
import { catchError, of, switchMap, takeUntil } from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import { RouteMapService } from '../../../../../services/route-map/route-map.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import {
  PickupDropoffConfirmedEvent,
  RouteMeta,
  RoutePickupDropoffData,
  RouteStop,
} from '../../../../../shared/interfaces/route-map.interface';

type LoadState = 'loading' | 'loaded' | 'error' | 'empty';

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

  isDesktop = true;
  mapsApiKey = environment.mapsApiKey;

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

    this.loadRouteData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadRouteData(): void {
    this.loadState = 'loading';
    const slug = environment.homeRouteSlug;

    const source$ = slug
      ? of(slug)
      : this.routeMapService.getFirstActiveRouteSlug();

    source$
      .pipe(
        switchMap((resolvedSlug) => {
          if (!resolvedSlug) {
            return of(null);
          }
          return this.routeMapService.getPickupDropoff(resolvedSlug);
        }),
        catchError(() => {
          this.loadState = 'error';
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
