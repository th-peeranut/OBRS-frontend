import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  BookingPayload,
  CreateBookingResponse,
} from '../../shared/interfaces/booking.interface';
import { BookingTicketsData } from '../../shared/interfaces/booking-ticket.interface';
import {
  CancelBookingResult,
  CancellationPolicy,
  MyBookingDto,
} from '../../shared/interfaces/my-booking.interface';
import {
  RescheduleEstimate,
  RescheduleOption,
  RescheduleResult,
} from '../../shared/interfaces/reschedule.interface';
import {
  ChangeSeatAvailability,
  ChangeSeatResult,
} from '../../shared/interfaces/change-seat.interface';
import {
  ChangeStopEstimate,
  ChangeStopResult,
} from '../../shared/interfaces/change-stop.interface';
import { PageResponse } from '../../shared/interfaces/payment.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import { map, Observable } from 'rxjs';

export interface RescheduleEstimateParams {
  newScheduleId: number;
  newFromStopId: number;
  newToStopId: number;
  seats: string[];
}

export interface ConfirmReschedulePayload {
  newScheduleId: number;
  newFromStopId: number;
  newToStopId: number;
  /** Existing `Ticket.id` → new seat number on the new schedule. */
  seatAssignments: Record<number, string>;
  clientNetAmount?: number;
}

export interface ChangeStopEstimateParams {
  newFromStopId: number;
  newToStopId: number;
  seats: string[];
}

export interface ConfirmChangeStopPayload {
  newFromStopId: number;
  newToStopId: number;
  /** Existing `Ticket.id` → its (unchanged) seat number — change-stop never
   * reassigns seats, only the pickup/drop-off stops. */
  seatAssignments: Record<number, string>;
  clientNetAmount: number;
}

@Injectable({
  providedIn: 'root',
})
export class BookingService {
  private readonly BOOKING_ID_KEY = 'active_booking_id';

  constructor(private http: HttpClient) {}

  /**
   * Create a booking and reserve seats. This is the single seam that resolves the
   * booking-intake response: the raw payload is normalized to the canonical
   * `CreateBookingResponse` ({ bookingId, bookingNumber }) here, so callers never
   * guess at field names or coerce types. Contract: POST /api/private/bookings →
   * 201, data = CreateBookingResponse (see OBRS-backend/docs/api/booking.md).
   *
   * @param suppressGlobalErrorAlert OBRS-109 (#37): pass `true` only when
   *   `payload.promotionCode` is set — the caller then owns rendering a
   *   PROMO_CODE_* rejection inline on the reverted promo field instead of
   *   the generic global alert (and must show its own fallback alert for any
   *   other error, since the interceptor is opted out for this call).
   */
  createBooking(
    payload: BookingPayload,
    suppressGlobalErrorAlert = false
  ): Observable<ResponseAPI<CreateBookingResponse>> {
    return this.http
      .post<ResponseAPI<CreateBookingResponse>>(
        `${environment.apiUrl}/api/private/bookings`,
        payload,
        suppressGlobalErrorAlert ? { context: this.silentErrorContext() } : {}
      )
      .pipe(
        map((response) => ({
          ...response,
          data: this.normalizeCreateBooking(response.data),
        }))
      );
  }

