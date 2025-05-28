import { createAction, props } from '@ngrx/store';
import { ScheduleFilter } from '../../interfaces/schedule.interface';

// START GET
export const invokeGetScheduleFilterApi = createAction(
  '[ScheduleFilter API] Invoke to get Schedule Filter'
);

export const invokeGetScheduleFilterApiSuccess = createAction(
  '[ScheduleFilter API] Get Schedule Filter Success',
  props<{ schedule_filter: ScheduleFilter | null }>()
);
// END GET

// START SET
export const invokeSetScheduleFilterApi = createAction(
  '[ScheduleFilter API] Invoke to set Schedule Filter',
  props<{ schedule_filter: ScheduleFilter }>()
);

export const invokeSetScheduleFilterApiSuccess = createAction(
  '[ScheduleFilter API] Set Schedule Filter Success',
  props<{ schedule_filter: ScheduleFilter | null }>()
);
// END SET
