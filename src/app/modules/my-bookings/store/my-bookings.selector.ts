import { createFeatureSelector, createSelector } from '@ngrx/store';
import { MyBookingsState } from './my-bookings.model';

export const MY_BOOKINGS_FEATURE_KEY = 'myBookings';

export const selectMyBookings =
  createFeatureSelector<MyBookingsState>(MY_BOOKINGS_FEATURE_KEY);

export const selectMyBookingsList = createSelector(
  selectMyBookings,
  (state) => state.bookings
);

export const selectMyBookingsLoading = createSelector(
  selectMyBookings,
  (state) => state.loading
);

export const selectMyBookingsCancellingId = createSelector(
  selectMyBookings,
  (state) => state.cancellingBookingId
);
