import { createReducer, on } from '@ngrx/store';
import { initialMyBookingsState, MY_BOOKINGS_PAGE_SIZE } from './my-bookings.model';
import {
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
  invokeLoadMoreMyBookingsApi,
  invokeLoadMoreMyBookingsApiFailure,
  invokeLoadMoreMyBookingsApiSuccess,
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
  on(invokeLoadMyBookingsApiSuccess, (state, { bookings, totalElements, totalPages }) => ({
    ...state,
    bookings,
    totalElements,
    totalPages,
    // A `preserveWindow` refetch returns MORE than one page in a single
    // response (Decision A) — derive `pagesLoaded` from the returned row
    // count rather than assuming 1, so a post-mutation reload doesn't reset
    // how many "pages" Load more thinks are already on screen.
    pagesLoaded: Math.max(1, Math.ceil(bookings.length / MY_BOOKINGS_PAGE_SIZE)),
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

  // --- Load more (OBRS-577) ---
  on(invokeLoadMoreMyBookingsApi, (state) => ({
    ...state,
    loadingMore: true,
  })),
  on(invokeLoadMoreMyBookingsApiSuccess, (state, { bookings, totalElements, totalPages }) => ({
    ...state,
    bookings: [...state.bookings, ...bookings],
    totalElements,
    totalPages,
    pagesLoaded: state.pagesLoaded + 1,
    loadingMore: false,
  })),
  // Deliberately does NOT touch `state.error` — a Load more failure must
  // stay a toast only (AlertService, see the effect), never replace the
  // already-visible list with the full-page error state.
  on(invokeLoadMoreMyBookingsApiFailure, (state) => ({
    ...state,
    loadingMore: false,
  })),
  on(requestCancelBooking, (state, { booking }) => ({
    ...state,
    cancellingBookingId: booking.id,
  })),
  on(
    cancelBookingSuccess,
    cancelBookingFailure,
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
  // OBRS-942 QA regression fix: `closeCancelRefundDestinationModal` must also
  // clear `cancellingBookingId`. Before this card, dismissing the NON-manual
  // lane's plain Swal confirm dispatched `cancelBookingDismissed`, whose
  // reducer case cleared this flag; that action (and its sole dispatcher) was
  // deleted along with the second cancel screen, and every lane's dismiss
  // (×, backdrop, Escape, or taking the reschedule offer) now routes through
  // this action instead. Without this line the flag stays set forever after
  // any dismissal that isn't a submit, and `MyBookingsComponent`'s
  // `[disabled]="cancellingBookingId !== null"` on the overflow menu's Cancel
  // item permanently disables Cancel for EVERY booking, not just the one that
  // was open, until a page reload.
  on(
    closeCancelRefundDestinationModal,
    cancelBookingSuccess,
    cancelBookingFailure,
    (state) => ({
      ...state,
      refundDestinationModal: null,
      cancellingBookingId: null,
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
