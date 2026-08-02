import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../auth/auth.service';
import { AdminScheduleDto, parseAdminStatus } from '../../../../services/admin/admin-api.service';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';
import { DriverSchedulesStore } from '../driver-schedules/driver-schedules.store';
import { StaffSchedulesStore } from '../staff-schedules/staff-schedules.store';

interface ParcelScheduleRow {
  id: number;
  tripId: string;
  departure: string;
  route: string;
  vehicle: string;
  status: string;
  statusCode: string;
}

/**
 * `/staff/parcels/schedule` — the ONE schedule picker for parcel work
 * (OBRS-574).
 *
 * It replaces two pickers that were identical apart from where their row
 * button navigated: `ParcelVerifyEntryPageComponent` (OBRS-416) and
 * `ParcelDeliveryEntryPageComponent` (OBRS-305). Verifying boxes in and handing
 * them over are two moments of the SAME trip, so a driver working one trip was
 * picking that trip twice per run and had to know which menu the current moment
 * belonged to. Now the trip is chosen once and the moment is a tab
 * ({@link ParcelScheduleTabsPageComponent}).
 *
 * The near-duplication those two pages documented as deliberate is what this
 * page collapses; the remaining shape (driver/salesperson schedule-source
 * split, row shape, empty/loading states) still mirrors
 * `BoardingEntryPageComponent`, which serves a different job on the same trip
 * and is deliberately left alone.
 */
@Component({
    selector: 'app-parcel-schedule-entry-page',
    templateUrl: './parcel-schedule-entry-page.component.html',
    styleUrl: './parcel-schedule-entry-page.component.scss',
    standalone: false
})
export class ParcelScheduleEntryPageComponent implements OnInit, OnDestroy {
  protected rows: ParcelScheduleRow[] = [];
  protected isLoading = false;
  protected readonly skeletonRows = Array.from({ length: 4 });

  private readonly subscriptions = new Subscription();
  private readonly isDriver: boolean;
  private readonly isSalesperson: boolean;

  constructor(
    private readonly router: Router,
    private readonly translate: TranslateService,
    private readonly authService: AuthService,
    private readonly driverSchedulesStore: DriverSchedulesStore,
    private readonly staffSchedulesStore: StaffSchedulesStore
  ) {
    this.isDriver = this.authService.getRoles().includes('driver');
    this.isSalesperson = this.authService.hasAnyRole(['salesperson']);
  }

  ngOnInit(): void {
    if (this.isDriver) {
      this.subscriptions.add(
        this.driverSchedulesStore.data$.subscribe((data) => {
          this.buildRows(data ?? []);
        })
      );
      this.subscriptions.add(
        this.driverSchedulesStore.refreshing$.subscribe((r) => (this.isLoading = r))
      );
      void this.driverSchedulesStore.refresh();
    } else if (this.isSalesperson) {
      this.subscriptions.add(
        this.staffSchedulesStore.data$.subscribe((data) => {
          this.buildRows(data?.schedules ?? []);
        })
      );
      this.subscriptions.add(
        this.staffSchedulesStore.refreshing$.subscribe((r) => (this.isLoading = r))
      );
      void this.staffSchedulesStore.refresh();
    }

    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        const raw = this.isDriver
          ? (this.driverSchedulesStore.value ?? [])
          : (this.staffSchedulesStore.value?.schedules ?? []);
        this.buildRows(raw);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected get isEmpty(): boolean {
    return !this.isLoading && this.rows.length === 0;
  }

  /**
   * No `tab` query param on purpose: arriving from this picker is exactly the
   * case where the merged page should work out which half of the job is due,
   * from the schedule's departure time. Pinning a tab here would override that
   * for every arrival and leave the derivation reachable only from a legacy
   * bookmark.
   */
  protected viewSchedule(row: ParcelScheduleRow): void {
    void this.router.navigate(['/staff/parcels/schedule', row.id]);
  }

  private buildRows(schedules: AdminScheduleDto[]): void {
    this.rows = schedules.map((s) => {
      const status = parseAdminStatus(s.status, this.currentLocale);
      return {
        id: s.id,
        tripId: `#SCH-${s.id}`,
        departure: s.departureDateTime ?? '-',
        route: s.route?.slug ?? '-',
        vehicle: s.vehicle?.vehicleNumber ?? s.vehicle?.numberPlate ?? '-',
        status: status.name,
        statusCode: status.code,
      };
    });
  }

  private get currentLocale(): string {
    const raw = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();
    return raw.startsWith('en') ? 'en' : 'th';
  }

  protected displayDateTime(value: string | null | undefined): string {
    return formatDisplayDateTime(value, this.currentLocale);
  }
}
