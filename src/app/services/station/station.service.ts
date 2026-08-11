import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { StationApi } from '../../shared/interfaces/station.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { ProvinceStopsApi } from '../../shared/lib/station-groups';

@Injectable({
  providedIn: 'root',
})
export class StationService {
  /** Session-scoped dedup for `getProvincesWithStops()` — see that method. */
  private provincesWithStops$?: Observable<ResponseAPI<ProvinceStopsApi[]>>;

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
   * ⚠️ CORRECTED BY OBRS-642. This used to add: "Default `false` keeps the three
   * non-modal callers (`ProvinceEffect`, `DriverCashRatesStore`,
   * `ParcelBookingPageComponent`) showing the spinner they show today — this endpoint
   * is their page's primary fetch, not a background one." Being the page's primary
   * fetch is an argument for showing progress, not for a modal that covers the page and
   * cannot be dismissed: `ProvinceEffect` is the HOME page's station lookup, and a
   * customer whose `/api/stops` stalls is locked out of the booking form entirely
   * (measured: 2/10 public customer routes blocked on page load, `/` and
   * `/schedule-booking`, both from this call). `ProvinceEffect` now passes `true`.
   *
   * Default `false` remains for the other two, which are admin/parcel surfaces this card
   * did not measure — flip them when someone measures them, not on the strength of this
   * sentence.
   */
  getAll(skipLoadingAlert = false): Observable<ResponseAPI<StationApi[]>> {
    return this.http.get<ResponseAPI<StationApi[]>>(
      `${environment.apiUrl}/api/stops`,
      skipLoadingAlert
        ? { context: new HttpContext().set(SKIP_GLOBAL_LOADING_ALERT, true) }
        : {}
    );
  }

  /**
   * OBRS-1212: which province each stop belongs to, plus the province's own
   * translated name — the only thing `/api/stops` cannot answer (`StationApi`
   * carries no province, route or region field).
   *
   * <p>Deduped per session in `provincesWithStops$`, not per call: `/home`
   * builds the origin and the destination dropdown from one roster, and the
   * grouping is the same for both.
   *
   * <p>Both global alerts are suppressed, and this is the one endpoint here
   * where suppressing the ERROR alert is right: the caller degrades a failure to
   * "render the dropdown ungrouped", which is exactly today's screen. Letting
   * `error.interceptor.ts` raise a modal over a booking form that is about to
   * work perfectly well would report a fault the customer does not have — the
   * same reasoning `RouteMapService.selfHandledContext()` applies to the route
   * lookups this page already makes.
   */
  getProvincesWithStops(): Observable<ResponseAPI<ProvinceStopsApi[]>> {
    if (!this.provincesWithStops$) {
      this.provincesWithStops$ = this.http
        .get<ResponseAPI<ProvinceStopsApi[]>>(`${environment.apiUrl}/api/provinces/stops`, {
          context: new HttpContext()
            .set(SKIP_GLOBAL_LOADING_ALERT, true)
            .set(SKIP_GLOBAL_ERROR_ALERT, true),
        })
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.provincesWithStops$;
  }
}
