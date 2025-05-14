import { Component, OnInit } from '@angular/core';
import { Station } from '../../../../interfaces/station.interface';
import { Router } from '@angular/router';
import { StationService } from '../../../../services/station/station.service';
import { RouteService } from '../../../../services/routes/route.service';
import { TranslateService } from '@ngx-translate/core';
import { Route } from '../../../../interfaces/route.interface';

@Component({
  selector: 'app-station-home',
  templateUrl: './station-home.component.html',
  styleUrl: './station-home.component.scss',
})
export class StationHomeComponent implements OnInit {
  isOn: boolean = false;

  currentDirection: 'left' | 'right' = 'left'; // Default direction is 'left'

  routeList: Route[] = [];
  stationList: Station[] = [];

  constructor(
    private router: Router,
    private stationService: StationService,
    private routeService: RouteService,
    private translateService: TranslateService
  ) {}

  async ngOnInit() {
    let resPromise = Promise.all([
      this.routeService.getAll(),
      this.stationService.getAll(),
    ]);
    let [resRoute, resStation] = await resPromise;

    if (resRoute?.code === 200) {
      this.routeList = resRoute.data;
    } else {
      this.routeList = [];
    }

    if (resStation?.code === 200) {
      this.stationList = resStation.data;
    } else {
      this.stationList = [];
    }
  }

  onObrsClick(direction: 'left' | 'right'): void {
    if (this.currentDirection !== direction) {
      this.currentDirection = direction;
    }

    this.stationList.reverse();
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
