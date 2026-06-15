import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { BookingPayload, BookingCreationResponse } from '../../shared/interfaces/booking.interface';
import { BookingTicketsData } from '../../shared/interfaces/booking-ticket.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class BookingService {
  private readonly BOOKING_ID_KEY = 'active_booking_id';

  constructor(private http: HttpClient) {}

  createBooking(payload: BookingPayload): Observable<ResponseAPI<BookingCreationResponse>> {
    return this.http.post<ResponseAPI<BookingCreationResponse>>(
      `${environment.apiUrl}/api/private/bookings`,
      payload
    );
  }

  getBookingTickets(
    bookingId: number
  ): Observable<ResponseAPI<BookingTicketsData>> {
    return this.http.get<ResponseAPI<BookingTicketsData>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/tickets`
    );
  }

  setActiveBookingId(bookingId: number | null | undefined): void {
    const normalized = Number(bookingId);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return;
    }

    localStorage.setItem(this.BOOKING_ID_KEY, String(normalized));
  }

  getActiveBookingId(): number | null {
    const raw = localStorage.getItem(this.BOOKING_ID_KEY);
    if (!raw) return null;

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  clearActiveBookingId(): void {
    localStorage.removeItem(this.BOOKING_ID_KEY);
  }
}
