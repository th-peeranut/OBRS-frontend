import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  SKIP_AUTH_LOGOUT,
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import {
  MyUsabilityReportDetail,
  MyUsabilityReportPage,
  UsabilityReportFollowUp,
  UsabilityReportReceipt,
} from '../../shared/interfaces/usability-report.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class UsabilityReportService {
  private readonly baseUrl = `${environment.apiUrl}/api/private/usability-reports`;

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

  // ── OBRS-433: reporter-facing "My Reports" (private/customer area) ────────
  // Mirrors AdminApiService's own admin-context convention (skip BOTH global
  // loading and global error alert) — every caller here (MyReportsStore, the
  // detail modal, the edit form, the follow-up composer) renders its own
  // inline skeleton/spinner/error state and branches on `errorCode`, so a
  // global blocking spinner + generic toast would be redundant and would
  // additionally fire behind the store's silent background revalidates.
  // Deliberately does NOT set SKIP_AUTH_LOGOUT (unlike submitReport above) —
  // these are private/authenticated calls, so a real 401 must still force
  // logout + redirect to /login rather than being tolerated.
  private privateContext(): HttpContext {
    return new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true);
  }

  getMyReports(
    page: number,
    size: number,
    sort: string
  ): Observable<ResponseAPI<MyUsabilityReportPage>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size)
      .set('sort', sort);

    return this.http.get<ResponseAPI<MyUsabilityReportPage>>(this.baseUrl, {
      params,
      context: this.privateContext(),
    });
  }

  getMyReportById(id: number): Observable<ResponseAPI<MyUsabilityReportDetail>> {
    return this.http.get<ResponseAPI<MyUsabilityReportDetail>>(
      `${this.baseUrl}/${id}`,
      { context: this.privateContext() }
    );
  }

  // PATCH multipart — category (required), description (required), plus
  // keepImageIds[]/images[] parts the caller has already appended to
  // `formData`. Do NOT set Content-Type — see submitReport's comment above.
  updateMyReport(
    id: number,
    formData: FormData
  ): Observable<ResponseAPI<MyUsabilityReportDetail>> {
    return this.http.patch<ResponseAPI<MyUsabilityReportDetail>>(
      `${this.baseUrl}/${id}`,
      formData,
      { context: this.privateContext() }
    );
  }

  // POST multipart — note (required) + images[] (0-5). Allowed in ANY status;
  // does not change the report's status.
  addFollowUp(
    id: number,
    formData: FormData
  ): Observable<ResponseAPI<UsabilityReportFollowUp>> {
    return this.http.post<ResponseAPI<UsabilityReportFollowUp>>(
      `${this.baseUrl}/${id}/follow-ups`,
      formData,
      { context: this.privateContext() }
    );
  }
}
