import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRouteDto,
  AdminScheduleDto,
  AdminScheduleSetDto,
  AdminStatusDto,
  AdminTranslationCollection,
  AdminVehicleTypeDto,
  CreateScheduleSetPayload,
  getAdminLookupLabel,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';

interface ScheduleRow {
  kind: 'set' | 'schedule';
  id: number;
  tripId: string;
  dateRange: string;
  startDate: string;
  endDate: string;
  departureTimes: string;
  routeSlug: string;
  route: string;
  vehicleTypeSlug: string;
  vehicle: string;
  frequency: string;
  status: string;
  statusCode: string;
  updatedAt: string;
}

interface Option {
  code: string;
  label: string;
}

@Component({
  selector: 'app-schedules-page',
  templateUrl: './schedules-page.component.html',
  styleUrl: './schedules-page.component.scss',
})
export class SchedulesPageComponent implements OnInit, OnDestroy {
  protected schedules: ScheduleRow[] = [];
  protected filteredSchedules: ScheduleRow[] = [];
  protected routeOptions: Option[] = [];
  protected vehicleTypeOptions: Option[] = [];
  protected statusOptions: Option[] = [];
  protected readonly frequencyOptions: Option[] = [
    { code: 'Daily', label: 'Daily' },
    { code: 'Weekly', label: 'Weekly' },
    { code: 'Monthly', label: 'Monthly' },
  ];

  protected selectedRouteFilter = '';
  protected selectedStatusFilter = '';
  protected selectedDateFilter: Date | null = null;
  protected searchKeyword = '';

  protected isLoading = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isGenerating = false;
  protected isLanguageChanging = false;
  protected isEditMode = false;
  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected departureTimesInvalid = false;
  protected errorMessage = '';
  protected selectedSchedule: ScheduleRow | null = null;

  protected readonly scheduleForm: FormGroup;
  private readonly languageSubscription: Subscription;
  private readonly languageLoadingMinimumMs = 1000;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.scheduleForm = this.formBuilder.group({
      startDate: ['', [Validators.required]],
      endDate: ['', [Validators.required]],
      departureTimesText: ['', [Validators.required]],
      frequency: ['Daily', [Validators.required]],
      status: ['', [Validators.required]],
      route: ['', [Validators.required]],
      vehicleType: ['', [Validators.required]],
    });

    this.languageSubscription = this.translate.onLangChange.subscribe(() => {
      void this.reloadForLanguageChange();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadScheduleSets();
  }

  ngOnDestroy(): void {
    this.languageSubscription.unsubscribe();
  }

  protected get totalSchedules(): number {
    return this.schedules.length;
  }

  protected get activeScheduleSets(): number {
    return this.schedules.filter((schedule) => schedule.statusCode === 'scheduled').length;
  }

  protected get totalDepartures(): number {
    return this.schedules.reduce((total, schedule) => {
      return total + schedule.departureTimes.split(',').filter((time) => time.trim()).length;
    }, 0);
  }

  protected statusClass(status: string): string {
    const normalizedStatus = status.trim().toUpperCase();

    if (normalizedStatus === 'DEPARTED') {
      return 'is-success';
    }

    if (normalizedStatus === 'SCHEDULED') {
      return 'is-warning';
    }

    return 'is-danger';
  }

  protected onSearchKeywordChange(value: string): void {
    this.searchKeyword = String(value ?? '');
    this.applyFilters();
  }

  protected onDateFilterChange(value: Date | null): void {
    this.selectedDateFilter = value;
    this.applyFilters();
  }

  protected onRouteFilterChange(value: string): void {
    this.selectedRouteFilter = String(value ?? '').trim().toLowerCase();
    this.applyFilters();
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatusFilter = String(value ?? '').trim().toLowerCase();
    this.applyFilters();
  }

  protected openCreateModal(): void {
    this.isEditMode = false;
    this.selectedSchedule = null;
    this.departureTimesInvalid = false;

    const today = this.getTodayDateInputValue();
    this.scheduleForm.reset({
      startDate: today,
      endDate: today,
      departureTimesText: '08:00',
      frequency: 'Daily',
      status: this.statusOptions[0]?.code ?? 'scheduled',
      route: this.routeOptions[0]?.code ?? '',
      vehicleType: this.vehicleTypeOptions[0]?.code ?? '',
    });

    this.isFormModalOpen = true;
  }

  protected async openEditModal(schedule: ScheduleRow): Promise<void> {
    if (schedule.kind !== 'set') {
      return;
    }

    let detail: AdminScheduleSetDto | null = null;
    try {
      const response = await firstValueFrom(this.adminApiService.getScheduleSetById(schedule.id));
      detail = response?.data ?? null;
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.LOAD_SCHEDULES_FAILED'));
      return;
    }

    const scheduleSet = detail ?? this.toScheduleSetFallback(schedule);
    const status = this.parseStatus(scheduleSet.status);

    this.isEditMode = true;
    this.selectedSchedule = schedule;
    this.departureTimesInvalid = false;
    this.scheduleForm.reset({
      startDate: scheduleSet.startDate ?? schedule.startDate,
      endDate: scheduleSet.endDate ?? schedule.endDate,
      departureTimesText: this.toDepartureTimesText(scheduleSet.departureTimes),
      frequency: scheduleSet.frequency ?? schedule.frequency,
      status: status.code,
      route: scheduleSet.route?.slug ?? schedule.routeSlug,
      vehicleType: scheduleSet.vehicleType?.slug ?? schedule.vehicleTypeSlug,
    });
    this.isFormModalOpen = true;
  }

  protected closeFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isFormModalOpen = false;
    this.selectedSchedule = null;
    this.departureTimesInvalid = false;
    this.scheduleForm.reset();
  }

