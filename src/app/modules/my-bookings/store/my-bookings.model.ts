import { MyBookingDto } from '../../../shared/interfaces/my-booking.interface';
import {
  RescheduleEstimate,
  RescheduleOption,
  RescheduleSeatAssignment,
} from '../../../shared/interfaces/reschedule.interface';

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
};
