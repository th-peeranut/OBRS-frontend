import { createAction, props } from '@ngrx/store';
import { BookingState } from '../../interfaces/booking.interface';

// GET
export const invokeGetBookingApi = createAction(
  '[Booking API] Invoke get Booking'
);

export const invokeGetBookingApiSuccess = createAction(
  '[Booking API] Get Booking Success',
  props<{ booking: BookingState | null }>()
);

// SET
export const invokeSetBookingApi = createAction(
  '[Booking API] Invoke set Booking',
  props<{ booking: BookingState }>()
);

export const invokeSetBookingApiSuccess = createAction(
  '[Booking API] Set Booking Success',
  props<{ booking: BookingState | null }>()
);
