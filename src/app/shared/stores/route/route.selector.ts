import { createFeatureSelector, createSelector } from '@ngrx/store';
import { Route } from '../../interfaces/route.interface';

export const selectRoute = createFeatureSelector<Route[]>('routeList');

export const selectById = (id: number) =>
  createSelector(selectRoute, (list: Route[]) => {
    var filterId = list.filter((_) => _.id == id);
    if (filterId.length == 0) {
      return null;
    }
    return filterId[0];
  });
