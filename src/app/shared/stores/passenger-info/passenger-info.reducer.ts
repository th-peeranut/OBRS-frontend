import { createReducer, on } from '@ngrx/store';
import { PassengerInfoState } from '../../interfaces/passenger-info.interface';
import {
  invokeGetPassengerInfoSuccess,
  invokeSetPassengerInfoSuccess,
} from './passenger-info.action';

export const initialState: PassengerInfoState | null = null;

export const PassengerInfoReducer = createReducer<PassengerInfoState | null>(
  initialState,
  on(invokeGetPassengerInfoSuccess, (state, { passengerInfo }) => passengerInfo),
  on(invokeSetPassengerInfoSuccess, (state, { passengerInfo }) => passengerInfo)
);
