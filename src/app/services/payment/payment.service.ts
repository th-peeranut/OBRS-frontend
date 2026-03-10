import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { PaymentPayload } from '../../shared/interfaces/payment.interface';
import { generateIdempotencyKey } from '../../shared/lib/idempotency-key';

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  constructor(private http: HttpClient) {}

  createPayment(
    payload: PaymentPayload,
    idempotencyKey?: string
  ): Observable<ResponseAPI<any>> {
    const headers = new HttpHeaders({
      'idempotency-key': idempotencyKey ?? generateIdempotencyKey(),
    });

    return this.http.post<ResponseAPI<any>>(
      `${environment.apiUrl}/api/private/payments/mock`,
      payload,
      { headers }
    );
  }
}
