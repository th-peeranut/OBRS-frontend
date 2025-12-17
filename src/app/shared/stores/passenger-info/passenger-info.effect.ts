import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, select } from '@ngrx/store';
import { of } from 'rxjs';
import { switchMap, withLatestFrom } from 'rxjs/operators';
import { Appstate } from '../appstate';
import {
  invokeGetPassengerInfo,
  invokeGetPassengerInfoSuccess,
  invokeSetPassengerInfo,
  invokeSetPassengerInfoSuccess,
} from './passenger-info.action';
import { selectPassengerInfo } from './passenger-info.selector';

@Injectable()
export class PassengerInfoEffect {
  private actions$ = inject(Actions);
  private store = inject(Store<Appstate>);

  getPassengerInfo$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeGetPassengerInfo),
      withLatestFrom(this.store.pipe(select(selectPassengerInfo))),
      switchMap(([, passengerInfo]) =>
        of(
          invokeGetPassengerInfoSuccess({
            passengerInfo: passengerInfo ?? null,
          })
        )
      )
    )
  );

  setPassengerInfo$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeSetPassengerInfo),
      switchMap((action) =>
        of(
          invokeSetPassengerInfoSuccess({
            passengerInfo: action.passengerInfo ?? null,
          })
        )
      )
    )
  );
}
