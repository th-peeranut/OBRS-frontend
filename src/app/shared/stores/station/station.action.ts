import { createAction, props } from '@ngrx/store';
import { StationApi } from '../../interfaces/station.interface';

export const invokeGetAllProvinceWithStationApi = createAction(
  '[Province With Station API] Invoke Province With Station Fetch API'
);

export const invokeGetAllProvinceWithStationApiSuccess = createAction(
  '[Province With Station API] Fetch API Success',
  props<{ stations: StationApi[] }>()
);
