import { createReducer, on } from '@ngrx/store';
import { initialMyBookingsState } from './my-bookings.model';
import {
  cancelBookingDismissed,
  cancelBookingFailure,
  cancelBookingSuccess,
  invokeLoadMyBookingsApi,
  invokeLoadMyBookingsApiFailure,
  invokeLoadMyBookingsApiSuccess,
  requestCancelBooking,
} from './my-bookings.action';

export const myBookingsReducer = createReducer(
  initialMyBookingsState,
  on(invokeLoadMyBookingsApi, (state, { status }) => ({
    ...state,
    loading: true,
    error: null,
    statusFilter: status ?? null,
  })),
  on(invokeLoadMyBookingsApiSuccess, (state, { bookings }) => ({
    ...state,
    bookings,
    loading: false,
    loaded: true,
    error: null,
  })),
  on(invokeLoadMyBookingsApiFailure, (state, { error }) => ({
    ...state,
    loading: false,
    loaded: true,
    error,
  })),
  on(requestCancelBooking, (state, { booking }) => ({
    ...state,
    cancellingBookingId: booking.id,
  })),
  on(
    cancelBookingSuccess,
    cancelBookingFailure,
    cancelBookingDismissed,
    (state) => ({
      ...state,
      cancellingBookingId: null,
    })
  )
);
