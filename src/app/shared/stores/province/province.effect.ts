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
import { ProvinceStation, Stop } from '../../interfaces/province.interface';
import { Station } from '../../interfaces/station.interface';

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
              return invokeGetAllProvinceWithStationApiSuccess({
                provinceWithStations: this.mapStopsToProvinceStations(
                  response.data || []
                ),
              });
            } else {
              return invokeGetAllProvinceWithStationApiSuccess({
                provinceWithStations: [],
              });
            }
          })
        );
      })
    )
  );

  private mapStopsToProvinceStations(stops: Stop[]): ProvinceStation[] {
    if (!stops || stops.length === 0) return [];

    const groupedStations = new Map<string, Station[]>();

    for (const stop of stops) {
      const nameEnglish = this.getStopLabel(stop, 'en') || stop.code;
      const nameThai = this.getStopLabel(stop, 'th') || nameEnglish;
      const station: Station = {
        id: stop.id,
        code: stop.code,
        nameThai,
        nameEnglish,
        createdBy: stop.createdBy,
        createdDate: stop.createdDate,
        lastUpdatedBy: stop.lastUpdatedBy,
        lastUpdatedDate: stop.lastUpdatedDate,
        url: '',
      };

      const key = stop.stopType || 'stop';
      if (!groupedStations.has(key)) {
        groupedStations.set(key, []);
      }
      groupedStations.get(key)?.push(station);
    }

    const order = ['station', 'stop'];
    const keys = Array.from(groupedStations.keys()).sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    return keys.map((key, index) => ({
      id: index + 1,
      nameThai: this.getStopTypeLabel(key, 'th'),
      nameEnglish: this.getStopTypeLabel(key, 'en'),
      createdBy: 'system',
      createdDate: '',
      lastUpdatedBy: 'system',
      lastUpdatedDate: '',
      stations: groupedStations.get(key) || [],
    }));
  }

  private getStopLabel(stop: Stop, locale: string): string | undefined {
    const match = stop.translations?.find((item) => item.locale === locale);
    if (match?.label) return match.label;
    return stop.translations?.[0]?.label;
  }

  private getStopTypeLabel(type: string, locale: 'en' | 'th'): string {
    const normalized = (type || '').toLowerCase();
    if (normalized === 'station') {
      return locale === 'th' ? 'สถานี' : 'Stations';
    }
    if (normalized === 'stop') {
      return locale === 'th' ? 'จุดจอด' : 'Stops';
    }
    return locale === 'th' ? type : type;
  }
}
