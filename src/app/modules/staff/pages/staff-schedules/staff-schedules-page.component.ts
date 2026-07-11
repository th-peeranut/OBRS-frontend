import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRouteDto,
  AdminScheduleDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
  DriverDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';
import { StaffSchedulesStore } from './staff-schedules.store';
import {
  Option,
  ScheduleRow,
  toFallbackDto,
  toDriverOptions,
  toPayload,
  toRouteOptions,
  toRow,
  toScheduleFormValues,
  toScheduleStatusOptions,
  toVehicleOptions,
  toVehicleTypeOptions,
} from './staff-schedules-page.mappers';

@Component({
  selector: 'app-staff-schedules-page',
  templateUrl: './staff-schedules-page.component.html',
  styleUrl: './staff-schedules-page.component.scss',
})
export class StaffSchedulesPageComponent implements OnInit, OnDestroy {
  protected rows: ScheduleRow[] = [];
  protected filteredRows: ScheduleRow[] = [];
  protected routeOptions: Option[] = [];
  protected vehicleOptions: Option[] = [];
  protected driverOptions: Option[] = [];
  protected vehicleTypeOptions: Option[] = [];
  protected statusOptions: Option[] = [];

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected isEditDetailLoading = false;
  protected selectedRow: ScheduleRow | null = null;

  protected searchKeyword = '';
  protected selectedRouteFilter = '';
  protected selectedStatusFilter = '';

  protected readonly scheduleItemForm: FormGroup;
  private readonly subscriptions = new Subscription();

  private rawSchedules: AdminScheduleDto[] = [];
  private rawRoutes: AdminRouteDto[] = [];
  private rawVehicles: AdminVehicleDto[] = [];
  private rawVehicleTypes: AdminVehicleTypeDto[] = [];
  private rawDrivers: DriverDto[] = [];
  private rawLookups: AdminLookupDto[] = [];

