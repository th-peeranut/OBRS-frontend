import { createAction, props } from '@ngrx/store';
import {
  CancellationPolicy,
  CancelBookingResult,
  MyBookingDto,
  MyBookingView,
} from '../../../shared/interfaces/my-booking.interface';
import { RefundDestinationReqDto } from '../../../shared/interfaces/refund-destination.interface';
import {
  RescheduleEstimate,
  RescheduleOption,
  RescheduleResult,
  RescheduleSeatAssignment,
} from '../../../shared/interfaces/reschedule.interface';
import {
  ChangeSeatAvailability,
  ChangeSeatResult,
  ChangeSeatTicket,
} from '../../../shared/interfaces/change-seat.interface';
import {
  ChangeStopEstimate,
  ChangeStopResult,
  ChangeStopSeatAssignment,
} from '../../../shared/interfaces/change-stop.interface';
import { RouteMeta, RouteStop } from '../../../shared/interfaces/route-map.interface';

// --- Load my bookings ---
export const invokeLoadMyBookingsApi = createAction(
  '[MyBookings API] Invoke to load my bookings',
  // OBRS-577: `preserveWindow` (Decision A) — default false keeps the first
  // load / a status-filter switch resetting to page 0 at MY_BOOKINGS_PAGE_SIZE
  // (the existing, locked behavior); the 6 post-mutation reload sites pass
  // `true` so the effect refetches however many pages were already loaded in
  // ONE request instead of visibly truncating the list back to page 1.
  props<{ status?: string | null; showLoading?: boolean; preserveWindow?: boolean }>()
);

export const invokeLoadMyBookingsApiSuccess = createAction(
  '[MyBookings API] Load my bookings success',
  props<{ bookings: MyBookingDto[]; totalElements: number; totalPages: number }>()
);

export const invokeLoadMyBookingsApiFailure = createAction(
  '[MyBookings API] Load my bookings failure',
  props<{ error: string }>()
);

// --- Load more my bookings (OBRS-577 AC2/AC6 — incremental append, never a
// page-number paginator on the customer shell) ---

/** Dispatched by the "Load more" button. No payload — the effect reads
 * `statusFilter`/`pagesLoaded` off the current state itself. */
export const invokeLoadMoreMyBookingsApi = createAction(
  '[MyBookings API] Invoke to load more my bookings'
);

export const invokeLoadMoreMyBookingsApiSuccess = createAction(
  '[MyBookings API] Load more my bookings success',
  props<{ bookings: MyBookingDto[]; totalElements: number; totalPages: number }>()
);

/** Deliberately does NOT reuse `invokeLoadMyBookingsApiFailure` — that one's
 * reducer case sets `state.error`, which would replace the already-visible
 * list with a full-page error state (spec: "Error (load more ล้มเหลว)" must
 * stay a toast only, list/count line unchanged). */
