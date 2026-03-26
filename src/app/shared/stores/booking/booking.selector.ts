import { createFeatureSelector } from '@ngrx/store';
import { BookingState } from '../../interfaces/booking.interface';

export const selectBooking = createFeatureSelector<BookingState>('booking');
