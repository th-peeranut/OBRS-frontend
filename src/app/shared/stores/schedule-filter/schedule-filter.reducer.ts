import { createReducer, on } from '@ngrx/store';
import {
  invokeGetScheduleFilterApiSuccess,
  invokeSetScheduleFilterApiSuccess,
} from './schedule-filter.action';
import { ScheduleFilter } from '../../interfaces/schedule.interface';
import { restoreBookingFilter } from '../../lib/booking-context-storage';

/**
 * OBRS-903: seeded from the cross-tab booking context (see
 * `schedule-booking.reducer.ts` for why a new tab is the normal case here).
 * Restoring the filter alongside the selection is what makes
 * `/schedule-booking` re-run the customer's original search on arrival instead
 * of showing an empty form — including on the path where the restored selection
 * turns out to be sold out and they are sent back to pick another trip.
 */
export const initialState: ScheduleFilter | null = restoreBookingFilter();

export const ScheduleFilterReducer = createReducer<ScheduleFilter | null>(
  initialState,
  // GET
  on(invokeGetScheduleFilterApiSuccess, (state, { schedule_filter }) => {
    return schedule_filter;
  }),
  // SET
  on(invokeSetScheduleFilterApiSuccess, (state, { schedule_filter }) => {
    return schedule_filter;
  })
);
