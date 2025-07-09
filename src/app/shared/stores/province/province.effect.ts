import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { EMPTY } from 'rxjs';
import { map, mergeMap, switchMap, withLatestFrom } from 'rxjs/operators';
import { setAPIStatus } from '../app.action';
import { Appstate } from '../appstate';
import {
  invokeGetAllProvinceApi,
  invokeGetAllProvinceApiSuccess,
  invokeCreateProvinceApi,
  invokeCreateProvinceApiSuccess,
  invokeUpdateProvinceApi,
  invokeUpdateProvinceApiSuccess,
  invokeDeleteProvinceApi,
  invokeDeleteProvinceApiSuccess,
  invokeGetAllProvinceWithStationApiSuccess,
  invokeGetAllProvinceWithStationApi,
} from './province.action';
import { selectProvince, selectProvinceWithStation } from './province.selector';
import { ProvinceService } from '../../../services/province/province.service';

@Injectable()
export class ProvinceEffect {
  private actions$ = inject(Actions);
  private store = inject(Store<Appstate>);
  private service = inject(ProvinceService);

  constructor() {
    // console.log('✅ Store in effect:', this.store); // should now log correctly
  }

  loadAllProvinces$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetAllProvinceApi),
      withLatestFrom(this.store.pipe(select(selectProvince))),
      mergeMap(([, provinceList]) => {
        if (provinceList.length > 0) return EMPTY;

        return this.service.getAll().pipe(
          map((response) => {
            if (response?.code === 200) {
              return invokeGetAllProvinceApiSuccess({ provinces: response.data });
            } else {
              return invokeGetAllProvinceApiSuccess({ provinces: [] });
            }
          })
        );
      })
    )
  );

  saveNewProvince$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeCreateProvinceApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: null,
              apiResponseMessage: 'creating new province',
            },
          })
        );
        return this.service.create(action.new_province).pipe(
          map((response) => {
            this.store.dispatch(
              setAPIStatus({
                apiStatus: {
                  apiStatus: response?.code,
                  apiResponseMessage:
                    response?.code === 200
                      ? 'province is created'
                      : 'fail to create new province',
                },
              })
            );

            if (response?.code === 200) {
              return invokeCreateProvinceApiSuccess({
                response_new_province: response?.data,
              });
            } else {
              return invokeCreateProvinceApiSuccess({
                response_new_province: null,
              });
            }
          })
        );
      })
    )
  );

  updateProvince$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeUpdateProvinceApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: null,
              apiResponseMessage: 'updating province',
            },
          })
        );
        return this.service
          .update(action.update_id, action.update_province)
          .pipe(
            map((response) => {
              this.store.dispatch(
                setAPIStatus({
                  apiStatus: {
                    apiStatus: response?.code,
                    apiResponseMessage:
                      response?.code === 200
                        ? 'province is updated'
                        : 'fail to update province',
                  },
                })
              );

              if (response?.code === 200) {
                return invokeUpdateProvinceApiSuccess({
                  response_update_province: response?.data,
                });
              } else {
                return invokeUpdateProvinceApiSuccess({
                  response_update_province: null,
                });
              }
            })
          );
      })
    )
  );

  deleteProvince$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeDeleteProvinceApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: null,
              apiResponseMessage: 'deleting province',
            },
          })
        );
        return this.service.delete(action.delete_id).pipe(
          map((response) => {
            this.store.dispatch(
              setAPIStatus({
                apiStatus: {
                  apiStatus: response?.code,
                  apiResponseMessage:
                    response?.code === 200
                      ? 'province is deleted'
                      : 'fail to delete province',
                },
              })
            );

            if (response?.code === 200) {
              return invokeDeleteProvinceApiSuccess({
                response_delete_province: response,
              });
            } else {
              return invokeDeleteProvinceApiSuccess({
                response_delete_province: null,
              });
            }
          })
        );
      })
    )
  );

    loadAllProvinceWithStations$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetAllProvinceWithStationApi),
      withLatestFrom(this.store.pipe(select(selectProvinceWithStation))),
      mergeMap(([, provinceWithStations]) => {
        if (provinceWithStations.length > 0) return EMPTY;

        return this.service.getWithStation().pipe(
          map((response) => {
            if (response?.code === 200) {
              return invokeGetAllProvinceWithStationApiSuccess({ provinceWithStations: response.data });
            } else {
              return invokeGetAllProvinceWithStationApiSuccess({ provinceWithStations: [] });
            }
          })
        );
      })
    )
  );
}
