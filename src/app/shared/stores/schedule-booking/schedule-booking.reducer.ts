import { createReducer, on } from '@ngrx/store';
import {
  invokeGetScheduleBookingApiSuccess,
  invokeSetScheduleBookingApiSuccess,
} from './schedule-booking.action';
import { ScheduleBooking } from '../../interfaces/schedule-booking.interface';
import { restoreBookingSelection } from '../../lib/booking-context-storage';

/**
 * OBRS-903: seeded from the cross-tab booking context rather than from `null`.
 *
 * A first-time booker is forced out to their mail app to verify the address
 * (`BookingService.java` rejects the booking otherwise) and comes back through a
 * link that opens a NEW TAB — a fresh store. Reading the persisted selection
 * here is the same rehydrate-at-initialState pattern `station.reducer.ts` uses,
 * and it means every page that already reads this slice gets the restored trips
 * with no change of its own. `restoreBookingSelection` enforces the TTL and
 * flags the value as restored so
 * `ScheduleBookingEffect.revalidateRestoredScheduleBooking$` knows to re-check
 * availability before the customer builds on it.
 */
const restored = restoreBookingSelection();
export const initialState: ScheduleBooking | null = restored
  ? { schedule: restored }
  : null;

export const ScheduleBookingReducer = createReducer<ScheduleBooking | null>(
  initialState,
  // GET
  on(invokeGetScheduleBookingApiSuccess, (state, { schedule_booking }) => {
    return schedule_booking;
  }),
  // SET
  on(invokeSetScheduleBookingApiSuccess, (state, { schedule_booking }) => {
    return schedule_booking;
  })
);
