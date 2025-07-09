import { createAction, props } from '@ngrx/store';
import { ResponseAPI } from '../../interfaces/response.interface';
import { Province, ProvinceStation } from '../../interfaces/province.interface';

// START GET ALL
export const invokeGetAllProvinceApi = createAction('[Province API] Invoke Province Fetch API');

export const invokeGetAllProvinceApiSuccess = createAction(
  '[Province API] Fetch API Success',
  props<{ provinces: Province[] }>()
);
// END GET ALL

// START INSERT
export const invokeCreateProvinceApi = createAction(
  '[Province API] Invoke save new province api',
  props<{ new_province: Province }>()
);

export const invokeCreateProvinceApiSuccess = createAction(
  '[Province API] save new province api success',
  props<{ response_new_province: Province | null }>()
);
// END INSERT

// START UPDATE
export const invokeUpdateProvinceApi = createAction(
  '[Province API] Invoke update province api',
  props<{ update_id: number; update_province: Province }>()
);

export const invokeUpdateProvinceApiSuccess = createAction(
  '[Province API] update province api success',
  props<{ response_update_province: Province | null }>()
);
// END UPDATE

// START DELETE
export const invokeDeleteProvinceApi = createAction(
  '[Province API] Invoke delete province api',
  props<{ delete_id: number }>()
);

export const invokeDeleteProvinceApiSuccess = createAction(
  '[Province API] deleted province api success',
  props<{ response_delete_province: ResponseAPI<any> | null }>()
);
// END DELETE

// START GET ALL WITH STATION
export const invokeGetAllProvinceWithStationApi = createAction('[Province With Station API] Invoke Province With Station Fetch API');

export const invokeGetAllProvinceWithStationApiSuccess = createAction(
  '[Province With Station API] Fetch API Success',
  props<{ provinceWithStations: ProvinceStation[] }>()
);
// END GET ALL WITH STATION