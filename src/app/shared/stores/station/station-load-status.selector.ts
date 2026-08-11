import { createFeatureSelector, createSelector } from '@ngrx/store';
import {
  STATION_LOAD_STATUS_FEATURE_KEY,
  StationLoadStatusState,
} from './station-load-status.reducer';

const selectStationLoadStatus = createFeatureSelector<StationLoadStatusState>(
  STATION_LOAD_STATUS_FEATURE_KEY
);

/**
 * OBRS-1222. `?? false` is not defensive noise: `createFeatureSelector` returns
 * `undefined` when the slice is not registered, and a TestBed that provides a
 * mock store with only the slices its own component names is the normal case in
 * this repo. Reading `undefined.hasFailed` there would throw inside change
 * detection and fail specs that have nothing to do with this card.
 */
export const selectStationLoadFailed = createSelector(
  selectStationLoadStatus,
  (state) => state?.hasFailed ?? false
);
