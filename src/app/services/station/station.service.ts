import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { StationApi } from '../../shared/interfaces/station.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { SKIP_GLOBAL_LOADING_ALERT } from '../../shared/interceptors/http-context-tokens';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class StationService {
  constructor(private http: HttpClient) {}

  /**
   * `skipLoadingAlert` (OBRS-1056): a caller that loads this lookup BEHIND an
   * already-open modal must opt out. Otherwise `error.interceptor.ts` raises the
   * global SweetAlert2 loading popup on top of the dialog, and that popup
   * focuses itself and stops keydown propagation (sweetalert2 ships
   * `stopKeydownPropagation: true` + `keydownListenerCapture: false`), so the
   * dialog's own `document:keydown.escape` host listener never fires and Escape
   * silently does nothing. It also contradicts what those effects promise in
   * their own comments — "modals open optimistically, never gated on an awaited
   * fetch" (design-system §6).
   *
   * Deliberately the loading alert ONLY, not the error alert: each caller's
   * `catchError` merely turns the failure into a store action, so suppressing
   * the global error toast here would leave a failed stop-list load with no
   * visible symptom at all.
   *
   * Default `false` keeps the three non-modal callers (`ProvinceEffect`,
   * `DriverCashRatesStore`, `ParcelBookingPageComponent`) showing the spinner
   * they show today — this endpoint is their page's primary fetch, not a
   * background one.
   */
  getAll(skipLoadingAlert = false): Observable<ResponseAPI<StationApi[]>> {
    return this.http.get<ResponseAPI<StationApi[]>>(
      `${environment.apiUrl}/api/stops`,
      skipLoadingAlert
        ? { context: new HttpContext().set(SKIP_GLOBAL_LOADING_ALERT, true) }
        : {}
    );
  }
}
