import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { BookingPayload } from '../../shared/interfaces/booking.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class BookingService {
  constructor(private http: HttpClient) {}

  createBooking(payload: BookingPayload): Observable<ResponseAPI<any>> {
    return this.http.post<ResponseAPI<any>>(
      `${environment.apiUrl}/api/private/bookings`,
      payload
    );
  }
}
