import { createReducer, on } from '@ngrx/store';
import { Route } from '../../interfaces/route.interface';
import {
  invokeGetAllRouteApiSuccess,
  invokeCreateRouteApiSuccess,
  invokeUpdateRouteApiSuccess,
  invokeDeleteRouteApiSuccess,
} from './route.action';

export const initialState: ReadonlyArray<Route> = [];

export const RouteReducer = createReducer(
  initialState,
  // GET ALL
  on(invokeGetAllRouteApiSuccess, (state, { routes }) => {
    return routes;
  }),
  // CREATE
  on(invokeCreateRouteApiSuccess, (state, { response_new_route }) => {
    return response_new_route ? [...state, response_new_route] : state;
  }),
  // UPDATE
  on(invokeUpdateRouteApiSuccess, (state, { response_update_route }) => {
    if (response_update_route === null) return state;

    return state.map((route) =>
      route.id === response_update_route.id
        ? response_update_route
        : route
    );
  }),
  // DELETE
  on(invokeDeleteRouteApiSuccess, (state, { response_delete_route }) => {
    if (response_delete_route === null) return state;

    return state.filter(
      (route) => route.id !== response_delete_route.data.id
    );
  })
);
