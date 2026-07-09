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

// --- Change seat dialog (OBRS-110) ---

export const selectChangeSeatDialogBookingId = createSelector(
  selectMyBookings,
  (state) => state.changeSeatDialogBookingId
);

export const selectChangeSeatBooking = createSelector(
  selectMyBookings,
  (state) => state.bookings.find((b) => b.id === state.changeSeatDialogBookingId) ?? null
);

export const selectChangeSeatAvailability = createSelector(
  selectMyBookings,
  (state) => state.changeSeatAvailability
);

export const selectChangeSeatAvailabilityLoading = createSelector(
  selectMyBookings,
  (state) => state.changeSeatAvailabilityLoading
);

export const selectChangeSeatAvailabilityError = createSelector(
  selectMyBookings,
  (state) => state.changeSeatAvailabilityError
);

export const selectChangeSeatTickets = createSelector(
  selectMyBookings,
  (state) => state.changeSeatTickets
);

export const selectChangeSeatTicketsLoading = createSelector(
  selectMyBookings,
  (state) => state.changeSeatTicketsLoading
);

export const selectChangeSeatTicketsError = createSelector(
  selectMyBookings,
  (state) => state.changeSeatTicketsError
);

export const selectChangeSeatSubmitting = createSelector(
  selectMyBookings,
  (state) => state.changeSeatSubmitting
);

export const selectChangeSeatConfirmError = createSelector(
  selectMyBookings,
  (state) => state.changeSeatConfirmError
);

export const selectChangeSeatConfirmErrorCode = createSelector(
  selectMyBookings,
  (state) => state.changeSeatConfirmErrorCode
);

// --- Change stop dialog (OBRS-110 wave 2) ---

export const selectChangeStopDialogBookingId = createSelector(
  selectMyBookings,
  (state) => state.changeStopDialogBookingId
);

export const selectChangeStopBooking = createSelector(
  selectMyBookings,
  (state) => state.bookings.find((b) => b.id === state.changeStopDialogBookingId) ?? null
);

export const selectChangeStopRouteMeta = createSelector(
  selectMyBookings,
  (state) => state.changeStopRouteMeta
);

export const selectChangeStopPickupStops = createSelector(
  selectMyBookings,
  (state) => state.changeStopPickupStops
);

export const selectChangeStopDropoffStops = createSelector(
  selectMyBookings,
  (state) => state.changeStopDropoffStops
);

export const selectChangeStopRouteStopsLoading = createSelector(
  selectMyBookings,
  (state) => state.changeStopRouteStopsLoading
);

export const selectChangeStopRouteStopsError = createSelector(
  selectMyBookings,
  (state) => state.changeStopRouteStopsError
);

export const selectChangeStopTickets = createSelector(
  selectMyBookings,
  (state) => state.changeStopTickets
);

export const selectChangeStopTicketsLoading = createSelector(
  selectMyBookings,
  (state) => state.changeStopTicketsLoading
);

export const selectChangeStopTicketsError = createSelector(
  selectMyBookings,
  (state) => state.changeStopTicketsError
);

export const selectChangeStopEstimate = createSelector(
  selectMyBookings,
  (state) => state.changeStopEstimate
);

export const selectChangeStopEstimateLoading = createSelector(
  selectMyBookings,
  (state) => state.changeStopEstimateLoading
);

export const selectChangeStopEstimateError = createSelector(
  selectMyBookings,
  (state) => state.changeStopEstimateError
);

export const selectChangeStopSubmitting = createSelector(
  selectMyBookings,
  (state) => state.changeStopSubmitting
);

export const selectChangeStopConfirmError = createSelector(
  selectMyBookings,
  (state) => state.changeStopConfirmError
);

export const selectChangeStopConfirmErrorCode = createSelector(
  selectMyBookings,
  (state) => state.changeStopConfirmErrorCode
);

export const selectChangeStopPendingPayment = createSelector(
  selectMyBookings,
  (state) => state.changeStopPendingPayment
);
