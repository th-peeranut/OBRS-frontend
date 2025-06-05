import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { EMPTY } from 'rxjs';
import { map, mergeMap, switchMap, withLatestFrom } from 'rxjs/operators';
import { setAPIStatus } from '../app.action';
import { Appstate } from '../appstate';
import {
  invokeGetAllRouteApi,
  invokeGetAllRouteApiSuccess,
  invokeCreateRouteApi,
  invokeCreateRouteApiSuccess,
  invokeUpdateRouteApi,
  invokeUpdateRouteApiSuccess,
  invokeDeleteRouteApi,
  invokeDeleteRouteApiSuccess,
} from './route.action';
import { selectRoute } from './route.selector';
import { RouteService } from '../../../services/routes/route.service';

@Injectable()
export class RouteEffect {
  private actions$ = inject(Actions);
  private store = inject(Store<Appstate>);
  private service = inject(RouteService);

  constructor() {
    // console.log('✅ Store in effect:', this.store); // should now log correctly
  }

  loadAllRoutes$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetAllRouteApi),
      withLatestFrom(this.store.pipe(select(selectRoute))),
      mergeMap(([, routeList]) => {
        if (routeList.length > 0) return EMPTY;

        return this.service.getAll().pipe(
          map((response) => {
            if (response?.code === 200) {
              return invokeGetAllRouteApiSuccess({ routes: response.data });
            } else {
              return invokeGetAllRouteApiSuccess({ routes: [] });
            }
          })
        );
      })
    )
  );

  saveNewRoute$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeCreateRouteApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: null,
              apiResponseMessage: 'creating new route',
            },
          })
        );
        return this.service.create(action.new_route).pipe(
          map((response) => {
            this.store.dispatch(
              setAPIStatus({
                apiStatus: {
                  apiStatus: response?.code,
                  apiResponseMessage:
                    response?.code === 200
                      ? 'route is created'
                      : 'fail to create new route',
                },
              })
            );

            if (response?.code === 200) {
              return invokeCreateRouteApiSuccess({
                response_new_route: response?.data,
              });
            } else {
              return invokeCreateRouteApiSuccess({
                response_new_route: null,
              });
            }
          })
        );
      })
    )
  );

  updateRoute$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeUpdateRouteApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: null,
              apiResponseMessage: 'updating route',
            },
          })
        );
        return this.service
          .update(action.update_id, action.update_route)
          .pipe(
            map((response) => {
              this.store.dispatch(
                setAPIStatus({
                  apiStatus: {
                    apiStatus: response?.code,
                    apiResponseMessage:
                      response?.code === 200
                        ? 'route is updated'
                        : 'fail to update route',
                  },
                })
              );

              if (response?.code === 200) {
                return invokeUpdateRouteApiSuccess({
                  response_update_route: response?.data,
                });
              } else {
                return invokeUpdateRouteApiSuccess({
                  response_update_route: null,
                });
              }
            })
          );
      })
    )
  );

  deleteRoute$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeDeleteRouteApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: null,
              apiResponseMessage: 'deleting route',
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
                      ? 'route is deleted'
                      : 'fail to delete route',
                },
              })
            );

            if (response?.code === 200) {
              return invokeDeleteRouteApiSuccess({
                response_delete_route: response,
              });
            } else {
              return invokeDeleteRouteApiSuccess({
                response_delete_route: null,
              });
            }
          })
        );
      })
    )
  );
}
