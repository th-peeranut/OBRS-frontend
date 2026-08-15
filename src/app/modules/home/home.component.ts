import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { select, Store } from '@ngrx/store';
import { Subject, takeUntil } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { invokeGetAllProvinceWithStationApi } from '../../shared/stores/station/station.action';
import { selectProvinceWithStation } from '../../shared/stores/station/station.selector';
import { StationApi } from '../../shared/interfaces/station.interface';
import { AlertService } from '../../shared/services/alert.service';
import { HomeBookingComponent } from './components/home-booking/home-booking.component';
import { PickupDropoffConfirmedEvent } from '../../shared/interfaces/route-map.interface';
import { RouteMapHomeComponent } from './components/route-map/route-map-home/route-map-home.component';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
    standalone: false
})
export class HomeComponent implements OnInit, OnDestroy {
  @ViewChild(HomeBookingComponent) homeBookingRef!: HomeBookingComponent;
  @ViewChild('homeBookingEl', { read: ElementRef }) homeBookingEl!: ElementRef;
  @ViewChild(RouteMapHomeComponent) routeMapHomeRef!: RouteMapHomeComponent;
  @ViewChild('routeMapHomeEl', { read: ElementRef }) routeMapHomeEl!: ElementRef;

  allStations: StationApi[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private store: Store,
    private alertService: AlertService,
    private translateService: TranslateService
  ) {}

  ngOnInit(): void {
    this.store.dispatch(invokeGetAllProvinceWithStationApi());

    this.store
      .pipe(select(selectProvinceWithStation), takeUntil(this.destroy$))
      .subscribe((stations) => {
        this.allStations = stations ?? [];
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onPickupDropoffConfirmed(event: PickupDropoffConfirmedEvent): void {
    const pickupStation = this.allStations.find(
      (s) => s.slug === event.pickupSlug
    );
    const dropoffStation = this.allStations.find(
      (s) => s.slug === event.dropoffSlug
    );

    if (!pickupStation || !dropoffStation) {
      const msg = this.translateService.instant('SHARED.ERROR_GENERAL');
      this.alertService.error(msg);
      return;
    }

    this.homeBookingRef.onStartStationChange(pickupStation);
    this.homeBookingRef.onEndStationChange(dropoffStation);

    setTimeout(() => {
      this.homeBookingEl?.nativeElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  /** OBRS-1211: counterpart of `onPickupDropoffConfirmed()` above, in the
   *  opposite direction — reveals the gated map panel and scrolls down to it,
   *  instead of collecting a confirmed pair and scrolling up to the form. */
  onMapHintRequested(): void {
    this.routeMapHomeRef.revealMap();

    setTimeout(() => {
      this.routeMapHomeEl?.nativeElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      this.routeMapHomeEl?.nativeElement?.focus({ preventScroll: true });
    });
  }
}


