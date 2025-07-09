import { createReducer, on } from '@ngrx/store';
import { Province } from '../../interfaces/province.interface';
import {
  invokeGetAllProvinceApiSuccess,
  invokeCreateProvinceApiSuccess,
  invokeUpdateProvinceApiSuccess,
  invokeDeleteProvinceApiSuccess,
  invokeGetAllProvinceWithStationApiSuccess,
} from './province.action';

export const initialState: ReadonlyArray<Province> = [];

export const ProvinceReducer = createReducer(
  initialState,
  // GET ALL
  on(invokeGetAllProvinceApiSuccess, (state, { provinces }) => {
    return provinces;
  }),
  // CREATE
  on(invokeCreateProvinceApiSuccess, (state, { response_new_province }) => {
    return response_new_province ? [...state, response_new_province] : state;
  }),
  // UPDATE
  on(invokeUpdateProvinceApiSuccess, (state, { response_update_province }) => {
    if (response_update_province === null) return state;

    return state.map((province) =>
      province.id === response_update_province.id
        ? response_update_province
        : province
    );
  }),
  // DELETE
  on(invokeDeleteProvinceApiSuccess, (state, { response_delete_province }) => {
    if (response_delete_province === null) return state;

    return state.filter(
      (province) => province.id !== response_delete_province.data.id
    );
  }),
  // GET ALL WITH STATION
  on(invokeGetAllProvinceWithStationApiSuccess, (state, { provinceWithStations }) => {
    return provinceWithStations;
  }),
);
