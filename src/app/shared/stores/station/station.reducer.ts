import { createReducer, on } from '@ngrx/store';
import { Station } from '../../interfaces/station.interface';
import {
  invokeGetAllStationApiSuccess,
  invokeCreateStationApiSuccess,
  invokeUpdateStationApiSuccess,
  invokeDeleteStationApiSuccess,
} from './station.action';

export const initialState: ReadonlyArray<Station> = [];

export const StationReducer = createReducer(
  initialState,
  // GET ALL
  on(invokeGetAllStationApiSuccess, (state, { stations }) => {
    return stations;
  }),
  // CREATE
  on(invokeCreateStationApiSuccess, (state, { response_new_station }) => {
    return response_new_station ? [...state, response_new_station] : state;
  }),
  // UPDATE
  on(invokeUpdateStationApiSuccess, (state, { response_update_station }) => {
    if (response_update_station === null) return state;

    return state.map((station) =>
      station.id === response_update_station.id
        ? response_update_station
        : station
    );
  }),
  // DELETE
  on(invokeDeleteStationApiSuccess, (state, { response_delete_station }) => {
    if (response_delete_station === null) return state;

    return state.filter(
      (station) => station.id !== response_delete_station.data.id
    );
  })
);