  protected openDeleteModal(schedule: ScheduleRow): void {
    this.selectedSchedule = schedule;
    this.isDeleteModalOpen = true;
  }

  protected closeDeleteModal(force = false): void {
    if (this.isDeleting && !force) {
      return;
    }

    this.isDeleteModalOpen = false;
    this.selectedSchedule = null;
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.scheduleForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected hasDateRangeError(): boolean {
    const startDate = String(this.scheduleForm.value['startDate'] ?? '');
    const endDate = String(this.scheduleForm.value['endDate'] ?? '');
    return !!startDate && !!endDate && startDate > endDate;
  }

  protected async submitScheduleSet(): Promise<void> {
    this.departureTimesInvalid = false;
    if (this.scheduleForm.invalid || this.hasDateRangeError()) {
      this.scheduleForm.markAllAsTouched();
      return;
    }

    const payload = this.toSchedulePayload();
    if (payload.departureTimes.length === 0) {
      this.departureTimesInvalid = true;
      this.scheduleForm.get('departureTimesText')?.markAsTouched();
      return;
    }

    this.isSubmitting = true;
    try {
      if (this.isEditMode && this.selectedSchedule) {
        await firstValueFrom(
          this.adminApiService.updateScheduleSet(this.selectedSchedule.id, payload)
        );
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createScheduleSet(payload));
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      this.closeFormModal(true);
      await this.loadScheduleSets();
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED'));
    } finally {
      this.isSubmitting = false;
    }
  }

  protected async confirmDelete(): Promise<void> {
    if (!this.selectedSchedule) {
      return;
    }

    this.isDeleting = true;
    try {
      if (this.selectedSchedule.kind === 'schedule') {
        await firstValueFrom(this.adminApiService.deleteSchedule(this.selectedSchedule.id));
      } else {
        await firstValueFrom(this.adminApiService.deleteScheduleSet(this.selectedSchedule.id));
      }
      this.closeDeleteModal(true);
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      await this.loadScheduleSets();
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED'));
    } finally {
      this.isDeleting = false;
    }
  }

  protected async generateSchedules(schedule: ScheduleRow): Promise<void> {
    this.isGenerating = true;
    try {
      await firstValueFrom(this.adminApiService.generateSchedulesFromSet(schedule.id));
      await this.alertService.success(this.translate.instant('ADMIN.SCHEDULES.GENERATE_SUCCESS'));
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.SCHEDULES.GENERATE_FAILED'));
    } finally {
      this.isGenerating = false;
    }
  }

  private async loadScheduleSets(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    const currentLocale = this.getCurrentLocale();

    try {
      const [
        scheduleSetsResponse,
        generatedSchedulesResponse,
        routesResponse,
        vehicleTypesResponse,
        lookupsResponse,
      ] =
        await Promise.all([
          firstValueFrom(this.adminApiService.getScheduleSets()),
          firstValueFrom(this.adminApiService.getSchedules()),
          firstValueFrom(this.adminApiService.getRoutes()),
          firstValueFrom(this.adminApiService.getVehicleTypes()),
          firstValueFrom(this.adminApiService.getLookups()),
        ]);

      const scheduleSets = scheduleSetsResponse?.data ?? [];
      const generatedSchedules = generatedSchedulesResponse?.data ?? [];
      const routes = routesResponse?.data ?? [];
      const vehicleTypes = vehicleTypesResponse?.data ?? [];
      const lookups = lookupsResponse?.data ?? [];

      this.routeOptions = this.toRouteOptions(routes, currentLocale);
      this.vehicleTypeOptions = this.toVehicleTypeOptions(vehicleTypes, currentLocale);
      this.statusOptions = this.toScheduleStatusOptions(lookups);
      this.schedules =
        scheduleSets.length > 0
          ? scheduleSets.map((scheduleSet) => this.toScheduleRow(scheduleSet))
          : generatedSchedules.map((schedule) => this.toGeneratedScheduleRow(schedule));
      this.syncFiltersWithAvailableOptions();
      this.applyFilters();
    } catch {
      this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_SCHEDULES_FAILED');
      this.schedules = [];
      this.filteredSchedules = [];
    } finally {
      this.isLoading = false;
    }
  }

  private async reloadForLanguageChange(): Promise<void> {
    this.isLanguageChanging = true;

    try {
      await Promise.all([
        this.loadScheduleSets(),
        this.waitForLanguageLoadingMinimum(),
      ]);
    } finally {
      this.isLanguageChanging = false;
    }
  }

  private waitForLanguageLoadingMinimum(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, this.languageLoadingMinimumMs);
    });
  }

  private toSchedulePayload(): CreateScheduleSetPayload {
    const raw = this.scheduleForm.getRawValue();

    return {
      startDate: String(raw.startDate ?? '').trim(),
      endDate: String(raw.endDate ?? '').trim(),
      departureTimes: this.parseDepartureTimes(raw.departureTimesText),
      frequency: String(raw.frequency ?? 'Daily').trim() || undefined,
      status: String(raw.status ?? '').trim().toLowerCase(),
      route: String(raw.route ?? '').trim(),
      vehicleType: String(raw.vehicleType ?? '').trim(),
    };
  }

  private toScheduleRow(scheduleSet: AdminScheduleSetDto): ScheduleRow {
    const currentLocale = this.getCurrentLocale();
    const routeName =
      getAdminLookupLabel(scheduleSet.route, currentLocale) ??
      this.getTranslationLabel(scheduleSet.route?.translations, currentLocale) ??
      scheduleSet.route?.slug ??
      '-';
    const vehicleTypeName =
      getAdminLookupLabel(scheduleSet.vehicleType, currentLocale) ??
      this.getTranslationLabel(scheduleSet.vehicleType?.translations, currentLocale) ??
      scheduleSet.vehicleType?.slug ??
      '-';
    const status = this.parseStatus(scheduleSet.status);
    const startDate = scheduleSet.startDate ?? '';
    const endDate = scheduleSet.endDate ?? '';

    return {
      id: scheduleSet.id,
      kind: 'set',
      tripId: `#SET-${scheduleSet.id}`,
      dateRange: `${this.formatDateForDisplay(startDate)} to ${this.formatDateForDisplay(endDate)}`,
      startDate,
      endDate,
      departureTimes: this.toDepartureTimesText(scheduleSet.departureTimes),
      routeSlug: scheduleSet.route?.slug ?? '',
      route: routeName,
      vehicleTypeSlug: scheduleSet.vehicleType?.slug ?? '',
      vehicle: vehicleTypeName,
      frequency: scheduleSet.frequency ?? '-',
      status: status.name,
      statusCode: status.code,
      updatedAt: this.formatDateTime(scheduleSet.updatedAt ?? scheduleSet.createdAt),
    };
  }

  private toGeneratedScheduleRow(schedule: AdminScheduleDto): ScheduleRow {
    const currentLocale = this.getCurrentLocale();
    const routeName =
      getAdminLookupLabel(schedule.route, currentLocale) ??
      this.getTranslationLabel(schedule.route?.translations, currentLocale) ??
      schedule.route?.slug ??
      '-';
    const vehicleTypeName =
      getAdminLookupLabel(schedule.vehicleType, currentLocale) ??
      this.getTranslationLabel(schedule.vehicleType?.translations, currentLocale) ??
      schedule.vehicleType?.slug ??
      '-';
    const vehicleName =
      schedule.vehicle?.vehicleNumber ??
      schedule.vehicle?.numberPlate ??
      vehicleTypeName;
    const status = this.parseStatus(schedule.status);
    const departureDateTime = this.splitDateTime(schedule.departureDateTime);

    return {
      id: schedule.id,
      kind: 'schedule',
      tripId: `#SCH-${schedule.id}`,
      dateRange: this.formatDateForDisplay(departureDateTime.date),
      startDate: departureDateTime.date,
      endDate: departureDateTime.date,
      departureTimes: departureDateTime.time,
      routeSlug: schedule.route?.slug ?? '',
      route: routeName,
      vehicleTypeSlug: schedule.vehicleType?.slug ?? '',
      vehicle: vehicleName,
      frequency: '-',
      status: status.name,
      statusCode: status.code,
      updatedAt: this.formatDateTime(schedule.updatedAt ?? schedule.createdAt),
    };
  }

  private toScheduleSetFallback(schedule: ScheduleRow): AdminScheduleSetDto {
    return {
      id: schedule.id,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      departureTimes: this.parseDepartureTimes(schedule.departureTimes),
      frequency: schedule.frequency,
      status: schedule.statusCode,
      route: {
        id: 0,
        slug: schedule.routeSlug,
      },
      vehicleType: {
        id: 0,
        slug: schedule.vehicleTypeSlug,
      },
    };
  }

  private toRouteOptions(routes: AdminRouteDto[], currentLocale: string): Option[] {
    return routes
      .map((route) => ({
        code: route.slug,
        label:
          getAdminLookupLabel(route, currentLocale) ??
          this.getTranslationLabel(route.translations, currentLocale) ??
          route.slug,
      }))
      .filter((option) => option.code.length > 0);
  }

  private toVehicleTypeOptions(
    vehicleTypes: AdminVehicleTypeDto[],
    currentLocale: string
  ): Option[] {
    return vehicleTypes
      .map((vehicleType) => ({
        code: vehicleType.slug,
        label:
          getAdminLookupLabel(vehicleType, currentLocale) ??
          this.getTranslationLabel(vehicleType.translations, currentLocale) ??
          vehicleType.slug,
      }))
      .filter((option) => option.code.length > 0);
  }

  private toScheduleStatusOptions(lookups: AdminLookupDto[]): Option[] {
    const statusOptions = new Map<string, string>([
      ['scheduled', 'SCHEDULED'],
      ['departed', 'DEPARTED'],
      ['delayed', 'DELAYED'],
    ]);

    for (const lookup of lookups) {
      if (lookup.category !== 'schedule_status') {
        continue;
      }

      const code = String(lookup.slug ?? '').trim().toLowerCase();
      if (!code) {
        continue;
      }

      statusOptions.set(
        code,
        this.getTranslationLabel(lookup.translations, this.getCurrentLocale()) ??
          this.getTranslationLabel(lookup.translations, 'en') ??
          code.replace(/_/g, ' ').toUpperCase()
      );
    }

    return [...statusOptions.entries()].map(([code, label]) => ({ code, label }));
  }

  private parseDepartureTimes(value: unknown): string[] {
    const rawValues = String(value ?? '')
      .split(/[\n,]+/)
      .map((time) => time.trim())
      .filter((time) => time.length > 0);

    const uniqueTimes = [...new Set(rawValues)];
    const allValid = uniqueTimes.every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
    if (!allValid) {
      this.departureTimesInvalid = true;
      return [];
    }

    return uniqueTimes.sort();
  }

  private toDepartureTimesText(times: string[] | null | undefined): string {
    return (times ?? []).map((time) => String(time).slice(0, 5)).join(', ');
  }

  private applyFilters(): void {
    const keyword = this.searchKeyword.trim().toLowerCase();
    const routeFilter = this.selectedRouteFilter;
    const statusFilter = this.selectedStatusFilter;
    const dateFilter = this.toDateInputValue(this.selectedDateFilter);

    this.filteredSchedules = this.schedules.filter((schedule) => {
      if (routeFilter && schedule.routeSlug.trim().toLowerCase() !== routeFilter) {
        return false;
      }

      if (statusFilter && schedule.statusCode.trim().toLowerCase() !== statusFilter) {
        return false;
      }

      if (
        dateFilter &&
        (schedule.startDate > dateFilter || schedule.endDate < dateFilter)
      ) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [
        schedule.tripId,
        schedule.route,
        schedule.vehicle,
        schedule.departureTimes,
        schedule.frequency,
        schedule.status,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }

  private syncFiltersWithAvailableOptions(): void {
    if (
      this.selectedRouteFilter &&
      !this.routeOptions.some((option) => option.code === this.selectedRouteFilter)
    ) {
      this.selectedRouteFilter = '';
    }

    if (
      this.selectedStatusFilter &&
      !this.statusOptions.some((option) => option.code === this.selectedStatusFilter)
    ) {
      this.selectedStatusFilter = '';
    }
  }

  private formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  }

  private formatDateForDisplay(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    const [year, month, day] = value.split('-');
    if (!year || !month || !day) {
      return value;
    }

    return `${day}/${month}/${year}`;
  }

  private splitDateTime(value: string | null | undefined): { date: string; time: string } {
    const normalizedValue = String(value ?? '').trim();
    if (!normalizedValue) {
      return { date: '', time: '' };
    }

    const [date, rawTime = ''] = normalizedValue.includes('T')
      ? normalizedValue.split('T')
      : normalizedValue.split(/\s+/);

    return {
      date,
      time: rawTime.slice(0, 5),
    };
  }

  private toDateInputValue(value: Date | null): string {
    if (!value || !Number.isFinite(value.getTime())) {
      return '';
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private getTodayDateInputValue(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }

  private getTranslationLabel(
    translations: AdminTranslationCollection | null | undefined,
    locale?: string
  ): string | null {
    return getAdminTranslationLabel(translations, locale);
  }

  private parseStatus(value: string | AdminStatusDto | null | undefined): {
    code: string;
    name: string;
  } {
    return parseAdminStatus(value, this.getCurrentLocale());
  }
}
