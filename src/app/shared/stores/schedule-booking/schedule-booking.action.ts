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
