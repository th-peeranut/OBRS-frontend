import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { StationApi } from '../../shared/interfaces/station.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { ProvinceStopsApi } from '../../shared/lib/station-groups';

/**
 * Per-call opt-outs for `StationService.getAll()`. An OBJECT, not a positional
 * boolean (OBRS-1222): `getAll(true)` says nothing at the call site about which
 * behavior is being switched. Same shape `BookingService.getMyBookings()` uses.
 *
 * OBRS-908 removed the `skipLoadingAlert` flag that used to sit beside this one.
 * The blocking overlay is opt-in now and this lookup never opts in, so there is
 * nothing left to opt out of — see the `getAll` docblock.
 *
 * Defaults to `false` — i.e. to whatever `error.interceptor.ts` does on its own.
 * A caller opts out; the service never decides for anyone.
 */
export interface StationGetAllOptions {
  /** See the `getAll` docblock — OBRS-1222. */
  skipErrorAlert?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class StationService {
  /** Session-scoped dedup for `getProvincesWithStops()` — see that method. */
  private provincesWithStops$?: Observable<ResponseAPI<ProvinceStopsApi[]>>;

  constructor(private http: HttpClient) {}

  /**
   * OBRS-908 deleted the `skipLoadingAlert` flag this docblock used to open with.
   * It existed because `error.interceptor.ts` raised the blocking SweetAlert2
   * overlay for every `/api/` request, and a caller loading this lookup BEHIND an
   * already-open modal had to opt out or the overlay would land on top of the dialog
   * — it focuses itself and stops keydown propagation (sweetalert2 ships
   * `stopKeydownPropagation: true` + `keydownListenerCapture: false`), so the
   * dialog's own `document:keydown.escape` host listener never fired and Escape
   * silently did nothing. That whole class of collision is gone with the default:
   * a stop lookup is data a page fetches for itself, so it never raises the overlay
   * and no caller has to remember anything. The promise those effects make in their
   * own comments — "modals open optimistically, never gated on an awaited fetch"
   * (design-system §6) — is now what the interceptor does by default.
   *
   * `skipErrorAlert` (OBRS-1222): opts out of the global SweetAlert2 ERROR
   * modal so the CALLER can render the failure where the customer is already
   * looking. Only `ProvinceEffect` passes it, and only because it ships a
   * replacement surface (`app-station-load-error`) in the same card.
   *
   * ⛔ `skipErrorAlert` MAY NEVER BECOME THE DEFAULT.
   * This method has three callers and they are not interchangeable: the other
   * two (`change-stop.effect.ts:77`, `reschedule.effect.ts:71`) run while a
   * customer is mid-change to a REAL ticket, and their `catchError` only writes
   * an error string into a dialog slice — suppressing the global error alert
   * for them would turn a failed stop-list load into no visible symptom at all.
   * That is the exact lie OBRS-642 was opened to remove. Make the decision at
   * the call site or not at all; `station.service.spec.ts` fails if this drifts.
   *
   * ⚠️ OBRS-642 measured what the old overlay default cost on this very endpoint:
   * 2/10 public customer routes were blocked on page load (`/` and `/schedule-booking`,
   * both from this call), because a customer whose `/api/stops` stalls was locked out
   * of the booking form entirely. That is the measurement OBRS-908 generalized into
   * the interceptor's default rather than leaving as a per-caller flag.
   */
  getAll(options: StationGetAllOptions = {}): Observable<ResponseAPI<StationApi[]>> {
    // Built unconditionally and only SET for the flag that was asked for.
    // An `HttpContext` with nothing in it is indistinguishable from no context
    // at all as far as the interceptor is concerned (every token falls back to
    // its `() => false` default), so there is no branch to keep in sync here.
    const context = new HttpContext();
    if (options.skipErrorAlert) context.set(SKIP_GLOBAL_ERROR_ALERT, true);

    return this.http.get<ResponseAPI<StationApi[]>>(
      `${environment.apiUrl}/api/stops`,
      { context }
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
            .set(SKIP_GLOBAL_ERROR_ALERT, true),
        })
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.provincesWithStops$;
  }
}
