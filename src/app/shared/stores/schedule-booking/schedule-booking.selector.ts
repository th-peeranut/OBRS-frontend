import { createFeatureSelector } from '@ngrx/store';
import { ScheduleBooking } from '../../interfaces/schedule-booking.interface';

export const selectScheduleBooking = createFeatureSelector<ScheduleBooking>('scheduleBooking');
