import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { EMPTY } from 'rxjs';
import { map, mergeMap, switchMap, withLatestFrom } from 'rxjs/operators';
import { setAPIStatus } from '../app.action';
import { Appstate } from '../appstate';
import {
  invokeGetAllRouteMapApi,
  invokeGetAllRouteMapApiSuccess,
  invokeCreateRouteMapApi,
  invokeCreateRouteMapApiSuccess,
  invokeUpdateRouteMapApi,
  invokeUpdateRouteMapApiSuccess,
  invokeDeleteRouteMapApi,
  invokeDeleteRouteMapApiSuccess,
} from './route-map.action';
import { selectRouteMap } from './route-map.selector';
import { RouteMapService } from '../../../services/route-map/route-map.service';

@Injectable()
export class RouteMapEffect {
  private actions$ = inject(Actions);
  private store = inject(Store<Appstate>);
  private service = inject(RouteMapService);

  constructor() {
    // console.log('✅ Store in effect:', this.store); // should now log correctly
  }

  loadAllRouteMaps$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetAllRouteMapApi),
      withLatestFrom(this.store.pipe(select(selectRouteMap))),
      mergeMap(([, routeMapList]) => {
        if (routeMapList.length > 0) return EMPTY;

        return this.service.getAll().pipe(
          map((response) => {
            if (response?.code === 200) {
              return invokeGetAllRouteMapApiSuccess({ route_map: response.data });
            } else {
              return invokeGetAllRouteMapApiSuccess({ route_map: [] });
            }
          })
        );
      })
    )
  );

  saveNewRouteMap$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeCreateRouteMapApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: null,
              apiResponseMessage: 'creating new routeMap',
            },
          })
        );
        return this.service.create(action.new_route_map).pipe(
          map((response) => {
            this.store.dispatch(
              setAPIStatus({
                apiStatus: {
                  apiStatus: response?.code,
                  apiResponseMessage:
                    response?.code === 200
                      ? 'routeMap is created'
                      : 'fail to create new routeMap',
                },
              })
            );

            if (response?.code === 200) {
              return invokeCreateRouteMapApiSuccess({
                response_new_route_map: response?.data,
              });
            } else {
              return invokeCreateRouteMapApiSuccess({
                response_new_route_map: null,
              });
            }
          })
        );
      })
    )
  );

  updateRouteMap$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeUpdateRouteMapApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: null,
              apiResponseMessage: 'updating routeMap',
            },
          })
        );
        return this.service
          .update(action.update_id, action.update_route_map)
          .pipe(
            map((response) => {
              this.store.dispatch(
                setAPIStatus({
                  apiStatus: {
                    apiStatus: response?.code,
                    apiResponseMessage:
                      response?.code === 200
                        ? 'routeMap is updated'
                        : 'fail to update routeMap',
                  },
                })
              );

              if (response?.code === 200) {
                return invokeUpdateRouteMapApiSuccess({
                  response_update_route_map: response?.data,
                });
              } else {
                return invokeUpdateRouteMapApiSuccess({
                  response_update_route_map: null,
                });
              }
            })
          );
      })
    )
  );

  deleteRouteMap$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeDeleteRouteMapApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: null,
              apiResponseMessage: 'deleting routeMap',
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
                      ? 'routeMap is deleted'
                      : 'fail to delete routeMap',
                },
              })
            );

            if (response?.code === 200) {
              return invokeDeleteRouteMapApiSuccess({
                response_delete_route_map: response,
              });
            } else {
              return invokeDeleteRouteMapApiSuccess({
                response_delete_route_map: null,
              });
            }
          })
        );
      })
    )
  );
}
