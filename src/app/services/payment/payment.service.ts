import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
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

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly baseUrl = `${environment.apiUrl}/api/private/payments`;

  constructor(private http: HttpClient) {}

  createPayment(
    payload: PaymentPayload,
    idempotencyKey?: string
  ): Observable<ResponseAPI<PaymentResponse>> {
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
    bookingId: number
  ): Observable<ResponseAPI<PaymentByBookingIdResponse>> {
    return this.http.get<ResponseAPI<PaymentByBookingIdResponse>>(
      `${environment.apiUrl}/api/private/bookings/${bookingId}/payments`
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
