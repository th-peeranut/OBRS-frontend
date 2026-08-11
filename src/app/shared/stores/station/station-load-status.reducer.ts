import { createReducer, on } from '@ngrx/store';
import {
  invokeGetAllProvinceWithStationApi,
  invokeGetAllProvinceWithStationApiFailure,
  invokeGetAllProvinceWithStationApiSuccess,
} from './station.action';

/**
 * OBRS-1222 — whether the last attempt to load the station roster failed.
 *
 * A SEPARATE feature slice rather than a new field on `ProvinceReducer`, whose
 * state is the bare `StationApi[]`: 10 files read that array through
 * `selectProvinceWithStation`, and reshaping it into `{ stations, hasFailed }`
 * would rewrite every one of them to carry a flag exactly two of them use.
 *
 * Registered at the ROOT (`app.module.ts`), not per feature module. The same
 * reason `AnalyticsEffect` is: `ProvinceEffect` is registered via
 * `forFeature` in six lazy modules and can fail under any of them, while the
 * surface that renders the failure lives under two — a `forFeature`
 * registration would silently drop the action wherever the reducer happened
 * not to be loaded, which is indistinguishable from "the load succeeded".
 */
export const STATION_LOAD_STATUS_FEATURE_KEY = 'stationLoadStatus';

export interface StationLoadStatusState {
  readonly hasFailed: boolean;
}

export const stationLoadStatusInitialState: StationLoadStatusState = {
  hasFailed: false,
};

export const StationLoadStatusReducer = createReducer(
  stationLoadStatusInitialState,
  // Clearing on INVOKE (not only on success) is what makes the retry button
  // honest: the error surface disappears the moment the retry is in flight,
  // so a customer who taps it is never left staring at the message that made
  // them tap. It also covers the free retry a route change already performs —
  // every lazy booking module dispatches this action on init, and
  // `ProvinceEffect`'s session guard is still false after a failure.
  on(invokeGetAllProvinceWithStationApi, () => stationLoadStatusInitialState),
  on(invokeGetAllProvinceWithStationApiSuccess, () => stationLoadStatusInitialState),
  on(invokeGetAllProvinceWithStationApiFailure, () => ({ hasFailed: true }))
);
