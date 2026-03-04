import { Component, OnInit } from '@angular/core';

import { Store } from '@ngrx/store';
import { invokeGetAllProvinceWithStationApi } from '../../shared/stores/station/station.action';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  constructor(private store: Store) {}

  ngOnInit(): void {
    this.store.dispatch(invokeGetAllProvinceWithStationApi());
  }
}


