import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { EMPTY, of } from 'rxjs';
import { map, mergeMap, switchMap, withLatestFrom } from 'rxjs/operators';
import { Appstate } from '../appstate';
import {
  invokeGetScheduleListApi,
  invokeGetScheduleListApiSuccess,
  invokeSetScheduleListApi,
  invokeSetScheduleListApiSuccess,
} from './schedule-list.action';
import { selectScheduleList } from './schedule-list.selector';
import { ScheduleService } from '../../../services/schedule/schedule.service';
import { setAPIStatus } from '../app.action';

@Injectable()
export class ScheduleListEffect {
  private actions$ = inject(Actions);
  private store = inject(Store<Appstate>);
  private service = inject(ScheduleService);

  constructor() {
    // console.log('✅ Store in effect:', this.store); // should now log correctly
  }

  getScheduleLists$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetScheduleListApi),
      switchMap((action) => {
        this.store.dispatch(
          setAPIStatus({
            apiStatus: {
              apiStatus: null,
              apiResponseMessage: 'searching schedule list',
            },
          })
        );
        return this.service.getByFilter(action.schedule_filter).pipe(
          map((response) => {
            this.store.dispatch(
              setAPIStatus({
                apiStatus: {
                  apiStatus: response?.code,
                  apiResponseMessage:
                    response?.code === 200 ? '' : response?.message || '',
                },
              })
            );

            return invokeGetScheduleListApiSuccess({
              schedule_list: response?.code === 200 ? response?.data : null,
            });
          })
        );
      })
    )
  );
  
  setScheduleList$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeSetScheduleListApi),
      switchMap((action) => {
        if (action.schedule_list) {
          return of(
            invokeSetScheduleListApiSuccess({
              schedule_list: action.schedule_list,
            })
          );
        } else {
          return of(
            invokeSetScheduleListApiSuccess({
              schedule_list: null,
            })
          );
        }
      })
    )
  );
}
