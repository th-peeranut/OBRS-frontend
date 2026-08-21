import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { BankDto } from '../../shared/interfaces/bank.interface';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

@Injectable({
  providedIn: 'root',
})
export class BankService {
  /** Session-scoped dedup — see `getBanks()`. */
  private banks$?: Observable<BankDto[]>;

  constructor(private http: HttpClient) {}

  /**
   * OBRS-1463 (AC-1): the bank list behind the refund-destination picker, held
   * by the backend so there is exactly one of it — see `EThaiBank`.
   *
   * <p>Deduped per session in `banks$`, not per call: the list is a static
   * national registry, and up to three screens ask for it (the customer cancel
   * modal, the OWNER override modal, the counter cancel modal) plus the
   * manual-refund worklist that renders the codes those screens wrote. Same
   * `shareReplay({ refCount: false })` shape as
   * `StationService.getProvincesWithStops()`, for the same reason.
   *
   * <p>Both global alerts are suppressed: the callers render their own inline
   * "could not load the bank list" with a retry, inside a modal the customer is
   * already mid-way through. A second modal stacked over that one would be a
   * worse report of the same fault.
   */
  getBanks(): Observable<BankDto[]> {
    if (!this.banks$) {
      this.banks$ = this.http
        .get<ResponseAPI<BankDto[]>>(`${environment.apiUrl}/api/private/banks`, {
          context: new HttpContext()
            .set(SKIP_GLOBAL_LOADING_ALERT, true)
            .set(SKIP_GLOBAL_ERROR_ALERT, true),
        })
        .pipe(
          map((response) => response.data ?? []),
          shareReplay({ bufferSize: 1, refCount: false })
        );
    }
    return this.banks$;
  }

  /**
   * Drops the cached list so the next `getBanks()` re-requests it. Called only
   * by a user-visible retry: `shareReplay` replays the failure forever
   * otherwise, so without this a single blip would keep the picker broken for
   * the rest of the session.
   */
  resetCache(): void {
    this.banks$ = undefined;
  }
}
