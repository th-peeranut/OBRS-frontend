import { createAction, props } from '@ngrx/store';
import { ResponseAPI } from '../../interfaces/response.interface';
import { RouteMap } from '../../interfaces/route-map.interface';

// START GET ALL
export const invokeGetAllRouteMapApi = createAction('[RouteMap API] Invoke RouteMap Fetch API');

export const invokeGetAllRouteMapApiSuccess = createAction(
  '[RouteMap API] Fetch API Success',
  props<{ route_map: RouteMap[] }>()
);
// END GET ALL

// START INSERT
export const invokeCreateRouteMapApi = createAction(
  '[RouteMap API] Invoke save new routeMap api',
  props<{ new_route_map: RouteMap }>()
);

export const invokeCreateRouteMapApiSuccess = createAction(
  '[RouteMap API] save new routeMap api success',
  props<{ response_new_route_map: RouteMap | null }>()
);
// END INSERT

// START UPDATE
export const invokeUpdateRouteMapApi = createAction(
  '[RouteMap API] Invoke update routeMap api',
  props<{ update_id: number; update_route_map: RouteMap }>()
);

export const invokeUpdateRouteMapApiSuccess = createAction(
  '[RouteMap API] update routeMap api success',
  props<{ response_update_route_map: RouteMap | null }>()
);
// END UPDATE

// START DELETE
export const invokeDeleteRouteMapApi = createAction(
  '[RouteMap API] Invoke delete routeMap api',
  props<{ delete_id: number }>()
);

export const invokeDeleteRouteMapApiSuccess = createAction(
  '[RouteMap API] deleted routeMap api success',
  props<{ response_delete_route_map: ResponseAPI<any> | null }>()
);
// END DELETE
