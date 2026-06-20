import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AdminScheduleDto, parseAdminStatus } from '../../../../services/admin/admin-api.service';
import { DriverSchedulesStore } from './driver-schedules.store';

interface DriverScheduleRow {
  id: number;
  tripId: string;
  departure: string;
  route: string;
  vehicle: string;
  status: string;
  statusCode: string;
}

@Component({
  selector: 'app-driver-schedules-page',
  templateUrl: './driver-schedules-page.component.html',
  styleUrl: './driver-schedules-page.component.scss',
})
export class DriverSchedulesPageComponent implements OnInit, OnDestroy {
  protected rows: DriverScheduleRow[] = [];
  protected isRefreshing = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });

  private rawSchedules: AdminScheduleDto[] = [];
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly router: Router,
    private readonly translate: TranslateService,
    readonly store: DriverSchedulesStore
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        this.rawSchedules = data ?? [];
        this.buildRows();
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((r) => (this.isRefreshing = r))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        if (failed && !this.store.hasValue) {
          this.errorMessage = this.translate.instant('STAFF.MESSAGES.LOAD_MY_SCHEDULES_FAILED');
        } else {
          this.errorMessage = '';
        }
      })
    );
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => this.buildRows())
    );
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected get isEmpty(): boolean {
    return !this.isLoading && this.rows.length === 0 && !this.errorMessage;
  }

  protected viewBoarding(row: DriverScheduleRow): void {
    void this.router.navigate(['/staff/boarding', row.id]);
  }

  private buildRows(): void {
    this.rows = this.rawSchedules.map((s) => {
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
    const raw = String(this.translate.currentLang || this.translate.getDefaultLang() || 'th').toLowerCase();
    return raw.startsWith('en') ? 'en' : 'th';
  }
}
