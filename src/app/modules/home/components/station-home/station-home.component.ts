import { Component, OnDestroy, OnInit } from '@angular/core';
import { Station } from '../../../../shared/interfaces/station.interface';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Route } from '../../../../shared/interfaces/route.interface';
import { Observable, Subject } from 'rxjs';
import { select, Store } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectProvinceWithStation } from '../../../../shared/stores/province/province.selector';
import { ProvinceStation } from '../../../../shared/interfaces/province.interface';
@Component({
  selector: 'app-station-home',
  templateUrl: './station-home.component.html',
  styleUrl: './station-home.component.scss',
})
export class StationHomeComponent implements OnInit, OnDestroy {
  currentDirection: 'left' | 'right' = 'left'; // Default direction is 'left'

  routeList: Observable<ProvinceStation[]>;

  private destroy$ = new Subject<void>();

  isClickSwitchToggle: boolean = false;

  constructor(
    private router: Router,
    private translateService: TranslateService,
    private store: Store,
    private appStore: Store<Appstate>
  ) {}

  async ngOnInit() {
    this.routeList = this.store.pipe(select(selectProvinceWithStation));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onObrsClick(direction: 'left' | 'right'): void {
    this.isClickSwitchToggle = direction === 'right';

    if (this.currentDirection !== direction) {
      this.currentDirection = direction;
    }
  }

  getRouteName(route: ProvinceStation): string {
    return this.translateService.currentLang === 'th'
      ? route.nameThai
      : route.nameEnglish;
  }

  getRoutesName(route: ProvinceStation[], isReverse: boolean): string {
    if (isReverse) {
      route = route.slice().reverse();
    }

    return this.translateService.currentLang === 'th'
      ? route[0].nameThai + ' - ' + route[1].nameThai
      : route[0].nameEnglish + ' - ' + route[1].nameEnglish;
  }

  getRoute(route: ProvinceStation[]) {
    if (this.isClickSwitchToggle) {
      return (route = route.slice().reverse());
    }

    return route;
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
