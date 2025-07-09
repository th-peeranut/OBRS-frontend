import { createFeatureSelector, createSelector } from '@ngrx/store';
import { Province, ProvinceStation } from '../../interfaces/province.interface';

export const selectProvince = createFeatureSelector<Province[]>('provinceList');
export const selectProvinceWithStation = createFeatureSelector<ProvinceStation[]>('provinceWithStationList');

export const selectById = (id: number) =>
  createSelector(selectProvince, (list: Province[]) => {
    var filterId = list.filter((_) => _.id == id);
    if (filterId.length == 0) {
      return null;
    }
    return filterId[0];
  });



export const selectProvinceStationById = (id: number) =>
  createSelector(selectProvinceWithStation, (list: ProvinceStation[]) => {
    var filterId = list.filter((_) => _.id == id);
    if (filterId.length == 0) {
      return null;
    }
    return filterId[0];
  });
