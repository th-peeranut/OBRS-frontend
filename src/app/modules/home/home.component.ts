import { Component, OnInit } from '@angular/core';

import { Store } from '@ngrx/store';
import { invokeGetAllRouteApi } from '../../shared/stores/route/route.action';
import { invokeGetAllStationApi } from '../../shared/stores/station/station.action';
import { invokeGetAllRouteMapApi } from '../../shared/stores/route-map/route-map.action';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  constructor(private store: Store) {}

  ngOnInit(): void {
    this.store.dispatch(invokeGetAllStationApi());
    this.store.dispatch(invokeGetAllRouteApi());
    this.store.dispatch(invokeGetAllRouteMapApi());
  }
}
