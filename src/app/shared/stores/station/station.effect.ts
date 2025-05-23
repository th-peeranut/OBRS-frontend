import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { EMPTY } from 'rxjs';
import { map, mergeMap, switchMap, withLatestFrom } from 'rxjs/operators';
import { StationService } from '../../../services/station/station.service';
import { setAPIStatus } from '../app.action';
import { Appstate } from '../appstate';
import {
  invokeGetAllStationApi,
  invokeGetAllStationApiSuccess,
  invokeCreateStationApi,
  invokeCreateStationApiSuccess,
  invokeUpdateStationApi,
  invokeUpdateStationApiSuccess,
  invokeDeleteStationApi,
  invokeDeleteStationApiSuccess,
} from './station.action';
import { selectStation } from './station.selector';

@Injectable()
export class StationsEffect {
  private actions$ = inject(Actions);
  private store = inject(Store<Appstate>);
  private service = inject(StationService);

  constructor() {
    console.log('✅ Store in effect:', this.store); // should now log correctly
  }

  loadAllStations$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetAllStationApi),
      withLatestFrom(this.store.pipe(select(selectStation))),
      mergeMap(([, stationList]) => {
        if (stationList.length > 0) return EMPTY;

        return this.service.getAll().pipe(
          map((response) => {
            if (response?.code === 200) {
              return invokeGetAllStationApiSuccess({ stations: response.data });
            } else {
              return invokeGetAllStationApiSuccess({ stations: [] });
            }
          })
        );
      })
    )
  );

  saveNewStation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeCreateStationApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: 'creating...',
              apiResponseMessage: 'creating new station',
            },
          })
        );
        return this.service.create(action.new_station).pipe(
          map((response) => {
            this.store.dispatch(
              setAPIStatus({
                apiStatus: {
                  apiStatus: response?.code === 200 ? 'success' : 'fail',
                  apiResponseMessage:
                    response?.code === 200
                      ? 'station is created'
                      : 'fail to create new station',
                },
              })
            );

            if (response?.code === 200) {
              return invokeCreateStationApiSuccess({
                response_new_station: response?.data,
              });
            } else {
              return invokeCreateStationApiSuccess({
                response_new_station: null,
              });
            }
          })
        );
      })
    )
  );

  updateStation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeUpdateStationApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: 'updating...',
              apiResponseMessage: 'updating station',
            },
          })
        );
        return this.service
          .update(action.update_id, action.update_station)
          .pipe(
            map((response) => {
              this.store.dispatch(
                setAPIStatus({
                  apiStatus: {
                    apiStatus: response?.code === 200 ? 'success' : 'fail',
                    apiResponseMessage:
                      response?.code === 200
                        ? 'station is updated'
                        : 'fail to update station',
                  },
                })
              );

              if (response?.code === 200) {
                return invokeUpdateStationApiSuccess({
                  response_update_station: response?.data,
                });
              } else {
                return invokeUpdateStationApiSuccess({
                  response_update_station: null,
                });
              }
            })
          );
      })
    )
  );

  deleteStation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeDeleteStationApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: 'deleting...',
              apiResponseMessage: 'deleting station',
            },
          })
        );
        return this.service.delete(action.delete_id).pipe(
          map((response) => {
            this.store.dispatch(
              setAPIStatus({
                apiStatus: {
                  apiStatus: response?.code === 200 ? 'success' : 'fail',
                  apiResponseMessage:
                    response?.code === 200
                      ? 'station is deleted'
                      : 'fail to delete station',
                },
              })
            );

            if (response?.code === 200) {
              return invokeDeleteStationApiSuccess({
                response_delete_station: response,
              });
            } else {
              return invokeDeleteStationApiSuccess({
                response_delete_station: null,
              });
            }
          })
        );
      })
    )
  );
}
