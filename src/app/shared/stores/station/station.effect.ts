import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { EMPTY } from 'rxjs';
import { map, mergeMap, withLatestFrom } from 'rxjs/operators';
import { Appstate } from '../appstate';
import {
  invokeGetAllProvinceWithStationApi,
  invokeGetAllProvinceWithStationApiSuccess,
} from './station.action';
import { selectProvinceWithStation } from './station.selector';
import { StationService } from '../../../services/station/station.service';
import { StationApi } from '../../interfaces/station.interface';
import { ResponseAPI } from '../../interfaces/response.interface';

@Injectable()
export class ProvinceEffect {
  private actions$ = inject(Actions);
  private store = inject(Store<Appstate>);
  private service = inject(StationService);

  loadStations$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetAllProvinceWithStationApi),
      withLatestFrom(this.store.pipe(select(selectProvinceWithStation))),
      mergeMap(([, stationsInStore]) => {
        if (stationsInStore.length > 0) return EMPTY;

        return this.service.getAll().pipe(
          map((response) =>
            invokeGetAllProvinceWithStationApiSuccess({
              stations: this.extractStations(response),
            })
          )
        );
      })
    )
  );

  private extractStations(
    response: StationApi[] | ResponseAPI<StationApi[]> | null | undefined
  ): StationApi[] {
    if (Array.isArray(response)) return response;
    if (response && Array.isArray(response.data)) return response.data;
    return [];
  }
}
