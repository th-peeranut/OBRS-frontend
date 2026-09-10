import { Component, HostListener, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { TripTrackService } from '../../../../services/trip-track/trip-track.service';
import { pollWhileVisible } from '../../../admin/shared/admin-auto-refresh';
import { resolveTripTrackView, TRIP_TRACK_POLL_ACTIVE_MS, TripTrackView } from '../../../../shared/lib/trip-track-view';

/** Named once because it is now read from two places — the 403/404 handler and
 * the language-change re-translation (OBRS-1096). */
const UNAVAILABLE_KEY = 'MY_BOOKINGS.TRIP_TRACK.ERROR.UNAVAILABLE';

/**
 * C1 (SPEC-OBRS-426) — smart panel owning polling, HTTP, error state, and
 * lane switching (BR-16: no state is terminal; polling stops ONLY on
 * `ngOnDestroy`, or a 403/404 — BR-18). Renders as a sibling of
 * `app-e-ticket-card` inside the my-bookings ticket modal, one instance per
 * journey leg with an eligible ticket (BR-2/BR-4).
 */
@Component({
    selector: 'app-trip-track-panel',
    templateUrl: './trip-track-panel.component.html',
    styleUrl: './trip-track-panel.component.scss',
    standalone: false
})
export class TripTrackPanelComponent implements OnChanges, OnDestroy {
  @Input() ticketId!: number;
  @Input() boardingStopLabel = '';
  @Input() boardingStopLat: number | null = null;
  @Input() boardingStopLon: number | null = null;

  view: TripTrackView | null = null;
  loading = true;
  refreshFailed = false;
  errorText: string | null = null;

  /** Read once, passed to the child map — `environment.base.ts` ships an
   * empty string by default (BR-23); CI/every fresh clone always takes that path. */
  readonly maptilerKey = environment.maptilerKey;

  private readonly destroy$ = new Subject<void>();
  private pollSub: Subscription | null = null;
  private pollIntervalMs = TRIP_TRACK_POLL_ACTIVE_MS;

  constructor(
    private readonly tripTrackService: TripTrackService,
    private readonly translate: TranslateService
  ) {
    // OBRS-1096 — `errorText` is a plain field holding an already-translated
    // string, so no template binding re-renders it. Unlike the fleet map
    // (OBRS-1082), no later poll tick repairs it either: the only path that
    // sets it calls `stopPolling()` (BR-18), so without this the customer who
    // switches language to understand the error keeps reading the old one
    // until a full page reload.
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.errorText) {
        this.errorText = this.translate.instant(UNAVAILABLE_KEY);
      }
    });
  }

  get canShowMap(): boolean {
    return !!this.maptilerKey;
  }

  /** Reuses the existing `.admin-status.is-*` chip tokens (design-system §12
   * "Cross-shell status-chip reuse") — byte-identical markup/classes to the
   * staff/admin surfaces; only the CSS custom-property VALUES are
   * re-declared, at this component's own :host. */
  chipStatusClass(state: TripTrackView['state']): string {
    switch (state) {
      case 'LIVE':
        return 'is-success';
      case 'STALE':
        return 'is-warning';
      case 'NO_SIGNAL':
        return 'is-warning';
      case 'NOT_YET_OPEN':
        return 'is-info';
      case 'CLOSED':
        return 'is-neutral';
      case 'UNAVAILABLE':
      default:
        return 'is-neutral';
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ticketId'] && this.ticketId) {
      this.loading = this.view === null;
      this.errorText = null;
      // Establish the active-lane baseline BEFORE calling load() — not
      // after. A real HTTP call always resolves asynchronously, so the
      // ordering wouldn't matter there, but a synchronous mock (every test
      // in this file) resolves load() inline: calling startPolling(ACTIVE)
      // AFTER load() would silently stomp the correct idle-lane subscription
      // applyLane() just established from the first response (e.g. an
      // already-CLOSED ticket), starving it into the wrong cadence from the
      // very first tick. Calling it first makes the response's own
      // applyLane() — whenever it actually runs — the ONLY authority on the
      // final lane, matching real async behaviour exactly.
      this.startPolling(TRIP_TRACK_POLL_ACTIVE_MS);
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** BR-17. The event fires on BOTH transitions — the guard is load-bearing:
   * without it, backgrounding the tab would itself issue a request.
   *
   * `errorText` is the SECOND load-bearing half of that guard (Scrutinize
   * self-fix): a 403/404 called `stopPolling()` because BR-18 says neither is
   * recoverable by retrying, but without this check every tab switch back
   * would call `load()` AND `startPolling()`, resurrecting an endless 60s
   * poll against a ticket that will 403 forever — including an IDOR probe's
   * own 403, retried once a minute for as long as the modal stays open. */
  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.hidden || this.errorText) {
      return;
    }
    this.load();
    // Re-phase from the last real fetch — without this, returning near the
    // end of a cycle fires two requests one second apart (BR-17).
    this.startPolling(this.pollIntervalMs);
  }

  private load(): void {
    this.tripTrackService
      .getVehiclePosition(this.ticketId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.loading = false;
          this.refreshFailed = false;
          if (response?.data) {
            this.view = resolveTripTrackView(response.data, this.translate.currentLang);
            this.applyLane(this.view.pollIntervalMs);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.loading = false;
          if (err.status === 403 || err.status === 404) {
            // BR-18: byte-identical copy for both — neither is recoverable by
            // retrying, and a friendlier 404 vs 403 message would be a
            // working ticket-existence oracle for an IDOR probe.
            this.errorText = this.translate.instant(UNAVAILABLE_KEY);
            this.stopPolling();
            return;
          }
          // BR-20: network failure / 5xx — keep the last rendered state on
          // screen, surface the transient strip, keep polling (the next tick
          // recovers). A genuine 401 is handled by the app's global auth
          // interceptor (SKIP_AUTH_LOGOUT is not set — BR-19), not here.
          this.refreshFailed = true;
        },
      });
  }

  /** Restarts the interval, so the cadence is always phased from the last
   * real fetch (BR-17). Idempotent — never stacks two intervals. */
  private startPolling(intervalMs: number): void {
    this.stopPolling();
    this.pollIntervalMs = intervalMs;
    this.pollSub = pollWhileVisible(() => this.load(), intervalMs);
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  /** Called after every successful load with the resolver's lane for the NEW
   * state. Rebuilds the interval ONLY when the lane actually changed —
   * calling `startPolling()` unconditionally after every load would reset the
   * timer on every tick, so a poll would never actually fire again (BR-15 #6). */
  private applyLane(intervalMs: number): void {
    if (intervalMs !== this.pollIntervalMs || !this.pollSub) {
      this.startPolling(intervalMs);
    }
  }
}
