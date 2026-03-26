import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { of } from 'rxjs';
import { mergeMap, switchMap, withLatestFrom } from 'rxjs/operators';
import { Appstate } from '../appstate';
import {
  invokeGetBookingApi,
  invokeGetBookingApiSuccess,
  invokeSetBookingApi,
  invokeSetBookingApiSuccess,
} from './booking.action';
import { selectBooking } from './booking.selector';

@Injectable()
export class BookingEffect {
  private actions$ = inject(Actions);
  private store = inject(Store<Appstate>);

  getBooking$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetBookingApi),
      withLatestFrom(this.store.pipe(select(selectBooking))),
      mergeMap(([, booking]) =>
        of(
          invokeGetBookingApiSuccess({
            booking: booking ?? null,
          })
        )
      )
    )
  );

  setBooking$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeSetBookingApi),
      switchMap((action) =>
        of(
          invokeSetBookingApiSuccess({
            booking: action.booking ?? null,
          })
        )
      )
    )
  );
}
