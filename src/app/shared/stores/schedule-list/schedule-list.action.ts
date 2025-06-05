import { createAction, props } from '@ngrx/store';
import { ScheduleFilterPayload, ScheduleList } from '../../interfaces/schedule.interface';

// START GET
export const invokeGetScheduleListApi = createAction(
  '[ScheduleList API] Invoke to get Schedule List',
   props<{ schedule_filter: ScheduleFilterPayload }>()
);

export const invokeGetScheduleListApiSuccess = createAction(
  '[ScheduleList API] Get Schedule List Success',
  props<{ schedule_list: ScheduleList | null }>()
);
// END GET

// START SET
export const invokeSetScheduleListApi = createAction(
  '[ScheduleList API] Invoke to set Schedule List',
  props<{ schedule_list: ScheduleList }>()
);

export const invokeSetScheduleListApiSuccess = createAction(
  '[ScheduleList API] Set Schedule List Success',
  props<{ schedule_list: ScheduleList | null }>()
);
// END SET
