import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { PaymentPayload } from '../../shared/interfaces/payment.interface';

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  constructor(private http: HttpClient) {}

  createPayment(payload: PaymentPayload): Observable<ResponseAPI<any>> {
    return this.http.post<ResponseAPI<any>>(
      `${environment.apiUrl}/api/private/payments/mock`,
      payload
    );
  }
}
