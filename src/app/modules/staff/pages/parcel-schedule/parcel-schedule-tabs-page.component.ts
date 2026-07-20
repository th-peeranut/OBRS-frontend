import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../../auth/auth.service';
import { AdminScheduleDto } from '../../../../services/admin/admin-api.service';
import { bangkokInstantMs } from '../../../../shared/lib/api-date-time';
import { DriverSchedulesStore } from '../driver-schedules/driver-schedules.store';
import { StaffSchedulesStore } from '../staff-schedules/staff-schedules.store';

/** The two halves of one trip's parcel work. */
export type ParcelScheduleTab = 'verify' | 'handover';

const TABS: readonly ParcelScheduleTab[] = ['verify', 'handover'];

function isParcelScheduleTab(value: string | null): value is ParcelScheduleTab {
  return TABS.includes(value as ParcelScheduleTab);
}

/**
 * `/staff/parcels/schedule/:scheduleId` — both parcel jobs for ONE trip
 * (OBRS-574): _ตรวจรับ_ (verify boxes in, before departure) and _ส่งมอบ_
 * (hand them over, at the far end).
 *
 * <p>Holds no list logic of its own. The two existing smart pages are rendered
 * as-is, one per tab, and each still reads `scheduleId` off the route — which
 * is why they are placed here directly rather than behind a nested
 * `<router-outlet>`: this component's `ActivatedRoute` already carries the
 * param, so neither page needed a line changed to move under a tab. Only one is
 * in the DOM at a time, so switching tabs re-runs that page's `ngOnInit` and
 * re-fetches — correct on a screen where the other half of the job may have
 * been worked from another device between glances.
 *
 * <h3>Which tab opens</h3>
 * From the `tab` query param when it names one (that is how the legacy
 * `parcels/verify/:id` and `parcels/deliveries/:id` bookmarks land on the half
 * they used to be), otherwise derived from the schedule's departure time: not
 * yet departed → verify, departed → handover.
 *
 * <p>The derived case deliberately does NOT write itself into the URL. The
 * URL then keeps meaning "the parcel work for this trip", and re-opening it
 * tomorrow re-derives instead of reproducing whichever tab happened to be due
 * the first time.
 *
 * <p>Timezone: the comparison runs on absolute instants via
 * {@link bangkokInstantMs}, never on wall-clock components. An offset-less
 * `departureDateTime` — which this API does emit — would otherwise be read as
 * the viewer's local time, and prod/SIT run UTC, so the default would flip
 * seven hours off with nothing on screen looking wrong.
 */
@Component({
  selector: 'app-parcel-schedule-tabs-page',
  templateUrl: './parcel-schedule-tabs-page.component.html',
  styleUrl: './parcel-schedule-tabs-page.component.scss',
})
export class ParcelScheduleTabsPageComponent implements OnInit, OnDestroy {
  protected readonly tabs = TABS;
  protected activeTab: ParcelScheduleTab = 'verify';
  protected scheduleId = 0;

  /**
   * False until the opening tab is known. The template renders neither list
   * until then, so a derived default never shows the wrong half first and
   * swaps under the user's thumb once the schedule arrives — and never fires
   * that page's manifest fetch for nothing.
   */
  protected isTabResolved = false;

  private readonly destroy$ = new Subject<void>();
  private readonly isDriver: boolean;
  private readonly isSalesperson: boolean;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    authService: AuthService,
    private readonly driverSchedulesStore: DriverSchedulesStore,
    private readonly staffSchedulesStore: StaffSchedulesStore
  ) {
    this.isDriver = authService.getRoles().includes('driver');
    this.isSalesperson = authService.hasAnyRole(['salesperson']);
  }

  ngOnInit(): void {
    this.scheduleId = Number(this.route.snapshot.paramMap.get('scheduleId'));

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const requested = params.get('tab');
      if (isParcelScheduleTab(requested)) {
        this.activeTab = requested;
        this.isTabResolved = true;
      } else if (!this.isTabResolved) {
        this.resolveDefaultTab();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected selectTab(tab: ParcelScheduleTab): void {
    if (tab === this.activeTab) return;
    // replaceUrl: a tab switch is a change of view within one screen, not a
    // step the back button should have to walk through on the way out.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true,
    });
  }

  protected tabLabelKey(tab: ParcelScheduleTab): string {
    return tab === 'verify'
      ? 'STAFF.PARCEL_SCHEDULE.TAB.VERIFY'
      : 'STAFF.PARCEL_SCHEDULE.TAB.HANDOVER';
  }

  /**
   * Reads the trip out of whichever schedule store this role already uses (the
   * picker populated it moments ago; a legacy bookmark arrives cold and the
   * store refreshes). A trip this user cannot see, or one with no usable
   * departure time, falls back to verify — the earlier step, so the fallback
   * shows work that may still be pending rather than skipping past it.
   */
  private resolveDefaultTab(): void {
    if (this.isDriver) {
      this.driverSchedulesStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
        this.applyDerivedTab(data ?? []);
      });
      void this.driverSchedulesStore.refresh();
    } else if (this.isSalesperson) {
      this.staffSchedulesStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
        this.applyDerivedTab(data?.schedules ?? []);
      });
      void this.staffSchedulesStore.refresh();
    } else {
      this.isTabResolved = true;
    }
  }

  private applyDerivedTab(schedules: AdminScheduleDto[]): void {
    if (this.isTabResolved) return; // a tab query param won the race — leave it

    const schedule = schedules.find((s) => s.id === this.scheduleId);
    if (!schedule) {
      // Not `schedules.length === 0`: an empty first emission is the store's
      // pre-fetch state, and resolving on it would decide the tab before the
      // data that decides it has arrived.
      if (schedules.length === 0) return;
      this.isTabResolved = true;
      return;
    }

    const departure = bangkokInstantMs(schedule.departureDateTime);
    this.activeTab = departure !== null && departure <= Date.now() ? 'handover' : 'verify';
    this.isTabResolved = true;
  }
}
