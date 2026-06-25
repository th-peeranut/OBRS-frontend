import { createAction, props } from '@ngrx/store';
import {
  CancelBookingResult,
  MyBookingDto,
  MyBookingView,
} from '../../../shared/interfaces/my-booking.interface';

// --- Load my bookings ---
export const invokeLoadMyBookingsApi = createAction(
  '[MyBookings API] Invoke to load my bookings',
  props<{ status?: string | null; showLoading?: boolean }>()
);

export const invokeLoadMyBookingsApiSuccess = createAction(
  '[MyBookings API] Load my bookings success',
  props<{ bookings: MyBookingDto[] }>()
);

export const invokeLoadMyBookingsApiFailure = createAction(
  '[MyBookings API] Load my bookings failure',
  props<{ error: string }>()
);

// --- Cancel a booking ---
// The effect previews the cancel policy, confirms with the traveler, then cancels.
export const requestCancelBooking = createAction(
  '[MyBookings API] Request cancel booking',
  props<{ booking: MyBookingView }>()
);

export const cancelBookingSuccess = createAction(
  '[MyBookings API] Cancel booking success',
  props<{ result: CancelBookingResult }>()
);

export const cancelBookingFailure = createAction(
  '[MyBookings API] Cancel booking failure',
  props<{ error: string }>()
);

/** Traveler dismissed the confirmation dialog — clears the in-flight state. */
export const cancelBookingDismissed = createAction(
  '[MyBookings API] Cancel booking dismissed'
);
