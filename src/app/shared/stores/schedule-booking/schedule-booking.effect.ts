import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { of } from 'rxjs';
import { mergeMap, switchMap, withLatestFrom } from 'rxjs/operators';
import { Appstate } from '../appstate';
import {
  invokeGetScheduleBookingApi,
  invokeGetScheduleBookingApiSuccess,
  invokeSetScheduleBookingApi,
  invokeSetScheduleBookingApiSuccess,
} from './schedule-booking.action';
import { selectScheduleBooking } from './schedule-booking.selector';

@Injectable()
export class ScheduleBookingEffect {
  private actions$ = inject(Actions);
  private store = inject(Store<Appstate>);

  constructor() {
    // console.log('✅ Store in effect:', this.store); // should now log correctly
  }

  getScheduleBookings$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetScheduleBookingApi),
      withLatestFrom(this.store.pipe(select(selectScheduleBooking))),
      mergeMap(([, scheduleBooking]) => {
        if (scheduleBooking) {
          return of(
            invokeGetScheduleBookingApiSuccess({
              schedule_booking: scheduleBooking,
            })
          );
        } else {
          return of(
            invokeGetScheduleBookingApiSuccess({
              schedule_booking: null,
            })
          );
        }
      })
    )
  );

  setScheduleBooking$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeSetScheduleBookingApi),
      switchMap((action) => {
        if (action.schedule_booking) {
          return of(
            invokeSetScheduleBookingApiSuccess({
              schedule_booking: action.schedule_booking,
            })
          );
        } else {
          return of(
            invokeSetScheduleBookingApiSuccess({
              schedule_booking: null,
            })
          );
        }
      })
    )
  );
}
