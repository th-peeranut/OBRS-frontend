import { Component, OnDestroy, OnInit } from '@angular/core';
import { Station } from '../../../../shared/interfaces/station.interface';
import { Router } from '@angular/router';
import { StationService } from '../../../../services/station/station.service';
import { RouteService } from '../../../../services/routes/route.service';
import { TranslateService } from '@ngx-translate/core';
import { Route } from '../../../../shared/interfaces/route.interface';
import { RouteMap } from '../../../../shared/interfaces/route-map.interface';
import { RouteMapService } from '../../../../services/route-map/route-map.service';
import { Observable, Subject } from 'rxjs';
import { select, Store } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectStation } from '../../../../shared/stores/station/station.selector';

@Component({
  selector: 'app-station-home',
  templateUrl: './station-home.component.html',
  styleUrl: './station-home.component.scss',
})
export class StationHomeComponent implements OnInit, OnDestroy {
  isOn: boolean = false;

  currentDirection: 'left' | 'right' = 'left'; // Default direction is 'left'

  routeList: Route[] = [];
  routeMap: RouteMap[] = [];

  stationList: Observable<Station[]>;

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private routeService: RouteService,
    private routeMapService: RouteMapService,
    private translateService: TranslateService,
    private store: Store,
    private appStore: Store<Appstate>
  ) {}

  async ngOnInit() {
    let resPromise = Promise.all([
      this.routeService.getAll(),
      this.routeMapService.getAll(),
    ]);
    let [resRoute, resRouteMap] = await resPromise;

    if (resRoute?.code === 200) {
      this.routeList = resRoute.data;
    } else {
      this.routeList = [];
    }

    if (resRouteMap?.code === 200) {
      this.routeMap = resRouteMap.data;
    } else {
      this.routeMap = [];
    }

    this.stationList = this.store.pipe(select(selectStation));
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
