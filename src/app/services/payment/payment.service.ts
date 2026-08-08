import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  PageResponse,
  PaymentByBookingIdResponse,
  PaymentPayload,
  PaymentResponse,
  PendingRefund,
} from '../../shared/interfaces/payment.interface';
import { generateIdempotencyKey } from '../../shared/lib/idempotency-key';
import { AuthService } from '../../auth/auth.service';
import { BookingService } from '../booking/booking.service';
import { SKIP_GLOBAL_LOADING_ALERT } from '../../shared/interceptors/http-context-tokens';

interface PaymentRequestOptions {
  skipGlobalLoadingAlert?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly baseUrl = `${environment.apiUrl}/api/private/payments`;

  // OBRS-858: both are read ONLY to choose between the private and public payment endpoints in
  // createPayment. Nothing here derives authorization from either — the server does that.
  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private bookingService: BookingService
  ) {}

  /**
   * OBRS-858 (ADR-0123 Decision 6): TWO endpoints, chosen the same way `BookingService.createBooking`
   * chooses — by whether a token is held.
   *
   * A signed-in customer keeps `POST /api/private/payments` exactly as before. A guest goes to
   * `POST /api/payments`, carrying the booking-scoped `guestPaymentToken` that the create call
   * returned, in the `X-Guest-Payment-Token` header.
   *
   * The token is read from the booking store rather than passed in by the caller: it belongs to
   * the booking, not to the payment screen, and threading it through every component that can
   * reach a pay button is how one of them ends up sending a stale one.
   */
  createPayment(
    payload: PaymentPayload,
    idempotencyKey?: string
  ): Observable<ResponseAPI<PaymentResponse>> {
    const guestToken = this.bookingService.getGuestPaymentToken();
    if (!this.authService.isAuthenticated() && guestToken) {
      return this.http.post<ResponseAPI<PaymentResponse>>(
        `${environment.apiUrl}/api/payments`,
        payload,
        {
          headers: this.createIdempotencyHeaders(idempotencyKey).set(
            'X-Guest-Payment-Token',
            guestToken
          ),
        }
      );
    }
    return this.postPayment(this.baseUrl, payload, idempotencyKey);
  }

  createMockPayment(
    payload: PaymentPayload,
    idempotencyKey?: string,
    mockScenario = 'success'
  ): Observable<ResponseAPI<PaymentResponse>> {
    const headers = this.createIdempotencyHeaders(idempotencyKey).set(
      'X-Omise-Mock-Scenario',
      mockScenario
    );

    return this.http.post<ResponseAPI<PaymentResponse>>(
      `${this.baseUrl}/mock`,
      payload,
      { headers }
    );
  }

  createWalkInPayment(
    payload: PaymentPayload,
    idempotencyKey?: string
  ): Observable<ResponseAPI<PaymentResponse>> {
    return this.postPayment(`${this.baseUrl}/walk-in`, payload, idempotencyKey);
  }

  refundPayment(paymentId: number): Observable<ResponseAPI<PaymentResponse>> {
    return this.http.post<ResponseAPI<PaymentResponse>>(
      `${this.baseUrl}/${paymentId}/refund`,
      {}
    );
  }

  getPendingManualRefunds(
    page = 0,
    size = 20
  ): Observable<ResponseAPI<PageResponse<PendingRefund>>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.http.get<ResponseAPI<PageResponse<PendingRefund>>>(
      `${this.baseUrl}/refunds/pending`,
      { params }
    );
  }

  getBookingPayments(
    bookingId: number,
    options: PaymentRequestOptions = {}
  ): Observable<ResponseAPI<PaymentByBookingIdResponse>> {
    const requestOptions = options.skipGlobalLoadingAlert
      ? {
          context: new HttpContext().set(SKIP_GLOBAL_LOADING_ALERT, true),
        }
      : {};

    return this.http.get<ResponseAPI<PaymentByBookingIdResponse>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/payments`,
      requestOptions
    );
  }

  private postPayment(
    url: string,
    payload: PaymentPayload,
    idempotencyKey?: string
  ): Observable<ResponseAPI<PaymentResponse>> {
    return this.http.post<ResponseAPI<PaymentResponse>>(url, payload, {
      headers: this.createIdempotencyHeaders(idempotencyKey),
    });
  }

  private createIdempotencyHeaders(idempotencyKey?: string): HttpHeaders {
    const headers = new HttpHeaders({
      'Idempotency-Key': idempotencyKey ?? generateIdempotencyKey(),
    });

    return headers;
  }
}