  constructor(
    private readonly router: Router,
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    readonly store: StaffSchedulesStore
  ) {
    this.scheduleItemForm = this.formBuilder.group({
      departureDate: [null, [Validators.required]],
      departureTime: [null, [Validators.required]],
      route: ['', [Validators.required]],
      vehicleType: ['', [Validators.required]],
      vehicleId: [''],
      driverId: [''],
    });

    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => this.applyLocalization())
    );
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        if (data) {
          this.rawSchedules = data.schedules;
          this.rawRoutes = data.routes;
          this.rawVehicles = data.vehicles;
          this.rawVehicleTypes = data.vehicleTypes;
          this.rawDrivers = data.drivers;
          this.rawLookups = data.lookups;
          this.applyLocalization();
        }
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((r) => (this.isRefreshing = r))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        this.refreshFailed = failed && this.store.hasValue;
        if (failed && !this.store.hasValue) {
          this.errorMessage = this.translate.instant('STAFF.MESSAGES.LOAD_SCHEDULES_FAILED');
          this.rows = [];
          this.filteredRows = [];
        } else {
          this.errorMessage = '';
        }
      })
    );
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected openCreateModal(): void {
    this.isEditMode = false;
    this.selectedRow = null;
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    this.scheduleItemForm.reset({
      departureDate: now,
      departureTime: now,
      route: this.routeOptions[0]?.code ?? '',
      vehicleType: '', // design-system §3.1: start on placeholder, user picks explicitly
      vehicleId: '',
      driverId: '',
    });
    this.isFormModalOpen = true;
  }

  protected async openEditModal(row: ScheduleRow): Promise<void> {
    this.isEditMode = true;
    this.selectedRow = row;
    this.isEditDetailLoading = true;
    this.applyFormValues(toFallbackDto(row));
    this.isFormModalOpen = true;

    try {
      const response = await firstValueFrom(this.adminApiService.getScheduleById(row.id));
      const detail = response?.data ?? null;
      if (detail && this.isFormModalOpen && this.selectedRow?.id === row.id) {
        this.applyFormValues(detail, true);
      }
    } catch {
      // Keep fallback values
    } finally {
      if (this.isFormModalOpen && this.selectedRow?.id === row.id) {
        this.isEditDetailLoading = false;
      }
    }
  }

  protected closeFormModal(force = false): void {
    if (this.isSubmitting && !force) return;
    this.isFormModalOpen = false;
    this.isEditDetailLoading = false;
    this.selectedRow = null;
    this.scheduleItemForm.reset();
  }

  protected openDeleteModal(row: ScheduleRow): void {
    this.selectedRow = row;
    this.isDeleteModalOpen = true;
  }

  protected closeDeleteModal(force = false): void {
    if (this.isDeleting && !force) return;
    this.isDeleteModalOpen = false;
    this.selectedRow = null;
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.scheduleItemForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected async submitSchedule(): Promise<void> {
    if (this.scheduleItemForm.invalid) {
      this.scheduleItemForm.markAllAsTouched();
      await this.alertService.warning(this.translate.instant('STAFF.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = toPayload(this.scheduleItemForm.getRawValue());
      if (this.isEditMode && this.selectedRow) {
        await firstValueFrom(this.adminApiService.updateSchedule(this.selectedRow.id, payload));
        this.closeFormModal(true);
        const refresh = this.store.refresh();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
        await refresh;
      } else {
        await firstValueFrom(this.adminApiService.createSchedule(payload));
        this.closeFormModal(true);
        const refresh = this.store.refresh();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
        await refresh;
      }
    } catch (error) {
      this.closeFormModal(true);
      const message = extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  protected async confirmDelete(): Promise<void> {
    if (!this.selectedRow) return;
    this.isDeleting = true;
    try {
      const id = this.selectedRow.id;
      await firstValueFrom(this.adminApiService.deleteSchedule(id));
      this.store.mutate((d) => ({ ...d, schedules: d.schedules.filter((s) => s.id !== id) }));
      this.closeDeleteModal(true);
      const refresh = this.store.refresh();
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      await refresh;
    } catch (error) {
      this.closeDeleteModal(true);
      const message = extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isDeleting = false;
    }
  }

  protected viewBoarding(row: ScheduleRow): void {
    void this.router.navigate(['/staff/boarding', row.id]);
  }

  protected onSearchChange(value: string): void {
    this.searchKeyword = String(value ?? '');
    this.applyFilter();
  }

  protected onRouteFilterChange(value: string): void {
    this.selectedRouteFilter = String(value ?? '').trim().toLowerCase();
    this.applyFilter();
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatusFilter = String(value ?? '').trim().toLowerCase();
    this.applyFilter();
  }

  private applyLocalization(): void {
    const locale = this.currentLocale;
    this.routeOptions = toRouteOptions(this.rawRoutes, locale);
    this.vehicleTypeOptions = toVehicleTypeOptions(this.rawVehicleTypes, locale);
    this.vehicleOptions = toVehicleOptions(this.rawVehicles);
    this.driverOptions = toDriverOptions(this.rawDrivers);
    this.statusOptions = toScheduleStatusOptions(this.rawLookups, locale);
    this.rows = this.rawSchedules.map((s) => toRow(s, locale));
    this.applyFilter();
  }

  private applyFormValues(dto: AdminScheduleDto, onlyPristine = false): void {
    const values = toScheduleFormValues(dto);
    if (!onlyPristine) {
      this.scheduleItemForm.reset(values);
      return;
    }
    for (const [name, value] of Object.entries(values)) {
      const ctrl = this.scheduleItemForm.get(name);
      if (ctrl?.pristine) ctrl.setValue(value);
    }
  }

  private applyFilter(): void {
    const keyword = this.searchKeyword.trim().toLowerCase();
    const routeFilter = this.selectedRouteFilter;
    const statusFilter = this.selectedStatusFilter;
    this.filteredRows = this.rows.filter((row) => {
      if (routeFilter && row.routeSlug.toLowerCase() !== routeFilter) return false;
      if (statusFilter && row.statusCode.toLowerCase() !== statusFilter) return false;
      if (!keyword) return true;
      return [row.tripId, row.route, row.driver, row.vehicle].join(' ').toLowerCase().includes(keyword);
    });
  }

  private get currentLocale(): string {
    const raw = String(this.translate.currentLang || this.translate.getDefaultLang() || 'th').toLowerCase();
    return raw.startsWith('en') ? 'en' : 'th';
  }

  // Formats a raw backend ISO timestamp for display. Called from the template
  // (not at row-mapping time) so `row.departure` stays a raw ISO string — the
  // edit modal round-trips it back through toFallbackDto()/splitDateTime().
  protected displayDateTime(value: string | null | undefined): string {
    return formatDisplayDateTime(value, this.currentLocale);
  }
}
