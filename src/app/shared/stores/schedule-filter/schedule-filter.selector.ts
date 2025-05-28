import { createFeatureSelector } from '@ngrx/store';
import { ScheduleFilter } from '../../interfaces/schedule.interface';

export const selectScheduleFilter = createFeatureSelector<ScheduleFilter>('scheduleFilter');