  // Opts out of the global error alert only (the loading dialog behavior is
  // unchanged) so the caller can handle a PROMO_CODE_* rejection inline.
  private silentErrorContext(): HttpContext {
    return new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true);
  }

  // Coerce the intake response to the canonical shape in one place. bookingId
  // resolves to 0 and bookingNumber to '' when absent/invalid; callers treat
  // those as "not created". OBRS-85: also forward the server-computed
  // totalAmount/discountAmountSnapshot/netAmount snapshot when present — these
  // are omitted (undefined) rather than coerced to 0, so callers can tell
  // "no discount data returned" apart from "discount is zero".
  private normalizeCreateBooking(
    data: CreateBookingResponse | null | undefined
  ): CreateBookingResponse {
    const bookingId = Number(data?.bookingId);
    const result: CreateBookingResponse = {
      bookingId: Number.isFinite(bookingId) && bookingId > 0 ? bookingId : 0,
      bookingNumber: String(data?.bookingNumber ?? '').trim(),
    };

    const totalAmount = Number(data?.totalAmount);
    if (Number.isFinite(totalAmount)) {
      result.totalAmount = totalAmount;
    }

    const discountAmountSnapshot = Number(data?.discountAmountSnapshot);
    if (Number.isFinite(discountAmountSnapshot)) {
      result.discountAmountSnapshot = discountAmountSnapshot;
    }

    const netAmount = Number(data?.netAmount);
    if (Number.isFinite(netAmount)) {
      result.netAmount = netAmount;
    }

    return result;
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

  /** List alternative schedules for a given date (same route segment). */
  getRescheduleOptions(
    bookingId: number,
    date: string
  ): Observable<ResponseAPI<RescheduleOption[]>> {
    const params = new HttpParams().set('date', date);
    return this.http.get<ResponseAPI<RescheduleOption[]>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/reschedule-options`,
      { params, context: this.silentContext() }
    );
  }

  /** Preview the fare difference/fee for switching to a candidate schedule. */
  getRescheduleEstimate(
    bookingId: number,
    query: RescheduleEstimateParams
  ): Observable<ResponseAPI<RescheduleEstimate>> {
    let params = new HttpParams()
      .set('newScheduleId', query.newScheduleId)
      .set('newFromStopId', query.newFromStopId)
      .set('newToStopId', query.newToStopId);
    for (const seat of query.seats) {
      params = params.append('seats', seat);
    }

    return this.http.get<ResponseAPI<RescheduleEstimate>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/reschedule-estimate`,
      { params, context: this.silentContext() }
    );
  }

  /** Confirm the reschedule; the dialog renders its own inline states. */
  confirmReschedule(
    bookingId: number,
    payload: ConfirmReschedulePayload
  ): Observable<ResponseAPI<RescheduleResult>> {
    return this.http.post<ResponseAPI<RescheduleResult>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/reschedule`,
      payload,
      { context: this.silentContext() }
    );
  }

  /** Load the candidate seat map for a booking's (single, one-way) leg ahead
   * of picking new seats. The dialog handles its own inline error states. */
  getChangeSeatAvailability(
    bookingId: number
  ): Observable<ResponseAPI<ChangeSeatAvailability>> {
    return this.http.get<ResponseAPI<ChangeSeatAvailability>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/change-seat/availability`,
      { context: this.silentContext() }
    );
  }

  /** Confirm the seat change; always resolves `CONFIRMED` — no payment step. */
  confirmChangeSeat(
    bookingId: number,
    seatAssignments: Record<number, string>
  ): Observable<ResponseAPI<ChangeSeatResult>> {
    return this.http.post<ResponseAPI<ChangeSeatResult>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/change-seat`,
      { seatAssignments },
      { context: this.silentContext() }
    );
  }

  /** Preview the fare difference for switching to a new pickup/drop-off
   * segment (OBRS-110 wave 2). The dialog renders its own inline states. */
  getChangeStopEstimate(
    bookingId: number,
    query: ChangeStopEstimateParams
  ): Observable<ResponseAPI<ChangeStopEstimate>> {
    let params = new HttpParams()
      .set('newFromStopId', query.newFromStopId)
      .set('newToStopId', query.newToStopId);
    for (const seat of query.seats) {
      params = params.append('seats', seat);
    }

    return this.http.get<ResponseAPI<ChangeStopEstimate>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/change-stop/estimate`,
      { params, context: this.silentContext() }
    );
  }

  /** Confirm the stop change; `CONFIRMED` settles immediately (refund/no
   * payment), `PENDING_PAYMENT` hands off to the embedded payment step. */
  confirmChangeStop(
    bookingId: number,
    payload: ConfirmChangeStopPayload
  ): Observable<ResponseAPI<ChangeStopResult>> {
    return this.http.post<ResponseAPI<ChangeStopResult>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/change-stop/confirm`,
      payload,
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
