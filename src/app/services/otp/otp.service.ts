import { Injectable } from '@angular/core';
import {
  OtpRequest,
  OtpRequestResponse,
  OtpVerify,
  OtpVerifyResponse,
} from '../../shared/interfaces/otp.interface';
import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { SKIP_GLOBAL_ERROR_ALERT } from '../../shared/interceptors/http-context-tokens';

@Injectable({
  providedIn: 'root',
})
export class OtpService {
  private readonly url = `${environment.apiUrl}/api/external/otp`;
  private readonly endpointSuffix = environment.useDevApiEndpoints ? '/test' : '';

  constructor(private http: HttpClient) {}

  /**
   * OBRS-1072: opts out of the global error toast. One of this call's failures —
   * OTP_SEND_PHONE_NOT_REGISTERED, the number has no account — is not a toast but
   * a screen state with a way out (sign up / edit the number), and a toast fired
   * behind that panel says the same thing twice. The caller renders every other
   * failure itself via resolveApiAlertMessage, which is the interceptor's own
   * rule, so nothing else about error presentation changes here.
   */
  requestOTP(payload: OtpRequest): Promise<ResponseAPI<OtpRequestResponse>> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return firstValueFrom(
      this.http.post<ResponseAPI<OtpRequestResponse>>(
        `${this.url}/request${this.endpointSuffix}`,
        payload,
        {
          headers,
          context: new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true),
        }
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