export const invokeLoadMoreMyBookingsApiFailure = createAction(
  '[MyBookings API] Load more my bookings failure',
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

// OBRS-942: `cancelBookingDismissed` removed — its sole dispatcher was the
// Swal-confirm "no" branch in `requestCancel$`, deleted with the second cancel
// screen. `cancelBookingSuccess`/`cancelBookingFailure` already clear the
// in-flight `cancellingBookingId`; the modal's own dismiss goes through
// `closeCancelRefundDestinationModal`, never this action.

// --- Cancel modal (OBRS-286 Flow A1, folded into the ONE cancel screen by
// OBRS-942) ---
// Originally replaced the plain Swal confirm only for MANUAL_REFUND_REQUIRED;
// OBRS-942 deleted the Swal lane entirely, so `requestCancel$` now opens this
// modal for every refund method, and `CancelBookingModalComponent` hides the
// destination form/note itself when the resolved method isn't manual. Kept
// under its original `*RefundDestinationModal` names — see the class-level
// comment on `CancelBookingModalComponent` for why.

/** Opened by `requestCancel$` once the policy resolves — the modal shows the
 * already-fetched policy, no further fetch on open. */
export const openCancelRefundDestinationModal = createAction(
  '[MyBookings API] Open cancel refund destination modal',
  props<{ booking: MyBookingView; policy: CancellationPolicy }>()
);

export const closeCancelRefundDestinationModal = createAction(
  '[MyBookings API] Close cancel refund destination modal'
);

export const confirmCancelWithDestination = createAction(
  '[MyBookings API] Confirm cancel with destination',
  // OBRS-942: `refundDestination` is optional — this action now also carries
  // the non-manual lane's Confirm, which never collects a destination.
  props<{ booking: MyBookingView; refundDestination?: RefundDestinationReqDto }>()
);

/** A server-side `cancel.error.refund-destination-required` /
 * `-invalid` 400 (a race against client validation). Deliberately does NOT
 * reuse `cancelBookingFailure` — that one's effect fires a global toast and
 * its reducer case clears the modal; this case must keep the modal open with
 * everything typed intact (Flow A1 step 5). */
export const refundDestinationInvalid = createAction(
  '[MyBookings API] Refund destination invalid',
  props<{ message: string }>()
);

// --- Reschedule dialog (OBRS-83) ---

/** Opens the dialog optimistically (synchronous, no awaited fetch). */
export const openRescheduleDialog = createAction(
  '[MyBookings API] Open reschedule dialog',
  props<{ bookingId: number }>()
);

export const closeRescheduleDialog = createAction(
  '[MyBookings API] Close reschedule dialog'
);

export const loadStopsLookup = createAction(
  '[MyBookings API] Invoke to load stops lookup'
);

export const loadStopsLookupSuccess = createAction(
  '[MyBookings API] Load stops lookup success',
  props<{ stopsLookup: Record<string, number> }>()
);

export const loadStopsLookupFailure = createAction(
  '[MyBookings API] Load stops lookup failure',
  props<{ error: string }>()
);

export const loadRescheduleTickets = createAction(
  '[MyBookings API] Invoke to load reschedule tickets',
  props<{ bookingId: number }>()
);

export const loadRescheduleTicketsSuccess = createAction(
  '[MyBookings API] Load reschedule tickets success',
  props<{ tickets: RescheduleSeatAssignment[] }>()
);

export const loadRescheduleTicketsFailure = createAction(
  '[MyBookings API] Load reschedule tickets failure',
  props<{ error: string }>()
);

export const loadRescheduleOptions = createAction(
  '[MyBookings API] Invoke to load reschedule options',
  props<{ bookingId: number; date: string }>()
);

export const loadRescheduleOptionsSuccess = createAction(
  '[MyBookings API] Load reschedule options success',
  props<{ options: RescheduleOption[] }>()
);

export const loadRescheduleOptionsFailure = createAction(
  '[MyBookings API] Load reschedule options failure',
  props<{ error: string }>()
);

export const loadRescheduleEstimate = createAction(
  '[MyBookings API] Invoke to load reschedule estimate',
  props<{
    bookingId: number;
    newScheduleId: number;
    newFromStopId: number;
    newToStopId: number;
    seats: string[];
  }>()
);

export const loadRescheduleEstimateSuccess = createAction(
  '[MyBookings API] Load reschedule estimate success',
  props<{ estimate: RescheduleEstimate }>()
);

export const loadRescheduleEstimateFailure = createAction(
  '[MyBookings API] Load reschedule estimate failure',
  props<{ error: string }>()
);

export const confirmReschedule = createAction(
  '[MyBookings API] Invoke to confirm reschedule',
  props<{
    bookingId: number;
    newScheduleId: number;
    newFromStopId: number;
    newToStopId: number;
    /** `null` under `OPEN` seating (OBRS-483). */
    seatAssignments: Record<number, string | null>;
    clientNetAmount: number;
  }>()
);

export const confirmRescheduleSuccess = createAction(
  '[MyBookings API] Confirm reschedule success',
  props<{ result: RescheduleResult }>()
);

export const confirmRescheduleFailure = createAction(
  '[MyBookings API] Confirm reschedule failure',
  props<{ errorCode: string; error: string }>()
);

/** `POST .../reschedule` returned `PENDING_PAYMENT` — a top-up is owed. */
export const rescheduleRequiresPayment = createAction(
  '[MyBookings API] Reschedule requires payment',
  props<{ bookingId: number; paymentIntentId: number | null }>()
);

/** The embedded payment step completed successfully — settle the dialog. */
export const rescheduleSettled = createAction('[MyBookings API] Reschedule settled');

/** The traveler abandoned/closed the dialog while a top-up payment was
 * pending — the booking is left as `PENDING_PAYMENT` server-side. */
export const rescheduleAbandoned = createAction(
  '[MyBookings API] Reschedule abandoned during payment'
);

// --- Change seat dialog (OBRS-110) ---

/** Opens the dialog optimistically (synchronous, no awaited fetch). */
export const openChangeSeatDialog = createAction(
  '[MyBookings API] Open change seat dialog',
  props<{ bookingId: number }>()
);

export const closeChangeSeatDialog = createAction(
  '[MyBookings API] Close change seat dialog'
);

export const loadChangeSeatAvailability = createAction(
  '[MyBookings API] Invoke to load change seat availability',
  props<{ bookingId: number }>()
);

export const loadChangeSeatAvailabilitySuccess = createAction(
  '[MyBookings API] Load change seat availability success',
  props<{ availability: ChangeSeatAvailability }>()
);

export const loadChangeSeatAvailabilityFailure = createAction(
  '[MyBookings API] Load change seat availability failure',
  props<{ error: string }>()
);

export const loadChangeSeatTickets = createAction(
  '[MyBookings API] Invoke to load change seat tickets',
  props<{ bookingId: number }>()
);

export const loadChangeSeatTicketsSuccess = createAction(
  '[MyBookings API] Load change seat tickets success',
  props<{ tickets: ChangeSeatTicket[] }>()
);

export const loadChangeSeatTicketsFailure = createAction(
  '[MyBookings API] Load change seat tickets failure',
  props<{ error: string }>()
);

export const confirmChangeSeat = createAction(
  '[MyBookings API] Invoke to confirm change seat',
  props<{ bookingId: number; seatAssignments: Record<number, string> }>()
);

export const confirmChangeSeatSuccess = createAction(
  '[MyBookings API] Confirm change seat success',
  props<{ result: ChangeSeatResult }>()
);

export const confirmChangeSeatFailure = createAction(
  '[MyBookings API] Confirm change seat failure',
  props<{ errorCode: string; error: string }>()
);

/** `POST .../change-seat` settled (CONFIRMED) — success toast + list refresh
 * + close, never gated behind the refresh. */
export const changeSeatSettled = createAction('[MyBookings API] Change seat settled');

// --- Change stop dialog (OBRS-110 wave 2) ---

/** Opens the dialog optimistically (synchronous, no awaited fetch). */
export const openChangeStopDialog = createAction(
  '[MyBookings API] Open change stop dialog',
  props<{ bookingId: number }>()
);

export const closeChangeStopDialog = createAction(
  '[MyBookings API] Close change stop dialog'
);

export const loadChangeStopRouteStops = createAction(
  '[MyBookings API] Invoke to load change stop route stops',
  props<{ bookingId: number; routeSlug: string }>()
);

export const loadChangeStopRouteStopsSuccess = createAction(
  '[MyBookings API] Load change stop route stops success',
  props<{ pickup: RouteStop[]; dropoff: RouteStop[]; route: RouteMeta | null }>()
);

export const loadChangeStopRouteStopsFailure = createAction(
  '[MyBookings API] Load change stop route stops failure',
  props<{ error: string }>()
);

export const loadChangeStopTickets = createAction(
  '[MyBookings API] Invoke to load change stop tickets',
  props<{ bookingId: number }>()
);

export const loadChangeStopTicketsSuccess = createAction(
  '[MyBookings API] Load change stop tickets success',
  props<{ tickets: ChangeStopSeatAssignment[] }>()
);

export const loadChangeStopTicketsFailure = createAction(
  '[MyBookings API] Load change stop tickets failure',
  props<{ error: string }>()
);

export const loadChangeStopEstimate = createAction(
  '[MyBookings API] Invoke to load change stop estimate',
  props<{
    bookingId: number;
    newFromStopId: number;
    newToStopId: number;
    seats: string[];
  }>()
);

export const loadChangeStopEstimateSuccess = createAction(
  '[MyBookings API] Load change stop estimate success',
  props<{ estimate: ChangeStopEstimate }>()
);

export const loadChangeStopEstimateFailure = createAction(
  '[MyBookings API] Load change stop estimate failure',
  props<{ error: string }>()
);

export const confirmChangeStop = createAction(
  '[MyBookings API] Invoke to confirm change stop',
  props<{
    bookingId: number;
    newFromStopId: number;
    newToStopId: number;
    /** `null` under `OPEN` seating (OBRS-483) — the backend fully supports
     * change-stop there. */
    seatAssignments: Record<number, string | null>;
    clientNetAmount: number;
  }>()
);

export const confirmChangeStopSuccess = createAction(
  '[MyBookings API] Confirm change stop success',
  props<{ result: ChangeStopResult }>()
);

export const confirmChangeStopFailure = createAction(
  '[MyBookings API] Confirm change stop failure',
  props<{ errorCode: string; error: string }>()
);

/** `POST .../change-stop/confirm` returned `PENDING_PAYMENT` — a top-up is owed. */
export const changeStopRequiresPayment = createAction(
  '[MyBookings API] Change stop requires payment',
  props<{ bookingId: number; paymentIntentId: number | null }>()
);

/** The embedded payment step completed successfully — settle the dialog. */
export const changeStopSettled = createAction('[MyBookings API] Change stop settled');

/** The traveler abandoned/closed the dialog while a top-up payment was
 * pending — the booking is left as `PENDING_PAYMENT` server-side. */
export const changeStopAbandoned = createAction(
  '[MyBookings API] Change stop abandoned during payment'
);
