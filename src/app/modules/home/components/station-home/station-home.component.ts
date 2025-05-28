import { Component, OnDestroy, OnInit } from '@angular/core';
import { Station } from '../../../../shared/interfaces/station.interface';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Route } from '../../../../shared/interfaces/route.interface';
import { RouteMap } from '../../../../shared/interfaces/route-map.interface';
import { Observable, Subject } from 'rxjs';
import { select, Store } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectStation } from '../../../../shared/stores/station/station.selector';
import { selectRoute } from '../../../../shared/stores/route/route.selector';
import { selectRouteMap } from '../../../../shared/stores/route-map/route-map.selector';
@Component({
  selector: 'app-station-home',
  templateUrl: './station-home.component.html',
  styleUrl: './station-home.component.scss',
})
export class StationHomeComponent implements OnInit, OnDestroy {
  isOn: boolean = false;

  currentDirection: 'left' | 'right' = 'left'; // Default direction is 'left'

  stationList: Observable<Station[]>;
  routeList: Observable<Route[]>;
  routeMapList: Observable<RouteMap[]>;

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private translateService: TranslateService,
    private store: Store,
    private appStore: Store<Appstate>
  ) {}

  async ngOnInit() {
    this.stationList = this.store.pipe(select(selectStation));
    this.routeList = this.store.pipe(select(selectRoute));
    this.routeMapList = this.store.pipe(select(selectRouteMap));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onObrsClick(direction: 'left' | 'right'): void {
    if (this.currentDirection !== direction) {
      this.currentDirection = direction;
    }
  }

  getRoutesName(route: Route): string {
    return this.translateService.currentLang === 'th'
      ? route.nameThai
      : route.nameEnglish;
  }

  getStationName(station: Station): string {
    return this.translateService.currentLang === 'th'
      ? station.nameThai
      : station.nameEnglish;
  }

  navMap(url: string) {
    window.open(url, '_blank');
  }
}
