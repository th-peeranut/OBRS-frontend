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

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  @ViewChild(HomeBookingComponent) homeBookingRef!: HomeBookingComponent;
  @ViewChild('homeBookingEl', { read: ElementRef }) homeBookingEl!: ElementRef;

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
}


