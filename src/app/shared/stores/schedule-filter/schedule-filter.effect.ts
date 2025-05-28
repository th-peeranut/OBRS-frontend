import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { of } from 'rxjs';
import { mergeMap, switchMap, withLatestFrom } from 'rxjs/operators';
import { setAPIStatus } from '../app.action';
import { Appstate } from '../appstate';
import {
  invokeGetScheduleFilterApi,
  invokeGetScheduleFilterApiSuccess,
  invokeSetScheduleFilterApi,
  invokeSetScheduleFilterApiSuccess,
} from './schedule-filter.action';
import { selectScheduleFilter } from './schedule-filter.selector';

@Injectable()
export class ScheduleFiltersEffect {
  private actions$ = inject(Actions);
  private store = inject(Store<Appstate>);

  constructor() {
    // console.log('✅ Store in effect:', this.store); // should now log correctly
  }

  getScheduleFilters$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetScheduleFilterApi),
      withLatestFrom(this.store.pipe(select(selectScheduleFilter))),
      mergeMap(([, scheduleFilter]) => {
        if (scheduleFilter) {
          return of(
            invokeGetScheduleFilterApiSuccess({
              schedule_filter: scheduleFilter,
            })
          );
        } else {
          return of(
            invokeGetScheduleFilterApiSuccess({
              schedule_filter: null,
            })
          );
        }
      })
    )
  );

  setScheduleFilter$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeSetScheduleFilterApi),
      switchMap((action) => {
        if (action.schedule_filter) {
          return of(
            invokeSetScheduleFilterApiSuccess({
              schedule_filter: action.schedule_filter,
            })
          );
        } else {
          return of(
            invokeSetScheduleFilterApiSuccess({
              schedule_filter: null,
            })
          );
        }
      })
    )
  );
}
