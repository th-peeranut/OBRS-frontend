import { Injectable } from '@angular/core';
import {
  OtpRequest,
  OtpRequestResponse,
  OtpVerify,
  OtpVerifyResponse,
} from '../../shared/interfaces/otp.interface';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
    return firstValueFrom(
      this.http.post<ResponseAPI<OtpRequestResponse>>(
        `${this.url}/request${this.endpointSuffix}`,
        payload,
        { headers }
      )
    );
  }

  verifyOTP(payload: OtpVerify): Promise<ResponseAPI<OtpVerifyResponse>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return firstValueFrom(
      this.http.post<ResponseAPI<OtpVerifyResponse>>(
        `${this.url}/verify${this.endpointSuffix}`,
        payload,
        { headers }
      )
    );
  }
}
