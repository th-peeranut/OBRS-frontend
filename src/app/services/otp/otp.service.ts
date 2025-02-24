import { Injectable } from '@angular/core';
import { OtpRequest, OtpResponse, OtpVerify } from '../../interfaces/otp.interface';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../interfaces/response.interface';

@Injectable({
  providedIn: 'root',
})
export class OtpService {
  private readonly url = `${environment.apiUrl}/api/otp`;

  constructor(private http: HttpClient) {}

  requestOTP(payload: OtpRequest): Promise<ResponseAPI<OtpResponse>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .post<ResponseAPI<OtpResponse>>(this.url + '/request/test', payload, {
        headers,
      })
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to request otp');
        return response;
      });
  }

  verifyOTP(payload: OtpVerify): Promise<ResponseAPI<OtpResponse>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .post<ResponseAPI<OtpResponse>>(this.url + '/verify/test', payload, {
        headers,
      })
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to verify otp');
        return response;
      });
  }
}
