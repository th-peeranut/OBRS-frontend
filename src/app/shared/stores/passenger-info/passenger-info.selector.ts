import { createFeatureSelector } from '@ngrx/store';
import { PassengerInfoState } from '../../interfaces/passenger-info.interface';

export const selectPassengerInfo =
  createFeatureSelector<PassengerInfoState>('passengerInfo');
