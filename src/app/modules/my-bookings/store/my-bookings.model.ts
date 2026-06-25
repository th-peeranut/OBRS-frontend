import { MyBookingDto } from '../../../shared/interfaces/my-booking.interface';

export interface MyBookingsState {
  bookings: MyBookingDto[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Booking id currently being cancelled (drives the per-row spinner). */
  cancellingBookingId: number | null;
  /** Active status filter, echoed back so a post-cancel reload preserves it. */
  statusFilter: string | null;
}

export const initialMyBookingsState: MyBookingsState = {
  bookings: [],
  loading: false,
  loaded: false,
  error: null,
  cancellingBookingId: null,
  statusFilter: null,
};
