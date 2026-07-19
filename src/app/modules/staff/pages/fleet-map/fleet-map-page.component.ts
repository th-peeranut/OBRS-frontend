import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { FleetMapStore } from './fleet-map.store';
import { FleetPositionRespDto } from '../../../../services/staff/staff-api.service';
import { resolveFleetVehicleStatus } from '../../../../shared/lib/fleet-vehicle-status';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';
import { pollWhileVisible } from '../../../admin/shared/admin-auto-refresh';
import { environment } from '../../../../../environments/environment';
import { FLEET_MAP_POLL_INTERVAL_MS } from './fleet-map.constants';

/**
 * OBRS-424 — internal fleet live map (layer 1), smart page component.
 * Owns `FleetMapStore` (root-scoped SWR cache), polling, and teardown. See
 * UX-OBRS-424-fleet-live-map.md §9. No own `<h2>/<h3>` — the shell topbar
 * renders the title from route `data.titleKey`/`subtitleKey` (design-system §7).
 */
@Component({
  selector: 'app-fleet-map-page',
  templateUrl: './fleet-map-page.component.html',
  styleUrl: './fleet-map-page.component.scss',
})
export class FleetMapPageComponent implements OnInit, OnDestroy {
  protected vehicles: FleetPositionRespDto[] = [];
  protected isRefreshing = false;
  protected hasFailed = false;
  protected loadError = '';
  protected lastFetchedAt: Date | null = null;

  /** Read once and passed down — `environment.base.ts` ships an empty
   * string by default (§4.4); CI/every fresh clone always takes that path. */
  protected readonly maptilerKey = environment.maptilerKey;

  private readonly destroy$ = new Subject<void>();
  private pollSub: Subscription | null = null;

  constructor(
    private readonly store: FleetMapStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.vehicles = data ?? [];
    });
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isRefreshing = refreshing;
    });
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.hasFailed = failed;
      this.loadError = this.resolveLoadError(failed);
    });
    // OBRS-424 §9.5: honest "how old is the shown data" signal, independent
    // of data$'s replay-on-resubscribe (which would otherwise falsely claim
    // freshness on a stale re-entry).
    this.store.lastFetchedAt$.pipe(takeUntil(this.destroy$)).subscribe((t) => {
      this.lastFetchedAt = t;
    });

    void this.store.refresh(); // initial load
    this.pollSub = pollWhileVisible(() => void this.store.refresh(), FLEET_MAP_POLL_INTERVAL_MS);
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Loading (first load, no cache yet): the map still renders at the
   * default center (§8) — only the side-list panel shows a spinner. */
  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  /** Error with no cache to fall back on: LOAD_FAILED replaces the map area. */
  protected get contentState(): 'loading' | 'error' | 'data' {
    if (this.isLoading) {
      return 'loading';
    }
    if (this.loadError) {
      return 'error';
    }
    return 'data';
  }

  /** Day-one (every row NOT_TRACKED) and the defensive `rows.length === 0`
   * case share ONE banner (§8) — deliberately not the OBRS-209
   * full-section-empty-state pattern; the map/list stay visible underneath. */
  protected get showEmptyFleetBanner(): boolean {
    if (this.contentState !== 'data') {
      return false;
    }
    if (this.vehicles.length === 0) {
      return true;
    }
    return this.vehicles.every((v) => resolveFleetVehicleStatus(v) === 'NOT_TRACKED');
  }

  /** Error, cache exists: REFRESH_FAILED_BANNER alongside the last-known
   * map/list (§9.5) — sourced from lastFetchedAt$, never from the payload's
   * own `recordedAt` (that would conflate "our poll is failing" with "one
   * van's tracker is stale"). */
  protected get showRefreshFailedBanner(): boolean {
    return this.contentState === 'data' && this.hasFailed;
  }

  protected get refreshFailedTimeDisplay(): string {
    return this.lastFetchedAt
      ? formatDisplayDateTime(this.lastFetchedAt.toISOString(), this.translate.currentLang)
      : '';
  }

  // Server error backstop — no client-chosen input to validate on this page.
  private resolveLoadError(failed: boolean): string {
    if (!failed || this.store.hasValue) {
      return '';
    }
    return this.translate.instant('STAFF.FLEET_MAP.LOAD_FAILED');
  }
}
