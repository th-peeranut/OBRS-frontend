import { createReducer, on } from '@ngrx/store';
import { initialMyBookingsState } from './my-bookings.model';
import {
  cancelBookingDismissed,
  cancelBookingFailure,
  cancelBookingSuccess,
  closeChangeSeatDialog,
  closeRescheduleDialog,
  confirmChangeSeat,
  confirmChangeSeatFailure,
  confirmChangeSeatSuccess,
  confirmReschedule,
  confirmRescheduleFailure,
  confirmRescheduleSuccess,
  invokeLoadMyBookingsApi,
  invokeLoadMyBookingsApiFailure,
  invokeLoadMyBookingsApiSuccess,
  loadChangeSeatAvailability,
  loadChangeSeatAvailabilityFailure,
  loadChangeSeatAvailabilitySuccess,
  loadChangeSeatTickets,
  loadChangeSeatTicketsFailure,
  loadChangeSeatTicketsSuccess,
  loadRescheduleEstimate,
  loadRescheduleEstimateFailure,
  loadRescheduleEstimateSuccess,
  loadRescheduleOptions,
  loadRescheduleOptionsFailure,
  loadRescheduleOptionsSuccess,
  loadRescheduleTickets,
  loadRescheduleTicketsFailure,
  loadRescheduleTicketsSuccess,
  loadStopsLookup,
  loadStopsLookupFailure,
  loadStopsLookupSuccess,
  openChangeSeatDialog,
  openRescheduleDialog,
  requestCancelBooking,
  rescheduleRequiresPayment,
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
  ),

  // --- Reschedule dialog (OBRS-83) ---
  on(openRescheduleDialog, (state, { bookingId }) => ({
    ...state,
    rescheduleDialogBookingId: bookingId,
    // Reset any leftover state from a previous dialog session.
    rescheduleTickets: [],
    rescheduleTicketsLoading: true,
    rescheduleTicketsError: null,
    rescheduleOptions: [],
    rescheduleOptionsLoading: false,
    rescheduleOptionsError: null,
    rescheduleEstimate: null,
    rescheduleEstimateLoading: false,
    rescheduleEstimateError: null,
    rescheduleSubmitting: false,
    rescheduleConfirmError: null,
    rescheduleConfirmErrorCode: null,
    reschedulePendingPayment: null,
  })),
  on(closeRescheduleDialog, (state) => ({
    ...state,
    rescheduleDialogBookingId: null,
    rescheduleTickets: [],
    rescheduleTicketsLoading: false,
    rescheduleTicketsError: null,
    rescheduleOptions: [],
    rescheduleOptionsLoading: false,
    rescheduleOptionsError: null,
    rescheduleEstimate: null,
    rescheduleEstimateLoading: false,
    rescheduleEstimateError: null,
    rescheduleSubmitting: false,
    rescheduleConfirmError: null,
    rescheduleConfirmErrorCode: null,
    reschedulePendingPayment: null,
  })),

  on(loadStopsLookup, (state) => ({
    ...state,
    stopsLookupLoading: true,
    stopsLookupError: null,
  })),
  on(loadStopsLookupSuccess, (state, { stopsLookup }) => ({
    ...state,
    stopsLookup,
    stopsLookupLoading: false,
    stopsLookupError: null,
  })),
  on(loadStopsLookupFailure, (state, { error }) => ({
    ...state,
    stopsLookupLoading: false,
    stopsLookupError: error,
  })),

  on(loadRescheduleTickets, (state) => ({
    ...state,
    rescheduleTicketsLoading: true,
    rescheduleTicketsError: null,
  })),
  on(loadRescheduleTicketsSuccess, (state, { tickets }) => ({
    ...state,
    rescheduleTickets: tickets,
    rescheduleTicketsLoading: false,
    rescheduleTicketsError: null,
  })),
  on(loadRescheduleTicketsFailure, (state, { error }) => ({
    ...state,
    rescheduleTicketsLoading: false,
    rescheduleTicketsError: error,
  })),

  on(loadRescheduleOptions, (state) => ({
    ...state,
    rescheduleOptions: [],
    rescheduleOptionsLoading: true,
    rescheduleOptionsError: null,
    // A new date invalidates any estimate chosen for a prior date's candidate.
    rescheduleEstimate: null,
  })),
  on(loadRescheduleOptionsSuccess, (state, { options }) => ({
    ...state,
    rescheduleOptions: options,
    rescheduleOptionsLoading: false,
    rescheduleOptionsError: null,
  })),
  on(loadRescheduleOptionsFailure, (state, { error }) => ({
    ...state,
    rescheduleOptionsLoading: false,
    rescheduleOptionsError: error,
  })),

  on(loadRescheduleEstimate, (state) => ({
    ...state,
    rescheduleEstimate: null,
    rescheduleEstimateLoading: true,
    rescheduleEstimateError: null,
    rescheduleConfirmError: null,
    rescheduleConfirmErrorCode: null,
  })),
  on(loadRescheduleEstimateSuccess, (state, { estimate }) => ({
    ...state,
    rescheduleEstimate: estimate,
    rescheduleEstimateLoading: false,
    rescheduleEstimateError: null,
  })),
  on(loadRescheduleEstimateFailure, (state, { error }) => ({
    ...state,
    rescheduleEstimateLoading: false,
    rescheduleEstimateError: error,
  })),

  on(confirmReschedule, (state) => ({
    ...state,
    rescheduleSubmitting: true,
    rescheduleConfirmError: null,
    rescheduleConfirmErrorCode: null,
  })),
  on(confirmRescheduleSuccess, (state) => ({
    ...state,
    rescheduleSubmitting: false,
  })),
  on(confirmRescheduleFailure, (state, { errorCode, error }) => ({
    ...state,
    rescheduleSubmitting: false,
    rescheduleConfirmError: error,
    rescheduleConfirmErrorCode: errorCode,
  })),
  on(rescheduleRequiresPayment, (state, { bookingId, paymentIntentId }) => ({
    ...state,
    reschedulePendingPayment: { bookingId, paymentIntentId },
  })),

  // --- Change seat dialog (OBRS-110) ---
  on(openChangeSeatDialog, (state, { bookingId }) => ({
    ...state,
    changeSeatDialogBookingId: bookingId,
    // Reset any leftover state from a previous dialog session.
    changeSeatAvailability: null,
    changeSeatAvailabilityLoading: true,
    changeSeatAvailabilityError: null,
    changeSeatTickets: [],
    changeSeatTicketsLoading: true,
    changeSeatTicketsError: null,
    changeSeatSubmitting: false,
    changeSeatConfirmError: null,
    changeSeatConfirmErrorCode: null,
  })),
  on(closeChangeSeatDialog, (state) => ({
    ...state,
    changeSeatDialogBookingId: null,
    changeSeatAvailability: null,
    changeSeatAvailabilityLoading: false,
    changeSeatAvailabilityError: null,
    changeSeatTickets: [],
    changeSeatTicketsLoading: false,
    changeSeatTicketsError: null,
    changeSeatSubmitting: false,
    changeSeatConfirmError: null,
    changeSeatConfirmErrorCode: null,
  })),

  on(loadChangeSeatAvailability, (state) => ({
    ...state,
    changeSeatAvailabilityLoading: true,
    changeSeatAvailabilityError: null,
  })),
  on(loadChangeSeatAvailabilitySuccess, (state, { availability }) => ({
    ...state,
    changeSeatAvailability: availability,
    changeSeatAvailabilityLoading: false,
    changeSeatAvailabilityError: null,
  })),
  on(loadChangeSeatAvailabilityFailure, (state, { error }) => ({
    ...state,
    changeSeatAvailabilityLoading: false,
    changeSeatAvailabilityError: error,
  })),

  on(loadChangeSeatTickets, (state) => ({
    ...state,
    changeSeatTicketsLoading: true,
    changeSeatTicketsError: null,
  })),
  on(loadChangeSeatTicketsSuccess, (state, { tickets }) => ({
    ...state,
    changeSeatTickets: tickets,
    changeSeatTicketsLoading: false,
    changeSeatTicketsError: null,
  })),
  on(loadChangeSeatTicketsFailure, (state, { error }) => ({
    ...state,
    changeSeatTicketsLoading: false,
    changeSeatTicketsError: error,
  })),

  on(confirmChangeSeat, (state) => ({
    ...state,
    changeSeatSubmitting: true,
    changeSeatConfirmError: null,
    changeSeatConfirmErrorCode: null,
  })),
  on(confirmChangeSeatSuccess, (state) => ({
    ...state,
    changeSeatSubmitting: false,
  })),
  on(confirmChangeSeatFailure, (state, { errorCode, error }) => ({
    ...state,
    changeSeatSubmitting: false,
    changeSeatConfirmError: error,
    changeSeatConfirmErrorCode: errorCode,
  }))
);
