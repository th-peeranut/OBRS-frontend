import { createFeatureSelector, createSelector } from '@ngrx/store';
import { MyParcelsState } from './my-parcels.model';

export const MY_PARCELS_FEATURE_KEY = 'myParcels';

export const selectMyParcels = createFeatureSelector<MyParcelsState>(MY_PARCELS_FEATURE_KEY);

export const selectMyParcelsItems = createSelector(selectMyParcels, (state) => state.items);
export const selectMyParcelsLoading = createSelector(selectMyParcels, (state) => state.loading);
export const selectMyParcelsLoaded = createSelector(selectMyParcels, (state) => state.loaded);
export const selectMyParcelsError = createSelector(selectMyParcels, (state) => state.error);
export const selectMyParcelsHasMore = createSelector(selectMyParcels, (state) => state.hasMore);
export const selectMyParcelsPage = createSelector(selectMyParcels, (state) => state.page);
export const selectMyParcelsStatusFilter = createSelector(
  selectMyParcels,
  (state) => state.statusFilter
);
