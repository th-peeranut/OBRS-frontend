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
import { SHOW_BLOCKING_LOADING } from '../../shared/interceptors/http-context-tokens';

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
          context: this.blockingContext(),
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
      { headers, context: this.blockingContext() }
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
      {},
      { context: this.blockingContext() }
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

  /**
   * OBRS-908 dropped this method's loading-alert opt-out option. Reading a
   * booking's payments is a page loading its own data, so under the new rule it
   * never shows the blocking overlay and there is nothing left to opt out of —
   * the receipt and payment-result pages already render their own inline spinner.
   */
  getBookingPayments(
    bookingId: number
  ): Observable<ResponseAPI<PaymentByBookingIdResponse>> {
    return this.http.get<ResponseAPI<PaymentByBookingIdResponse>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/payments`
    );
  }

  /**
   * OBRS-1379: the PromptPay QR image, from our own backend.
   *
   * `qrPath` is whatever the create-payment response put in `qrImageUrl` — `/api/payments/<id>/qr`
   * for a guest, `/api/private/payments/<id>/qr` for a signed-in customer. The backend picks the
   * lane from the door the payment came in through, so the path already agrees with how this
   * caller is authenticated; the only thing left to do here is attach the same booking-scoped
   * token the guest pay call attaches, on the same condition.
   *
   * A blob rather than an `<img src>` because the guest lane's credential travels in a HEADER —
   * an `<img>` cannot send one, and putting the token in the query string would write a
   * credential into every access log and referrer between here and Koyeb.
   */
  getQrImage(qrPath: string): Observable<Blob> {
    const guestToken = this.bookingService.getGuestPaymentToken();
    const isGuestLane = !qrPath.startsWith('/api/private/');
    const headers =
      isGuestLane && guestToken
        ? new HttpHeaders({ 'X-Guest-Payment-Token': guestToken })
        : undefined;

    return this.http.get(`${environment.apiUrl}${qrPath}`, {
      responseType: 'blob',
      headers,
    });
  }

  private postPayment(
    url: string,
    payload: PaymentPayload,
    idempotencyKey?: string
  ): Observable<ResponseAPI<PaymentResponse>> {
    return this.http.post<ResponseAPI<PaymentResponse>>(url, payload, {
      headers: this.createIdempotencyHeaders(idempotencyKey),
      context: this.blockingContext(),
    });
  }

  /**
   * OBRS-908: every call that moves money holds the screen while it is in flight.
   *
   * This is the first of the card's three opt-in cases and the least negotiable one —
   * a second press mid-charge is a second charge attempt. `Idempotency-Key` is what
   * makes a duplicate that DOES reach the backend harmless; this is what stops the
   * customer producing one, and stops them navigating away from a charge in progress.
   *
   * Still subject to `BLOCKING_LOADING_DELAY_MS`, so a fast answer shows nothing at
   * all, and to `LOADING_ESCAPE_AFTER_MS` (OBRS-642/OBRS-1336), so a charge that hangs
   * hands the screen back after 8s rather than stranding the customer on it.
   */
  private blockingContext(): HttpContext {
    return new HttpContext().set(SHOW_BLOCKING_LOADING, true);
  }

  private createIdempotencyHeaders(idempotencyKey?: string): HttpHeaders {
    const headers = new HttpHeaders({
      'Idempotency-Key': idempotencyKey ?? generateIdempotencyKey(),
    });

    return headers;
  }
}
