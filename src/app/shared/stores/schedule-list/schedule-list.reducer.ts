import { createReducer, on } from '@ngrx/store';
import {
  invokeGetScheduleListApiSuccess,
  invokeSetScheduleListApiSuccess,
} from './schedule-list.action';
import { ScheduleList } from '../../interfaces/schedule.interface';

export const initialState: ScheduleList | null = null;

export const ScheduleListReducer = createReducer<ScheduleList | null>(
  initialState,
  // GET
  on(invokeGetScheduleListApiSuccess, (state, { schedule_list }) => {
    return schedule_list;
  }),
  // SET
  on(invokeSetScheduleListApiSuccess, (state, { schedule_list }) => {
    return schedule_list;
  })
);
