import { createFeatureSelector, createSelector } from '@ngrx/store';
import { BookingState } from '../../interfaces/booking.interface';

export const selectBooking = createFeatureSelector<BookingState>('booking');

/**
 * OBRS-1986: the ONLY total the payment screen may print, and the one thing that decides
 * whether its pay button is live.
 *
 * `null` means "this page cannot vouch for a total" - no booking in the store yet, or a
 * booking whose `netAmount` the server never sent. It is deliberately NOT a client-side
 * fallback: the prod defect of 2026-09-19 was exactly such a fallback
 * (`pricePerSeat x passengerCount`) resolving to 0 after a refresh emptied the passenger
 * store, so the screen said "0 baht" while the backend charged the full fare.
 */
export const selectBookingNetAmount = createSelector(
  selectBooking,
  (booking: BookingState | null | undefined): number | null => {
    if (booking?.netAmount == null) {
      return null;
    }
    const netAmount = Number(booking.netAmount);
    return Number.isFinite(netAmount) ? netAmount : null;
  }
);
