import { createAction, props } from '@ngrx/store';
import { PassengerInfoState } from '../../interfaces/passenger-info.interface';

// GET
export const invokeGetPassengerInfo = createAction(
  '[PassengerInfo API] Invoke get Passenger Info'
);

export const invokeGetPassengerInfoSuccess = createAction(
  '[PassengerInfo API] Get Passenger Info Success',
  props<{ passengerInfo: PassengerInfoState | null }>()
);

// SET
export const invokeSetPassengerInfo = createAction(
  '[PassengerInfo API] Invoke set Passenger Info',
  props<{ passengerInfo: PassengerInfoState }>()
);

export const invokeSetPassengerInfoSuccess = createAction(
  '[PassengerInfo API] Set Passenger Info Success',
  props<{ passengerInfo: PassengerInfoState | null }>()
);
