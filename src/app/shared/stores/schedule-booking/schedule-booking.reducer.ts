import { createReducer, on } from '@ngrx/store';
import {
  invokeGetScheduleBookingApiSuccess,
  invokeSetScheduleBookingApiSuccess,
} from './schedule-booking.action';
import { ScheduleBooking } from '../../interfaces/schedule-booking.interface';

export const initialState: ScheduleBooking | null = null;

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
