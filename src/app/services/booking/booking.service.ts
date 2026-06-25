import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  BookingPayload,
  BookingCreationResponse,
} from '../../shared/interfaces/booking.interface';
import { BookingTicketsData } from '../../shared/interfaces/booking-ticket.interface';
import {
  CancelBookingResult,
  CancellationPolicy,
  MyBookingDto,
} from '../../shared/interfaces/my-booking.interface';
import { PageResponse } from '../../shared/interfaces/payment.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
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
    bookingId: number,
    silent = false
  ): Observable<ResponseAPI<BookingTicketsData>> {
    return this.http.get<ResponseAPI<BookingTicketsData>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/tickets`,
      silent ? { context: this.silentContext() } : {}
    );
  }

  /**
   * List the current traveler's own bookings, optionally filtered by status.
   * Pass `showLoadingDialog` to surface the global loading dialog (e.g. when
   * switching the status filter); the page renders its own skeletons otherwise.
   */
  getMyBookings(
    status?: string | null,
    showLoadingDialog = false
  ): Observable<ResponseAPI<PageResponse<MyBookingDto>>> {
    let params = new HttpParams().set('page', '0').set('size', '100');
    if (status) {
      params = params.set('status', status);
    }

    return this.http.get<ResponseAPI<PageResponse<MyBookingDto>>>(
      `${environment.apiUrl}/api/private/bookings/me`,
      { params, context: this.listContext(showLoadingDialog) }
    );
  }

  /** Preview the refund/penalty for cancelling a booking (no side effects). */
  getCancellationPolicy(
    bookingId: number
  ): Observable<ResponseAPI<CancellationPolicy>> {
    return this.http.get<ResponseAPI<CancellationPolicy>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/cancel-policy`,
      { context: this.silentContext() }
    );
  }

  /** Cancel a confirmed booking; the backend triggers the policy-based refund. */
  cancelBooking(
    bookingId: number
  ): Observable<ResponseAPI<CancelBookingResult>> {
    return this.http.post<ResponseAPI<CancelBookingResult>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/cancel`,
      {},
      { context: this.silentContext() }
    );
  }

  // The cancel flow drives its own SweetAlert confirm/success/error dialogs,
  // so opt out of the global loading spinner and error alert.
  private silentContext(): HttpContext {
    return new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true);
  }

  // The list always handles errors inline; the loading dialog is opt-in so the
  // first load can show skeletons while a filter switch shows the dialog.
  private listContext(showLoadingDialog: boolean): HttpContext {
    const context = new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true);
    if (!showLoadingDialog) {
      context.set(SKIP_GLOBAL_LOADING_ALERT, true);
    }
    return context;
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
