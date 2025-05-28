import { createReducer, on } from '@ngrx/store';
import {
  invokeGetScheduleFilterApiSuccess,
  invokeSetScheduleFilterApiSuccess,
} from './schedule-filter.action';
import { ScheduleFilter } from '../../interfaces/schedule.interface';

export const initialState: ScheduleFilter | null = null;

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
