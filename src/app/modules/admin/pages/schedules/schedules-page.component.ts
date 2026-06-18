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
  AdminUserDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
  CreateSchedulePayload,
  CreateScheduleSetPayload,
  getAdminLookupLabel,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';
import { combineBangkokDateTime } from '../../../../shared/lib/api-date-time';

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
  vehicleId: number | null;
  driverId: number | null;
  vehicle: string;
  driver: string;
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
  protected vehicleOptions: Option[] = [];
  protected driverOptions: Option[] = [];
  protected vehicleTypeOptions: Option[] = [];
  protected statusOptions: Option[] = [];
  protected readonly frequencyOptions: Option[] = [
    { code: 'daily', label: 'Daily' },
    { code: 'weekly', label: 'Weekly' },
    { code: 'monthly', label: 'Monthly' },
  ];

  protected selectedRouteFilter = '';
  protected selectedStatusFilter = '';
  protected selectedDateFilter: Date | null = null;
  protected searchKeyword = '';

  protected isLoading = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isGenerating = false;
  protected isEditMode = false;
  protected isScheduleItemEditMode = false;
  protected isFormModalOpen = false;
  protected isScheduleFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected departureTimesInvalid = false;
  protected errorMessage = '';
  protected selectedSchedule: ScheduleRow | null = null;

  protected readonly scheduleForm: FormGroup;
  protected readonly scheduleItemForm: FormGroup;
  private readonly languageSubscription: Subscription;

  private rawScheduleSets: AdminScheduleSetDto[] = [];
  private rawGeneratedSchedules: AdminScheduleDto[] = [];
  private rawRoutes: AdminRouteDto[] = [];
  private rawVehicles: AdminVehicleDto[] = [];
  private rawVehicleTypes: AdminVehicleTypeDto[] = [];
  private rawUsers: AdminUserDto[] = [];
  private rawLookups: AdminLookupDto[] = [];

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

    this.scheduleItemForm = this.formBuilder.group({
      departureDate: [null, [Validators.required]],
      departureTime: [null, [Validators.required]],
      route: ['', [Validators.required]],
      vehicleType: ['', [Validators.required]],
      vehicleId: [''],
      driverId: [''],
    });

    // Language change only swaps displayed translations; data is already loaded,
    // so re-derive the view locally instead of re-fetching from the backend.
    this.languageSubscription = this.translate.onLangChange.subscribe(() => {
      this.applyLocalization();
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
      status: this.getDefaultScheduleStatusCode(),
      route: this.routeOptions[0]?.code ?? '',
      vehicleType: this.vehicleTypeOptions[0]?.code ?? '',
    });

    this.isFormModalOpen = true;
  }

  protected openCreateScheduleModal(): void {
    this.isScheduleItemEditMode = false;
    this.selectedSchedule = null;

    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    now.setMinutes(now.getMinutes() - (now.getMinutes() % 5));

    this.scheduleItemForm.reset({
      departureDate: this.toDateControlValue(this.toDateInputValue(now)),
      departureTime: this.toTimeControlValue(this.toTimeInputValue(now)),
      route: this.routeOptions[0]?.code ?? '',
      vehicleType: this.vehicleTypeOptions[0]?.code ?? '',
      vehicleId: '',
      driverId: '',
    });
    this.isScheduleFormModalOpen = true;
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

  protected async openScheduleEditModal(schedule: ScheduleRow): Promise<void> {
    if (schedule.kind !== 'schedule') {
      return;
    }

    let detail: AdminScheduleDto | null = null;
    try {
      const response = await firstValueFrom(this.adminApiService.getScheduleById(schedule.id));
      detail = response?.data ?? null;
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.LOAD_SCHEDULES_FAILED'));
      return;
    }

    const scheduleDetail = detail ?? this.toScheduleDetailFallback(schedule);
    const departure = this.splitDateTime(scheduleDetail.departureDateTime);

    this.isScheduleItemEditMode = true;
    this.selectedSchedule = schedule;
    this.scheduleItemForm.reset({
      departureDate: this.toDateControlValue(departure.date || schedule.startDate),
      departureTime: this.toTimeControlValue(departure.time || schedule.departureTimes),
      route: scheduleDetail.route?.slug ?? schedule.routeSlug,
      vehicleType: scheduleDetail.vehicleType?.slug ?? schedule.vehicleTypeSlug,
      vehicleId: scheduleDetail.vehicle?.id ? String(scheduleDetail.vehicle.id) : '',
      driverId: scheduleDetail.driver?.id ? String(scheduleDetail.driver.id) : '',
    });
    this.isScheduleFormModalOpen = true;
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

  protected closeScheduleFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isScheduleFormModalOpen = false;
    this.selectedSchedule = null;
    this.scheduleItemForm.reset();
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

  protected isScheduleFieldInvalid(fieldName: string): boolean {
    const field = this.scheduleItemForm.get(fieldName);
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

  protected async submitSchedule(): Promise<void> {
    if (this.scheduleItemForm.invalid) {
      this.scheduleItemForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = this.toScheduleItemPayload();

      if (this.isScheduleItemEditMode && this.selectedSchedule) {
        await firstValueFrom(
          this.adminApiService.updateSchedule(this.selectedSchedule.id, payload)
        );
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createSchedule(payload));
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      this.closeScheduleFormModal(true);
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

    try {
      const [
        scheduleSetsResponse,
        generatedSchedulesResponse,
        routesResponse,
        vehiclesResponse,
        vehicleTypesResponse,
        usersResponse,
        lookupsResponse,
      ] =
        await Promise.all([
          firstValueFrom(this.adminApiService.getScheduleSets()),
          firstValueFrom(this.adminApiService.getSchedules()),
          firstValueFrom(this.adminApiService.getRoutes()),
          firstValueFrom(this.adminApiService.getVehicles()),
          firstValueFrom(this.adminApiService.getVehicleTypes()),
          firstValueFrom(this.adminApiService.getUsers()),
          firstValueFrom(this.adminApiService.getLookups()),
        ]);

      this.rawScheduleSets = scheduleSetsResponse?.data ?? [];
      this.rawGeneratedSchedules = generatedSchedulesResponse?.data ?? [];
      this.rawRoutes = routesResponse?.data ?? [];
      this.rawVehicles = vehiclesResponse?.data ?? [];
      this.rawVehicleTypes = vehicleTypesResponse?.data ?? [];
      this.rawUsers = usersResponse?.data ?? [];
      this.rawLookups = lookupsResponse?.data ?? [];

      this.applyLocalization();
    } catch {
      this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_SCHEDULES_FAILED');
      this.schedules = [];
      this.filteredSchedules = [];
    } finally {
      this.isLoading = false;
    }
  }

  // Re-derive every locale-dependent view field from the DTOs already in memory.
  // Runs on initial load and on each language change — no backend round-trip.
  private applyLocalization(): void {
    const currentLocale = this.getCurrentLocale();

    this.routeOptions = this.toRouteOptions(this.rawRoutes, currentLocale);
    this.vehicleOptions = this.toVehicleOptions(this.rawVehicles, currentLocale);
    this.driverOptions = this.toDriverOptions(this.rawUsers);
    this.vehicleTypeOptions = this.toVehicleTypeOptions(this.rawVehicleTypes, currentLocale);
    this.statusOptions = this.toScheduleStatusOptions(this.rawLookups);
    this.schedules = [
      ...this.rawScheduleSets.map((scheduleSet) => this.toScheduleRow(scheduleSet)),
      ...this.rawGeneratedSchedules.map((schedule) =>
        this.toGeneratedScheduleRow(schedule)
      ),
    ];
    this.syncFiltersWithAvailableOptions();
    this.applyFilters();
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

  private toScheduleItemPayload(): CreateSchedulePayload {
    const raw = this.scheduleItemForm.getRawValue();
    const vehicleId = this.toOptionalNumber(raw.vehicleId);
    const driverId = this.toOptionalNumber(raw.driverId);
    const departureDate = this.toDateInputValue(this.toDateValue(raw.departureDate));
    const departureTime = this.toTimeInputValue(this.toDateValue(raw.departureTime));

    return {
      departureDateTime: combineBangkokDateTime(departureDate, departureTime),
      route: String(raw.route ?? '').trim(),
      vehicleType: String(raw.vehicleType ?? '').trim(),
      ...(vehicleId !== undefined ? { vehicleId } : {}),
      ...(driverId !== undefined ? { driverId } : {}),
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
      vehicleId: null,
      driverId: null,
      vehicle: vehicleTypeName,
      driver: '-',
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
      vehicleId: schedule.vehicle?.id ?? null,
      driverId: schedule.driver?.id ?? null,
      vehicle: vehicleName,
      driver: schedule.driver?.fullName ?? '-',
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

  private toScheduleDetailFallback(schedule: ScheduleRow): AdminScheduleDto {
    return {
      id: schedule.id,
      departureDateTime: `${schedule.startDate}T${schedule.departureTimes || '00:00'}:00`,
      status: schedule.statusCode,
      route: {
        id: 0,
        slug: schedule.routeSlug,
      },
      vehicleType: {
        id: 0,
        slug: schedule.vehicleTypeSlug,
      },
      vehicle: schedule.vehicleId
        ? {
            id: schedule.vehicleId,
            vehicleNumber: schedule.vehicle,
          }
        : undefined,
      driver: schedule.driverId
        ? {
            id: schedule.driverId,
            fullName: schedule.driver,
          }
        : undefined,
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

  private toVehicleOptions(
    vehicles: AdminVehicleDto[],
    currentLocale: string
  ): Option[] {
    return vehicles.map((vehicle) => {
      const vehicleTypeName =
        getAdminLookupLabel(vehicle.vehicleType, currentLocale) ??
        this.getTranslationLabel(vehicle.vehicleType?.translations, currentLocale) ??
        vehicle.vehicleType?.slug ??
        '';
      const identifier =
        [vehicle.vehicleNumber, vehicle.numberPlate].filter(Boolean).join(' / ') ||
        `#${vehicle.id}`;
      const label = vehicleTypeName
        ? `${identifier} - ${vehicleTypeName}`
        : identifier;

      return {
        code: String(vehicle.id),
        label,
      };
    });
  }

  private toDriverOptions(users: AdminUserDto[]): Option[] {
    return users
      .filter((user) => this.isDriverUser(user))
      .map((user) => ({
        code: String(user.id),
        label: this.toUserDisplayName(user),
      }));
  }

  private isDriverUser(user: AdminUserDto): boolean {
    return (user.roles ?? []).some((role) => {
      const roleSlug = typeof role === 'string' ? role : role.slug;
      return String(roleSlug ?? '').trim().toLowerCase() === 'driver';
    });
  }

  private toUserDisplayName(user: AdminUserDto): string {
    const profileName = [
      user.title,
      user.firstName,
      user.middleName,
      user.lastName,
    ]
      .map((part) => String(part ?? '').trim())
      .filter(Boolean)
      .join(' ');

    return (
      user.fullName?.trim() ||
      profileName ||
      user.username?.trim() ||
      user.email?.trim() ||
      `#${user.id}`
    );
  }

  private toScheduleStatusOptions(lookups: AdminLookupDto[]): Option[] {
    const currentLocale = this.getCurrentLocale();

    return lookups
      .filter((lookup) => lookup.category === 'schedule_status')
      .map((lookup) => {
        const code = String(lookup.slug ?? '').trim().toLowerCase();
        return {
          code,
          label:
            this.getTranslationLabel(lookup.translations, currentLocale) ??
            this.getTranslationLabel(lookup.translations, 'en') ??
            code.replace(/_/g, ' ').toUpperCase(),
        };
      })
      .filter((option) => option.code.length > 0);
  }

  private getDefaultScheduleStatusCode(): string {
    return (
      this.statusOptions.find((option) => option.code === 'scheduled')?.code ??
      this.statusOptions[0]?.code ??
      ''
    );
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

  private toDateControlValue(dateValue: string | null | undefined): Date | null {
    const normalizedDate = String(dateValue ?? '').trim();
    const [year, month, day] = normalizedDate.split('-').map((part) => Number(part));

    if (!year || !month || !day) {
      return null;
    }

    return new Date(year, month - 1, day);
  }

  private toTimeInputValue(value: Date | null): string {
    if (!value || !Number.isFinite(value.getTime())) {
      return '';
    }

    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  }

  private toTimeControlValue(timeValue: string | null | undefined): Date | null {
    const normalizedTime = String(timeValue ?? '').trim().slice(0, 5);
    const [hours, minutes] = normalizedTime.split(':').map((part) => Number(part));

    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  private toDateValue(value: unknown): Date | null {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return value;
    }

    const normalizedValue = String(value ?? '').trim();
    if (!normalizedValue) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
      return this.toDateControlValue(normalizedValue);
    }

    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(normalizedValue)) {
      return this.toTimeControlValue(normalizedValue);
    }

    const parsedDate = new Date(normalizedValue);
    return Number.isFinite(parsedDate.getTime()) ? parsedDate : null;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0
      ? numericValue
      : undefined;
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
