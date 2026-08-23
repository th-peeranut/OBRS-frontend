import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../auth/auth.service';
import { AdminScheduleDto, parseAdminStatus } from '../../../../services/admin/admin-api.service';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';
import {
  bangkokInstantMs,
  controlValueToDateString,
  splitApiOffsetDateTime,
} from '../../../../shared/lib/api-date-time';
import { DriverSchedulesStore } from '../driver-schedules/driver-schedules.store';
import { StaffSchedulesStore } from '../staff-schedules/staff-schedules.store';

interface BoardingEntryRow {
  id: number;
  tripId: string;
  departure: string;
  route: string;
  vehicle: string;
  status: string;
  statusCode: string;
}

@Component({
    selector: 'app-boarding-entry-page',
    templateUrl: './boarding-entry-page.component.html',
    styleUrl: './boarding-entry-page.component.scss',
    standalone: false
})
export class BoardingEntryPageComponent implements OnInit, OnDestroy {
  protected rows: BoardingEntryRow[] = [];
  protected filteredRows: BoardingEntryRow[] = [];
  protected isLoading = false;
  // OBRS-33: this list used to render every schedule the store held, oldest
  // first, so the first row on prod was 19 days in the past. One day at a
  // time, today by default. Past days stay reachable (no `minDate`) — the
  // point is a default that is useful, not hiding history.
  protected selectedDate: Date | null = new Date();
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
    // View selection (not authorization): a driver sees only their own
    // assigned trips, while everyone else authorised for this page — a
    // salesperson, and an admin via the role hierarchy — sees the full
    // schedule. Check the *actual* driver role here rather than hasAnyRole
    // (which an admin satisfies for every role), so an admin lands on the full
    // schedule view instead of an empty driver view.
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
    return !this.isLoading && this.filteredRows.length === 0;
  }

  protected onDateChange(value: Date | null): void {
    this.selectedDate = value;
    this.applyFilter();
  }

  protected viewBoarding(row: BoardingEntryRow): void {
    void this.router.navigate(['/staff/boarding', row.id]);
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
    this.applyFilter();
  }

  private applyFilter(): void {
    // '' when no date is selected — then nothing is filtered out.
    const dayKey = controlValueToDateString(this.selectedDate);
    this.filteredRows = this.rows
      .filter((row) => !dayKey || splitApiOffsetDateTime(row.departure).date === dayKey)
      // Soonest departure first. A row whose departure cannot be parsed sorts
      // last rather than first: it cannot be the next trip to board.
      .sort(
        (a, b) =>
          (bangkokInstantMs(a.departure) ?? Number.MAX_SAFE_INTEGER) -
          (bangkokInstantMs(b.departure) ?? Number.MAX_SAFE_INTEGER)
      );
  }

  private get currentLocale(): string {
    const raw = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();
    return raw.startsWith('en') ? 'en' : 'th';
  }

  // Formats a raw backend ISO timestamp for display, in the current UI language.
  protected displayDateTime(value: string | null | undefined): string {
    return formatDisplayDateTime(value, this.currentLocale);
  }
}
