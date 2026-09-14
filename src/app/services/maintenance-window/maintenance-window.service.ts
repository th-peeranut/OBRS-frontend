import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, distinctUntilChanged, map, Observable, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { SKIP_GLOBAL_ERROR_ALERT } from '../../shared/interceptors/http-context-tokens';

/** The announcement as `GET /api/operations-policy` serves it (OBRS-1902). */
export interface MaintenanceWindow {
  startAt: string;
  endAt: string;
  paymentLockMinutesBefore: number;
  /** `startAt` minus the lock lead, computed by the backend so both sides gate on one answer. */
  paymentLockedFrom: string;
  messageTh: string;
  messageEn: string;
}

interface OperationsPolicyWithMaintenance {
  maintenanceWindow?: MaintenanceWindow | null;
}

/** What the banner renders. Built here, not in the component, so that every clock comparison in
 * this feature is taken against the same server-corrected `now`. */
export interface MaintenanceNoticeVm {
  window: MaintenanceWindow;
  /** The outage has begun: the banner stops counting down and starts saying "back at HH:MM". */
  started: boolean;
  /** Whole minutes left before it begins, `0` once it has. */
  minutesUntilStart: number;
}

/**
 * OBRS-1902 — the scheduled-downtime announcement, and the payment lock that goes with it.
 *
 * **Why this holds its own cache instead of just calling the API.** The announcement's entire job
 * is to still be on screen while the deploy it warns about is happening — that is, while the
 * backend is not answering. So every successful read is written to `localStorage`, and every
 * decision below is taken from that cached copy and the clock, never from a live request. A
 * customer who loaded the site at any point before the window is warned throughout it; one who
 * arrives mid-outage sees nothing, which is the honest limit of a frontend-only answer and the
 * reason a full maintenance page was NOT what the owner asked for (ruling 2026-09-14: banner plus
 * a disabled pay button, explicitly not option (c)).
 *
 * **Why the server's clock, not the browser's.** The lock opens and closes on timestamps the
 * server issued, so comparing them against a device clock that is minutes or hours off would
 * arm the gate at the wrong time — and the devices most likely to be wrong are exactly the cheap
 * phones this product sells to. So the offset between the response's `Date` header and
 * `Date.now()` is measured on each successful read and applied to every comparison afterwards.
 *
 * ⚠️ `Date` is NOT one of the seven CORS-safelisted response headers (those are `Cache-Control`,
 * `Content-Language`, `Content-Length`, `Content-Type`, `Expires`, `Last-Modified`, `Pragma`), and
 * the frontend and the API are separate origins in every deployed environment. It is readable here
 * only because `WebSecurityConfig#corsConfigurationSource` names it in `setExposedHeaders`
 * (OBRS-1902). If that ever changes, this silently falls back to the device clock rather than
 * failing — which is the right direction, but it is a fallback, not the design.
 */
@Injectable({
  providedIn: 'root',
})
export class MaintenanceWindowService {
  /** Re-evaluates the window against the clock. 30 s is well under a minute of countdown. */
  private static readonly TICK_MS = 30_000;
  /** How often to ask the backend again — a tab left open on the payment page must still learn
   * about an announcement posted after it loaded. */
  private static readonly REFRESH_MS = 5 * 60_000;
  private static readonly CACHE_KEY = 'obrs.maintenanceWindow';
  private static readonly OFFSET_KEY = 'obrs.maintenanceClockOffsetMs';

  private readonly cached$ = new BehaviorSubject<MaintenanceWindow | null>(this.readCache());
  private clockOffsetMs = this.readOffset();

