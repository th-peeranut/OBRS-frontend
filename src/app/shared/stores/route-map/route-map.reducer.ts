import { createReducer, on } from '@ngrx/store';
import {
  invokeGetAllRouteMapApiSuccess,
  invokeCreateRouteMapApiSuccess,
  invokeUpdateRouteMapApiSuccess,
  invokeDeleteRouteMapApiSuccess,
} from './route-map.action';
import { RouteMap } from '../../interfaces/route-map.interface';

export const initialState: ReadonlyArray<RouteMap> = [];

export const RouteMapReducer = createReducer(
  initialState,
  // GET ALL
  on(invokeGetAllRouteMapApiSuccess, (state, { route_map }) => {
    return route_map;
  }),
  // CREATE
  on(invokeCreateRouteMapApiSuccess, (state, { response_new_route_map }) => {
    return response_new_route_map ? [...state, response_new_route_map] : state;
  }),
  // UPDATE
  on(invokeUpdateRouteMapApiSuccess, (state, { response_update_route_map }) => {
    if (response_update_route_map === null) return state;

    return state.map((routeMap) =>
      routeMap.id === response_update_route_map.id
        ? response_update_route_map
        : routeMap
    );
  }),
  // DELETE
  on(invokeDeleteRouteMapApiSuccess, (state, { response_delete_route_map }) => {
    if (response_delete_route_map === null) return state;

    return state.filter(
      (routeMap) => routeMap.id !== response_delete_route_map.data.id
    );
  })
);
