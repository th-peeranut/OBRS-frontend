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

// --- Reschedule dialog (OBRS-83) ---

export const selectRescheduleDialogBookingId = createSelector(
  selectMyBookings,
  (state) => state.rescheduleDialogBookingId
);

export const selectRescheduleBooking = createSelector(
  selectMyBookings,
  (state) =>
    state.bookings.find((b) => b.id === state.rescheduleDialogBookingId) ?? null
);

export const selectStopsLookup = createSelector(
  selectMyBookings,
  (state) => state.stopsLookup
);

export const selectStopsLookupError = createSelector(
  selectMyBookings,
  (state) => state.stopsLookupError
);

export const selectRescheduleTickets = createSelector(
  selectMyBookings,
  (state) => state.rescheduleTickets
);

export const selectRescheduleTicketsLoading = createSelector(
  selectMyBookings,
  (state) => state.rescheduleTicketsLoading
);

export const selectRescheduleTicketsError = createSelector(
  selectMyBookings,
  (state) => state.rescheduleTicketsError
);

export const selectRescheduleOptions = createSelector(
  selectMyBookings,
  (state) => state.rescheduleOptions
);

export const selectRescheduleOptionsLoading = createSelector(
  selectMyBookings,
  (state) => state.rescheduleOptionsLoading
);

export const selectRescheduleOptionsError = createSelector(
  selectMyBookings,
  (state) => state.rescheduleOptionsError
);

export const selectRescheduleEstimate = createSelector(
  selectMyBookings,
  (state) => state.rescheduleEstimate
);

export const selectRescheduleEstimateLoading = createSelector(
  selectMyBookings,
  (state) => state.rescheduleEstimateLoading
);

export const selectRescheduleEstimateError = createSelector(
  selectMyBookings,
  (state) => state.rescheduleEstimateError
);

export const selectRescheduleSubmitting = createSelector(
  selectMyBookings,
  (state) => state.rescheduleSubmitting
);

export const selectRescheduleConfirmError = createSelector(
  selectMyBookings,
  (state) => state.rescheduleConfirmError
);

export const selectRescheduleConfirmErrorCode = createSelector(
  selectMyBookings,
  (state) => state.rescheduleConfirmErrorCode
);

export const selectReschedulePendingPayment = createSelector(
  selectMyBookings,
  (state) => state.reschedulePendingPayment
);