  /** The announcement to show, or `null` once its window has ended. Re-emits on every tick even
   * when the window itself has not changed — the countdown inside it has. */
  readonly notice$: Observable<MaintenanceNoticeVm | null> = this.ticking((window) => {
    if (!window || this.hasEnded(window)) {
      return null;
    }
    const msUntilStart = Date.parse(window.startAt) - this.now();
    const started = msUntilStart <= 0;
    return {
      window,
      started,
      // Rounded, and never below 1 while the countdown is still running: `ceil` reported "6
      // minutes" for 5 min 0.3 s (the Date header has one-second precision, so the corrected
      // clock lands just off the mark), and `floor`/`round` alone would announce "in 0 minutes"
      // for the last half minute before the outage.
      minutesUntilStart: started ? 0 : Math.max(1, Math.round(msUntilStart / 60_000)),
    };
  });

  /** True from `paymentLockedFrom` until the window ends — the owner's "disable the pay button
   * during the countdown". Deduplicated: unlike the countdown, this answer only ever changes
   * twice, and a button that re-renders every 30 s for nothing is a button that flickers. */
  readonly paymentLocked$: Observable<boolean> = this.ticking(() =>
    this.isPaymentLockedNow()
  ).pipe(distinctUntilChanged());

  constructor(private readonly http: HttpClient) {}

  /**
   * Starts reading the announcement and keeps reading it. Called once from `AppComponent`; a
   * failed read is deliberately swallowed — the cached copy is the answer whenever the network
   * is not, which is the whole point.
   */
  start(): void {
    timer(0, MaintenanceWindowService.REFRESH_MS).subscribe(() => this.fetch());
  }

  private fetch(): void {
    const context = new HttpContext().set(SKIP_GLOBAL_ERROR_ALERT, true);

    this.http
      .get<ResponseAPI<OperationsPolicyWithMaintenance>>(
        `${environment.apiUrl}/api/operations-policy`,
        { context, observe: 'response' }
      )
      .subscribe({
        next: (response) => {
          const serverDate = Date.parse(response.headers.get('Date') ?? '');
          if (!Number.isNaN(serverDate)) {
            this.clockOffsetMs = serverDate - Date.now();
            this.write(MaintenanceWindowService.OFFSET_KEY, String(this.clockOffsetMs));
          }
          const window = response.body?.data?.maintenanceWindow ?? null;
          this.write(MaintenanceWindowService.CACHE_KEY, window ? JSON.stringify(window) : '');
          this.cached$.next(window);
        },
        error: () => {
          // Keep whatever is cached. An announcement that disappears the moment the backend
          // goes down is an announcement that is never on screen when it matters.
        },
      });
  }

  /**
   * The same answer as {@link paymentLocked$}, read synchronously. The two payment components
   * gate a button and an early return on it, and both already re-render once a second from their
   * own seat-hold countdown - so a getter costs two `Date.parse` calls per tick and saves them a
   * subscription each, plus the teardown that would have to be remembered alongside it.
   */
  isPaymentLockedNow(): boolean {
    const window = this.cached$.value;
    if (!window || this.hasEnded(window)) {
      return false;
    }
    return this.now() >= Date.parse(window.paymentLockedFrom);
  }

  /** Server time as this device can best estimate it. */
  private now(): number {
    return Date.now() + this.clockOffsetMs;
  }

  private hasEnded(window: MaintenanceWindow | null): boolean {
    return !window || this.now() >= Date.parse(window.endAt);
  }

  private ticking<T>(project: (window: MaintenanceWindow | null) => T): Observable<T> {
    return combineLatest([this.cached$, timer(0, MaintenanceWindowService.TICK_MS)]).pipe(
      map(([window]) => project(window))
    );
  }

  // localStorage is unavailable in private mode on some browsers and throws rather than
  // returning null. A visitor who cannot cache still gets a live banner; they just lose it if
  // the backend goes away first.
  private readCache(): MaintenanceWindow | null {
    try {
      const raw = localStorage.getItem(MaintenanceWindowService.CACHE_KEY);
      return raw ? (JSON.parse(raw) as MaintenanceWindow) : null;
    } catch {
      return null;
    }
  }

  private readOffset(): number {
    try {
      return Number(localStorage.getItem(MaintenanceWindowService.OFFSET_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  private write(key: string, value: string): void {
    try {
      if (value) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // See readCache.
    }
  }
}
