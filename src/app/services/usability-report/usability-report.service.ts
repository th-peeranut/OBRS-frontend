import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import { UsabilityReportReceipt } from '../../shared/interfaces/usability-report.interface';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class UsabilityReportService {
  constructor(private readonly http: HttpClient) {}

  submitReport(formData: FormData): Observable<UsabilityReportReceipt> {
    // Public endpoint (/api/usability-reports) — SKIP_AUTH_LOGOUT (OBRS-187)
    // ensures an anonymous reporter never gets bounced to /login on a 401.
    const context = new HttpContext()
      .set(SKIP_GLOBAL_ERROR_ALERT, true)
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_AUTH_LOGOUT, true);

    // Do NOT set Content-Type — the browser sets it automatically with the
    // correct multipart/form-data boundary when FormData is the body.
    return this.http.post<UsabilityReportReceipt>(
      `${environment.apiUrl}/api/usability-reports`,
      formData,
      { context }
    );
  }
}
