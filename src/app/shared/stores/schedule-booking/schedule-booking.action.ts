import { createAction, props } from '@ngrx/store';
import { ScheduleBooking } from '../../interfaces/schedule-booking.interface';

// START GET
export const invokeGetScheduleBookingApi = createAction(
  '[ScheduleBooking API] Invoke to get Schedule Booking'
);

export const invokeGetScheduleBookingApiSuccess = createAction(
  '[ScheduleBooking API] Get Schedule Booking Success',
  props<{ schedule_booking: ScheduleBooking | null }>()
);
// END GET

// START SET
export const invokeSetScheduleBookingApi = createAction(
  '[ScheduleBooking API] Invoke to set Schedule Booking',
  props<{ schedule_booking: ScheduleBooking }>()
);

export const invokeSetScheduleBookingApiSuccess = createAction(
  '[ScheduleBooking API] Set Schedule Booking Success',
  props<{ schedule_booking: ScheduleBooking | null }>()
);
// END SET

/**
 * OBRS-903: re-ask the backend whether a selection that was RESTORED from
 * storage (a different tab chose it, possibly half an hour ago) is still
 * bookable, before the customer is allowed to build on it.
 *
 * Dispatched by the two pages that come before payment —
 * `/review-schedule-booking` and `/passenger-info`. A no-op when the selection
 * in play was made in this tab, which is the healthy path and needs no request.
 */
export const revalidateRestoredScheduleBooking = createAction(
  '[ScheduleBooking] Revalidate restored selection'
);
