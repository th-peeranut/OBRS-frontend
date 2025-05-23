import { createFeatureSelector, createSelector } from '@ngrx/store';
import { Station } from '../../interfaces/station.interface';

export const selectStation = createFeatureSelector<Station[]>('stationList');

export const selectById = (id: number) =>
  createSelector(selectStation, (list: Station[]) => {
    var filterId = list.filter((_) => _.id == id);
    if (filterId.length == 0) {
      return null;
    }
    return filterId[0];
  });
