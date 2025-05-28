import { createFeatureSelector, createSelector } from '@ngrx/store';
import { RouteMap } from '../../interfaces/route-map.interface';

export const selectRouteMap = createFeatureSelector<RouteMap[]>('routeMapList');

export const selectById = (id: number) =>
  createSelector(selectRouteMap, (list: RouteMap[]) => {
    var filterId = list.filter((_) => _.id == id);
    if (filterId.length == 0) {
      return null;
    }
    return filterId[0];
  });
