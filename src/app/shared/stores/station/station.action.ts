import { createAction, props } from '@ngrx/store';
import { Station } from '../../interfaces/station.interface';
import { ResponseAPI } from '../../interfaces/response.interface';

// START GET ALL
export const invokeGetAllStationApi = createAction('[Station API] Invoke Station Fetch API');

export const invokeGetAllStationApiSuccess = createAction(
  '[Station API] Fetch API Success',
  props<{ stations: Station[] }>()
);
// END GET ALL

// START INSERT
export const invokeCreateStationApi = createAction(
  '[Station API] Inovke save new station api',
  props<{ new_station: Station }>()
);

export const invokeCreateStationApiSuccess = createAction(
  '[Station API] save new station api success',
  props<{ response_new_station: Station | null }>()
);
// END INSERT

// START UPDATE
export const invokeUpdateStationApi = createAction(
  '[Station API] Inovke update station api',
  props<{ update_id: number; update_station: Station }>()
);

export const invokeUpdateStationApiSuccess = createAction(
  '[Station API] update station api success',
  props<{ response_update_station: Station | null }>()
);
// END UPDATE

// START DELETE
export const invokeDeleteStationApi = createAction(
  '[Station API] Inovke delete station api',
  props<{ delete_id: number }>()
);

export const invokeDeleteStationApiSuccess = createAction(
  '[Station API] deleted station api success',
  props<{ response_delete_station: ResponseAPI<any> | null }>()
);
// END DELETE
