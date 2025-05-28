import { createAction, props } from '@ngrx/store';
import { Route } from '../../interfaces/route.interface';
import { ResponseAPI } from '../../interfaces/response.interface';

// START GET ALL
export const invokeGetAllRouteApi = createAction('[Route API] Invoke Route Fetch API');

export const invokeGetAllRouteApiSuccess = createAction(
  '[Route API] Fetch API Success',
  props<{ routes: Route[] }>()
);
// END GET ALL

// START INSERT
export const invokeCreateRouteApi = createAction(
  '[Route API] Invoke save new route api',
  props<{ new_route: Route }>()
);

export const invokeCreateRouteApiSuccess = createAction(
  '[Route API] save new route api success',
  props<{ response_new_route: Route | null }>()
);
// END INSERT

// START UPDATE
export const invokeUpdateRouteApi = createAction(
  '[Route API] Invoke update route api',
  props<{ update_id: number; update_route: Route }>()
);

export const invokeUpdateRouteApiSuccess = createAction(
  '[Route API] update route api success',
  props<{ response_update_route: Route | null }>()
);
// END UPDATE

// START DELETE
export const invokeDeleteRouteApi = createAction(
  '[Route API] Invoke delete route api',
  props<{ delete_id: number }>()
);

export const invokeDeleteRouteApiSuccess = createAction(
  '[Route API] deleted route api success',
  props<{ response_delete_route: ResponseAPI<any> | null }>()
);
// END DELETE
