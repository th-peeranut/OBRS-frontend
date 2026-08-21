import { CancellationPolicy, MyBookingDto, MyBookingView } from '../../../shared/interfaces/my-booking.interface';
import {
  RescheduleEstimate,
  RescheduleOption,
  RescheduleSeatAssignment,
} from '../../../shared/interfaces/reschedule.interface';
import {
  ChangeSeatAvailability,
  ChangeSeatTicket,
} from '../../../shared/interfaces/change-seat.interface';
import {
  ChangeStopEstimate,
  ChangeStopSeatAssignment,
} from '../../../shared/interfaces/change-stop.interface';
import { RouteMeta, RouteStop } from '../../../shared/interfaces/route-map.interface';

/** OBRS-577: page size for the first load / a status-filter switch (AC2's
 * new default, replacing the hardcoded 100) and the increment "Load more"
 * fetches. Shared between the effect (request `size`/next `page`) and the
 * reducer (`pagesLoaded` bookkeeping) so the two can never drift apart. */
export const MY_BOOKINGS_PAGE_SIZE = 20;

export interface MyBookingsState {
  bookings: MyBookingDto[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Booking id currently being cancelled (drives the per-row spinner). */
  cancellingBookingId: number | null;
  /** Active status filter, echoed back so a post-cancel reload preserves it. */
  statusFilter: string | null;

  // --- Incremental "Load more" (OBRS-577) ---
  /** Total rows for the ACTIVE filter, echoed from the last successful
   * response — drives the `MY_BOOKINGS.SHOWING_COUNT`/`SHOWING_ALL_COUNT`
   * count line. */
  totalElements: number;
  /** How many `MY_BOOKINGS_PAGE_SIZE`-sized server pages exist for the
   * active filter. */
  totalPages: number;
  /** How many `MY_BOOKINGS_PAGE_SIZE`-sized pages make up `bookings` right
   * now — the next Load more request's `page` param, and (via
   * `preserveWindow`) how large a single-request refetch must be to restore
   * the same window after a mutation (Decision A). */
  pagesLoaded: number;
  /** True only while a Load more request (never the first load / a filter
   * switch) is in flight — drives the button's disabled+label swap without
   * surfacing the global loading dialog. */
  loadingMore: boolean;

  // --- Cancel-with-destination modal (OBRS-286 Flow A1) ---
  /** Non-null while the modal is open. `booking`/`policy` are set once, on
   * open, and never touched again — only `error` changes afterward (a
   * destination-invalid 400 keeps the modal open with what was typed
   * intact, UI spec Flow A1 step 5). */
  refundDestinationModal: {
    booking: MyBookingView;
    policy: CancellationPolicy;
    error: string | null;
  } | null;

  // --- Reschedule dialog (OBRS-83) ---
  /** Booking id whose reschedule dialog is open, or null when closed. Set
   * synchronously on open — the dialog surfaces optimistically. */
  rescheduleDialogBookingId: number | null;

  /** Stop slug → numeric stop id (`StationApi.slug`/`.id`), loaded once and
   * cached for the life of the page (`GET /api/stops`). */
  stopsLookup: Record<string, number>;
  stopsLookupLoading: boolean;
  stopsLookupError: string | null;

  /** The open booking's current tickets (existing seat numbers), used to
   * build `seatAssignments` (`GET /bookings/{id}/tickets`). */
  rescheduleTickets: RescheduleSeatAssignment[];
  rescheduleTicketsLoading: boolean;
  rescheduleTicketsError: string | null;

  rescheduleOptions: RescheduleOption[];
  rescheduleOptionsLoading: boolean;
  /** Translated, ready-to-render message; null when there is no error. */
  rescheduleOptionsError: string | null;

  rescheduleEstimate: RescheduleEstimate | null;
  rescheduleEstimateLoading: boolean;
  rescheduleEstimateError: string | null;

  rescheduleSubmitting: boolean;
  /** Translated inline message shown on the estimate step (e.g. NO_SEATS,
   * PRICE_CHANGED); null when there is no error. */
  rescheduleConfirmError: string | null;
  rescheduleConfirmErrorCode: string | null;

  /** Set when `POST .../reschedule` returns `PENDING_PAYMENT` — the dialog
   * switches to the embedded payment step. */
  reschedulePendingPayment: { bookingId: number; paymentIntentId: number | null } | null;

  // --- Change seat dialog (OBRS-110) ---
  /** Booking id whose change-seat dialog is open, or null when closed. Set
   * synchronously on open — the dialog surfaces optimistically. */
  changeSeatDialogBookingId: number | null;

  changeSeatAvailability: ChangeSeatAvailability | null;
  changeSeatAvailabilityLoading: boolean;
  /** Total-failure message for the availability GET itself (drives the
   * dialog's full-step error card + Retry). */
  changeSeatAvailabilityError: string | null;
  /** The stable `errorCode` behind `changeSeatAvailabilityError`. Carried
   * alongside the translated message for the same reason `confirmChangeSeat`
   * carries its own: the error step must branch on the code, never on the
   * localized text (design-system §9). A terminal code means the retry would
   * return the same 400 forever, so the error step drops Retry (OBRS-1489). */
  changeSeatAvailabilityErrorCode: string | null;

  /** The open booking's current tickets (existing seat numbers), the basis
   * for `seatAssignments` (`GET /bookings/{id}/tickets`). */
  changeSeatTickets: ChangeSeatTicket[];
  changeSeatTicketsLoading: boolean;
  changeSeatTicketsError: string | null;

  changeSeatSubmitting: boolean;
  /** A confirm-time failure, rendered as an inline banner on the map step.
   * Deliberately NOT reset by a re-dispatched availability load (OBRS-83
   * NO_SEATS lesson — a reducer case that wipes this on every load can leave
   * the spinner looking perpetually stuck). */
  changeSeatConfirmError: string | null;
  changeSeatConfirmErrorCode: string | null;

  // --- Change stop dialog (OBRS-110 wave 2) ---
  /** Booking id whose change-stop dialog is open, or null when closed. Set
   * synchronously on open — the dialog surfaces optimistically. */
  changeStopDialogBookingId: number | null;

  /** `RouteMapService.getPickupDropoff(routeSlug)` result for the open
   * booking's route — resolved from `MyBookingScheduleDto.routeSlug`. */
  changeStopRouteMeta: RouteMeta | null;
  changeStopPickupStops: RouteStop[];
  changeStopDropoffStops: RouteStop[];
  changeStopRouteStopsLoading: boolean;
  /** Total-failure message for the pickup/drop-off GET itself (incl. a
   * missing `routeSlug`) — drives the dialog's full-step error card + Retry. */
  changeStopRouteStopsError: string | null;

  /** The open booking's current tickets (existing seat numbers) — carried
   * through unchanged in `seatAssignments` (change-stop never reassigns
   * seats, only stops). */
  changeStopTickets: ChangeStopSeatAssignment[];
  changeStopTicketsLoading: boolean;
  changeStopTicketsError: string | null;

  changeStopEstimate: ChangeStopEstimate | null;
  changeStopEstimateLoading: boolean;
  changeStopEstimateError: string | null;

  changeStopSubmitting: boolean;
  /** A confirm-time failure, rendered as an inline banner on the estimate
   * step. Deliberately NOT reset by a re-dispatched `loadChangeStopEstimate`
   * (OBRS-83 NO_SEATS lesson, same as `ChangeSeatEffect`'s
   * `loadChangeSeatAvailability` case) — only a fresh `confirmChangeStop`
   * attempt clears it. */
  changeStopConfirmError: string | null;
  changeStopConfirmErrorCode: string | null;

  /** Set when `POST .../change-stop/confirm` returns `PENDING_PAYMENT` — the
   * dialog switches to the embedded payment step. */
  changeStopPendingPayment: { bookingId: number; paymentIntentId: number | null } | null;
}

export const initialMyBookingsState: MyBookingsState = {
  bookings: [],
  loading: false,
  loaded: false,
  error: null,
  cancellingBookingId: null,
  statusFilter: null,

  totalElements: 0,
  totalPages: 0,
  pagesLoaded: 0,
  loadingMore: false,

  refundDestinationModal: null,

  rescheduleDialogBookingId: null,

  stopsLookup: {},
  stopsLookupLoading: false,
  stopsLookupError: null,

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

  changeSeatDialogBookingId: null,

  changeSeatAvailability: null,
  changeSeatAvailabilityLoading: false,
  changeSeatAvailabilityError: null,
  changeSeatAvailabilityErrorCode: null,

  changeSeatTickets: [],
  changeSeatTicketsLoading: false,
  changeSeatTicketsError: null,

  changeSeatSubmitting: false,
  changeSeatConfirmError: null,
  changeSeatConfirmErrorCode: null,

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
};
