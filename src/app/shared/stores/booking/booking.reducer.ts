import { createReducer, on } from '@ngrx/store';
import { BookingState } from '../../interfaces/booking.interface';
import {
  invokeGetBookingApiSuccess,
  invokeSetBookingApiSuccess,
} from './booking.action';

export const initialState: BookingState | null = null;

export const BookingReducer = createReducer<BookingState | null>(
  initialState,
  on(invokeGetBookingApiSuccess, (state, { booking }) => booking),
  on(invokeSetBookingApiSuccess, (state, { booking }) => booking)
);
