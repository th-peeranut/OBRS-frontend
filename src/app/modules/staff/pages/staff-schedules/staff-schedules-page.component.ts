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
  AdminUserDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
  CreateSchedulePayload,
  getAdminLookupLabel,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { combineBangkokDateTime } from '../../../../shared/lib/api-date-time';
import { StaffSchedulesStore } from './staff-schedules.store';

interface ScheduleRow {
  id: number;
  tripId: string;
  departure: string;
  route: string;
  routeSlug: string;
  vehicle: string;
  vehicleId: number | null;
  vehicleTypeSlug: string;
  driver: string;
  driverId: number | null;
  status: string;
  statusCode: string;
  updatedAt: string;
}

interface Option {
  code: string;
  label: string;
}

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
  private rawUsers: AdminUserDto[] = [];
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
          this.rawUsers = data.users;
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
    this.applyFormValues(this.toFallbackDto(row));
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
      const payload = this.toPayload();
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
    this.routeOptions = this.rawRoutes.map((r) => ({
      code: r.slug,
      label: getAdminLookupLabel(r, locale) ?? getAdminTranslationLabel(r.translations, locale) ?? r.slug,
    }));
    this.vehicleTypeOptions = this.rawVehicleTypes.map((vt) => ({
      code: vt.slug,
      label: getAdminLookupLabel(vt, locale) ?? getAdminTranslationLabel(vt.translations, locale) ?? vt.slug,
    }));
    this.vehicleOptions = this.rawVehicles.map((v) => ({
      code: String(v.id),
      label: v.vehicleNumber ?? v.numberPlate ?? `#${v.id}`,
    }));
    this.driverOptions = this.rawUsers
      .filter((u) =>
        (u.roles ?? []).some((role) => {
          const slug = typeof role === 'string' ? role : role.slug;
          return String(slug ?? '').trim().toLowerCase() === 'driver';
        })
      )
      .map((u) => ({
        code: String(u.id),
        label: u.fullName?.trim() || u.email?.trim() || `#${u.id}`,
      }));
    this.statusOptions = this.rawLookups
      .filter((l) => l.category === 'schedule_status')
      .map((l) => ({
        code: String(l.slug ?? '').trim().toLowerCase(),
        label: getAdminTranslationLabel(l.translations, locale) ?? l.slug,
      }));
    this.rows = this.rawSchedules.map((s) => this.toRow(s, locale));
    this.applyFilter();
  }

  private toRow(s: AdminScheduleDto, locale: string): ScheduleRow {
    const status = parseAdminStatus(s.status, locale);
    return {
      id: s.id,
      tripId: `#SCH-${s.id}`,
      departure: s.departureDateTime ?? '-',
      route: getAdminLookupLabel(s.route, locale) ?? getAdminTranslationLabel(s.route?.translations, locale) ?? s.route?.slug ?? '-',
      routeSlug: s.route?.slug ?? '',
      vehicle: s.vehicle?.vehicleNumber ?? s.vehicle?.numberPlate ?? '-',
      vehicleId: s.vehicle?.id ?? null,
      vehicleTypeSlug: s.vehicleType?.slug ?? '',
      driver: s.driver?.fullName ?? '-',
      driverId: s.driver?.id ?? null,
      status: status.name,
      statusCode: status.code,
      updatedAt: s.updatedAt ?? s.createdAt ?? '-',
    };
  }

  private toFallbackDto(row: ScheduleRow): AdminScheduleDto {
    return {
      id: row.id,
      departureDateTime: row.departure,
      status: row.statusCode,
      route: { id: 0, slug: row.routeSlug },
      vehicleType: { id: 0, slug: row.vehicleTypeSlug },
      vehicle: row.vehicleId ? { id: row.vehicleId, vehicleNumber: row.vehicle } : undefined,
      driver: row.driverId ? { id: row.driverId, fullName: row.driver } : undefined,
    };
  }

  private applyFormValues(dto: AdminScheduleDto, onlyPristine = false): void {
    const dep = this.splitDateTime(dto.departureDateTime);
    const values = {
      departureDate: this.toDateControlValue(dep.date),
      departureTime: this.toTimeControlValue(dep.time),
      route: dto.route?.slug ?? '',
      vehicleType: dto.vehicleType?.slug ?? '',
      vehicleId: dto.vehicle?.id ? String(dto.vehicle.id) : '',
      driverId: dto.driver?.id ? String(dto.driver.id) : '',
    };
    if (!onlyPristine) {
      this.scheduleItemForm.reset(values);
      return;
    }
    for (const [name, value] of Object.entries(values)) {
      const ctrl = this.scheduleItemForm.get(name);
      if (ctrl?.pristine) ctrl.setValue(value);
    }
  }

  private toPayload(): CreateSchedulePayload {
    const raw = this.scheduleItemForm.getRawValue();
    const departureDate = this.toDateInputValue(this.toDateValue(raw.departureDate));
    const departureTime = this.toTimeInputValue(this.toDateValue(raw.departureTime));
    const vehicleId = this.toOptionalNumber(raw.vehicleId);
    const driverId = this.toOptionalNumber(raw.driverId);
    return {
      departureDateTime: combineBangkokDateTime(departureDate, departureTime),
      route: String(raw.route ?? '').trim(),
      vehicleType: String(raw.vehicleType ?? '').trim(),
      ...(vehicleId !== undefined ? { vehicleId } : {}),
      ...(driverId !== undefined ? { driverId } : {}),
    };
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

  private splitDateTime(value: string | null | undefined): { date: string; time: string } {
    const v = String(value ?? '').trim();
    if (!v) return { date: '', time: '' };
    const [date, rawTime = ''] = v.includes('T') ? v.split('T') : v.split(/\s+/);
    return { date, time: rawTime.slice(0, 5) };
  }

  private toDateInputValue(value: Date | null): string {
    if (!value || !Number.isFinite(value.getTime())) return '';
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private toDateControlValue(dateStr: string | null | undefined): Date | null {
    const s = String(dateStr ?? '').trim();
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  private toTimeInputValue(value: Date | null): string {
    if (!value || !Number.isFinite(value.getTime())) return '';
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }

  private toTimeControlValue(timeStr: string | null | undefined): Date | null {
    const s = String(timeStr ?? '').trim().slice(0, 5);
    const [h, min] = s.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    const date = new Date();
    date.setHours(h, min, 0, 0);
    return date;
  }

  private toDateValue(value: unknown): Date | null {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    const s = String(value ?? '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return this.toDateControlValue(s);
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return this.toTimeControlValue(s);
    const p = new Date(s);
    return Number.isFinite(p.getTime()) ? p : null;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  private get currentLocale(): string {
    const raw = String(this.translate.currentLang || this.translate.getDefaultLang() || 'th').toLowerCase();
    return raw.startsWith('en') ? 'en' : 'th';
  }
}
