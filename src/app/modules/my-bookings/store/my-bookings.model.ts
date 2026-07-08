import { MyBookingDto } from '../../../shared/interfaces/my-booking.interface';
import {
  RescheduleEstimate,
  RescheduleOption,
  RescheduleSeatAssignment,
} from '../../../shared/interfaces/reschedule.interface';
import {
  ChangeSeatAvailability,
  ChangeSeatTicket,
} from '../../../shared/interfaces/change-seat.interface';

export interface MyBookingsState {
  bookings: MyBookingDto[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Booking id currently being cancelled (drives the per-row spinner). */
  cancellingBookingId: number | null;
  /** Active status filter, echoed back so a post-cancel reload preserves it. */
  statusFilter: string | null;

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
}

export const initialMyBookingsState: MyBookingsState = {
  bookings: [],
  loading: false,
  loaded: false,
  error: null,
  cancellingBookingId: null,
  statusFilter: null,

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

  changeSeatTickets: [],
  changeSeatTicketsLoading: false,
  changeSeatTicketsError: null,

  changeSeatSubmitting: false,
  changeSeatConfirmError: null,
  changeSeatConfirmErrorCode: null,
};
