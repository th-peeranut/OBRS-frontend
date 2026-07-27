import { createReducer, on } from '@ngrx/store';
import { initialMyBookingsState } from './my-bookings.model';
import {
  cancelBookingDismissed,
  cancelBookingFailure,
  cancelBookingSuccess,
  changeStopRequiresPayment,
  closeChangeSeatDialog,
  closeChangeStopDialog,
  closeRescheduleDialog,
  confirmChangeSeat,
  confirmChangeSeatFailure,
  confirmChangeSeatSuccess,
  confirmChangeStop,
  confirmChangeStopFailure,
  confirmChangeStopSuccess,
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
  loadChangeStopEstimate,
  loadChangeStopEstimateFailure,
  loadChangeStopEstimateSuccess,
  loadChangeStopRouteStops,
  loadChangeStopRouteStopsFailure,
  loadChangeStopRouteStopsSuccess,
  loadChangeStopTickets,
  loadChangeStopTicketsFailure,
  loadChangeStopTicketsSuccess,
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
  openCancelRefundDestinationModal,
  closeCancelRefundDestinationModal,
  confirmCancelWithDestination,
  refundDestinationInvalid,
  openChangeSeatDialog,
  openChangeStopDialog,
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

  // --- Cancel-with-destination modal (OBRS-286 Flow A1) ---
  on(openCancelRefundDestinationModal, (state, { booking, policy }) => ({
    ...state,
    refundDestinationModal: { booking, policy, error: null },
  })),
  on(
    closeCancelRefundDestinationModal,
    cancelBookingSuccess,
    cancelBookingFailure,
    (state) => ({
      ...state,
      refundDestinationModal: null,
    })
  ),
  on(confirmCancelWithDestination, (state) => ({
    ...state,
    refundDestinationModal: state.refundDestinationModal
      ? { ...state.refundDestinationModal, error: null }
      : null,
  })),
  // The fix for the contradiction Scrutinize caught: Flow A1 step 5 needs the
  // modal to stay open with the typed destination intact on a
  // destination-invalid 400 — this case leaves `booking`/`policy` untouched
  // and does NOT clear `refundDestinationModal` (unlike cancelBookingFailure
  // above, which is for genuinely fatal errors).
  on(refundDestinationInvalid, (state, { message }) => ({
    ...state,
    refundDestinationModal: state.refundDestinationModal
      ? { ...state.refundDestinationModal, error: message }
      : null,
  })),

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
  })),

  // --- Change stop dialog (OBRS-110 wave 2) ---
  on(openChangeStopDialog, (state, { bookingId }) => ({
    ...state,
    changeStopDialogBookingId: bookingId,
    // Reset any leftover state from a previous dialog session.
    changeStopRouteMeta: null,
    changeStopPickupStops: [],
    changeStopDropoffStops: [],
    changeStopRouteStopsLoading: true,
    changeStopRouteStopsError: null,
    changeStopTickets: [],
    changeStopTicketsLoading: true,
    changeStopTicketsError: null,
    changeStopEstimate: null,
    changeStopEstimateLoading: false,
    changeStopEstimateError: null,
    changeStopSubmitting: false,
    changeStopConfirmError: null,
    changeStopConfirmErrorCode: null,
    changeStopPendingPayment: null,
  })),
  on(closeChangeStopDialog, (state) => ({
    ...state,
    changeStopDialogBookingId: null,
    changeStopRouteMeta: null,
    changeStopPickupStops: [],
    changeStopDropoffStops: [],
    changeStopRouteStopsLoading: false,
    changeStopRouteStopsError: null,
    changeStopTickets: [],
    changeStopTicketsLoading: false,
    changeStopTicketsError: null,
    changeStopEstimate: null,
    changeStopEstimateLoading: false,
    changeStopEstimateError: null,
    changeStopSubmitting: false,
    changeStopConfirmError: null,
    changeStopConfirmErrorCode: null,
    changeStopPendingPayment: null,
  })),

  on(loadChangeStopRouteStops, (state) => ({
    ...state,
    changeStopRouteStopsLoading: true,
    changeStopRouteStopsError: null,
  })),
  on(loadChangeStopRouteStopsSuccess, (state, { pickup, dropoff, route }) => ({
    ...state,
    changeStopPickupStops: pickup,
    changeStopDropoffStops: dropoff,
    changeStopRouteMeta: route,
    changeStopRouteStopsLoading: false,
    changeStopRouteStopsError: null,
  })),
  on(loadChangeStopRouteStopsFailure, (state, { error }) => ({
    ...state,
    changeStopRouteStopsLoading: false,
    changeStopRouteStopsError: error,
  })),

  on(loadChangeStopTickets, (state) => ({
    ...state,
    changeStopTicketsLoading: true,
    changeStopTicketsError: null,
  })),
  on(loadChangeStopTicketsSuccess, (state, { tickets }) => ({
    ...state,
    changeStopTickets: tickets,
    changeStopTicketsLoading: false,
    changeStopTicketsError: null,
  })),
  on(loadChangeStopTicketsFailure, (state, { error }) => ({
    ...state,
    changeStopTicketsLoading: false,
    changeStopTicketsError: error,
  })),

  // Deliberately does NOT touch changeStopConfirmError/changeStopConfirmErrorCode
  // (OBRS-83 NO_SEATS lesson, same as ChangeSeatEffect's loadChangeSeatAvailability
  // reducer case) — a re-dispatched estimate load must never wipe a still-relevant
  // confirm-time banner.
  on(loadChangeStopEstimate, (state) => ({
    ...state,
    changeStopEstimate: null,
    changeStopEstimateLoading: true,
    changeStopEstimateError: null,
  })),
  on(loadChangeStopEstimateSuccess, (state, { estimate }) => ({
    ...state,
    changeStopEstimate: estimate,
    changeStopEstimateLoading: false,
    changeStopEstimateError: null,
  })),
  on(loadChangeStopEstimateFailure, (state, { error }) => ({
    ...state,
    changeStopEstimateLoading: false,
    changeStopEstimateError: error,
  })),

  on(confirmChangeStop, (state) => ({
    ...state,
    changeStopSubmitting: true,
    changeStopConfirmError: null,
    changeStopConfirmErrorCode: null,
  })),
  on(confirmChangeStopSuccess, (state) => ({
    ...state,
    changeStopSubmitting: false,
  })),
  on(confirmChangeStopFailure, (state, { errorCode, error }) => ({
    ...state,
    changeStopSubmitting: false,
    changeStopConfirmError: error,
    changeStopConfirmErrorCode: errorCode,
  })),
  on(changeStopRequiresPayment, (state, { bookingId, paymentIntentId }) => ({
    ...state,
    changeStopPendingPayment: { bookingId, paymentIntentId },
  }))
);
