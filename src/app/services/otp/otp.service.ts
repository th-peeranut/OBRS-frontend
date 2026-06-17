import { Injectable } from '@angular/core';
import {
  OtpRequest,
  OtpRequestResponse,
  OtpVerify,
  OtpVerifyResponse,
} from '../../shared/interfaces/otp.interface';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';

@Injectable({
  providedIn: 'root',
})
export class OtpService {
  private readonly url = `${environment.apiUrl}/api/external/otp`;
  private readonly endpointSuffix = environment.useDevApiEndpoints ? '/test' : '';

  constructor(private http: HttpClient) {}

  requestOTP(payload: OtpRequest): Promise<ResponseAPI<OtpRequestResponse>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .post<ResponseAPI<OtpRequestResponse>>(
        `${this.url}/request${this.endpointSuffix}`,
        payload,
        {
          headers,
        }
      )
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to request otp');
        return response;
      });
  }

  verifyOTP(payload: OtpVerify): Promise<ResponseAPI<OtpVerifyResponse>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http
      .post<ResponseAPI<OtpVerifyResponse>>(
        `${this.url}/verify${this.endpointSuffix}`,
        payload,
        {
          headers,
        }
      )
      .toPromise()
      .then((response) => {
        if (!response) throw new Error('Failed to verify otp');
        return response;
      });
  }
}
