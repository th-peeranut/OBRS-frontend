import { createFeatureSelector, createSelector } from '@ngrx/store';
import { StationApi } from '../../interfaces/station.interface';

export const selectProvinceWithStation = createFeatureSelector<StationApi[]>(
  'provinceWithStationList'
);

export const selectById = (id: number) =>
  createSelector(selectProvinceWithStation, (list: StationApi[]) => {
    var filterId = list.filter((_) => _.id == id);
    if (filterId.length == 0) {
      return null;
    }
    return filterId[0];
  });
