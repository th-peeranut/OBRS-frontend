import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../auth/auth.service';
import { AdminScheduleDto, parseAdminStatus } from '../../../../services/admin/admin-api.service';
import { bangkokDayKey, formatDisplayDateTime } from '../../../../shared/lib/display-date-time';
import {
  bangkokInstantMs,
  controlValueToDateString,
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
  // OBRS-1584: non-null on purpose. There is always a day in effect, so there
  // is no state this page can reach that renders every trip ever created.
  protected selectedDate: Date = new Date();
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

  // OBRS-1584: PrimeNG hands us `null` for anything the input cannot parse —
  // an emptied field, but also every partial keystroke of a date being typed
  // (`parseValueFromString('')` → null → `updateModel(null)`). Keeping the day
  // already in effect covers both: the day window never lifts, and the model
  // reference is deliberately left untouched so no repaint is pushed back into
  // the input mid-typing, which is what would kill keyboard date entry.
  protected onDateChange(value: Date | null): void {
    if (value === null) return;
    this.selectedDate = value;
    this.applyFilter();
  }

  // OBRS-1584: the input can be left holding text that no longer describes the
  // day the rows are filtered by. Re-emit the date actually in effect on the
  // way out so the field and the list agree again.
  protected onDateBlur(): void {
    this.selectedDate = new Date(this.selectedDate);
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
    // OBRS-1584: unconditional. The "no day selected ⇒ keep every row" branch
    // that used to guard this line is the OBRS-33 symptom, one keystroke away.
    // OBRS-1585: the day is read off the same clock the date column prints
    // (Bangkok wall-clock), not off the raw string — a `Z` departure crosses
    // the day boundary and used to disappear from the day its own cell shows.
    const dayKey = controlValueToDateString(this.selectedDate);
    this.filteredRows = this.rows
      .filter((row) => bangkokDayKey(row.departure) === dayKey)
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
