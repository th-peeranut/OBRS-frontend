import { createFeatureSelector } from '@ngrx/store';
import { ScheduleList } from '../../interfaces/schedule.interface';

export const selectScheduleList = createFeatureSelector<ScheduleList>('scheduleList');
