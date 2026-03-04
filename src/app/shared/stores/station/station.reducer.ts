import { createReducer, on } from '@ngrx/store';
import { StationApi } from '../../interfaces/station.interface';
import {
  invokeGetAllProvinceWithStationApiSuccess,
} from './station.action';

export const initialState: ReadonlyArray<StationApi> = [];

export const ProvinceReducer = createReducer(
  initialState,
  on(invokeGetAllProvinceWithStationApiSuccess, (state, { stations }) => {
    return stations;
  })
);
