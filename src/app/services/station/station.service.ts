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

/**
 * Per-call opt-outs for `StationService.getAll()`. An OBJECT, not positional
 * booleans (OBRS-1222): there are two of them now, they are independent, and
 * `getAll(true, true)` says nothing at the call site about which is which.
 * Same shape `BookingService.getMyBookings({ showLoadingDialog, skipAuthLogout })`
 * already uses.
 *
 * Both default to `false` — i.e. to whatever `error.interceptor.ts` does on its
 * own. A caller opts out; the service never decides for anyone.
 */
export interface StationGetAllOptions {
  /** See the `getAll` docblock — OBRS-1056. */
  skipLoadingAlert?: boolean;
  /** See the `getAll` docblock — OBRS-1222. */
  skipErrorAlert?: boolean;
}

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
   * `skipErrorAlert` (OBRS-1222): opts out of the global SweetAlert2 ERROR
   * modal so the CALLER can render the failure where the customer is already
   * looking. Only `ProvinceEffect` passes it, and only because it ships a
   * replacement surface (`app-station-load-error`) in the same card.
   *
   * ⛔ NEITHER FLAG MAY EVER BECOME THE DEFAULT, and `skipErrorAlert` above all.
   * This method has three callers and they are not interchangeable: the other
   * two (`change-stop.effect.ts:77`, `reschedule.effect.ts:71`) run while a
   * customer is mid-change to a REAL ticket, and their `catchError` only writes
   * an error string into a dialog slice — suppressing the global error alert
   * for them would turn a failed stop-list load into no visible symptom at all.
   * That is the exact lie OBRS-642 was opened to remove. Make the decision at
   * the call site or not at all; `station.service.spec.ts` fails if this drifts.
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
  getAll(options: StationGetAllOptions = {}): Observable<ResponseAPI<StationApi[]>> {
    // Built unconditionally and only SET for the flags that were asked for.
    // An `HttpContext` with nothing in it is indistinguishable from no context
    // at all as far as the interceptor is concerned (every token falls back to
    // its `() => false` default), so there is no branch to keep in sync here.
    const context = new HttpContext();
    if (options.skipLoadingAlert) context.set(SKIP_GLOBAL_LOADING_ALERT, true);
    if (options.skipErrorAlert) context.set(SKIP_GLOBAL_ERROR_ALERT, true);

    return this.http.get<ResponseAPI<StationApi[]>>(
      `${environment.apiUrl}/api/stops`,
      { context }
    );
  }
}
