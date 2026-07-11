import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRouteDto,
  AdminScheduleDto,
  AdminScheduleSetDto,
  AdminUserDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
  CreateSchedulePayload,
  CreateScheduleSetPayload,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { SchedulesStore } from './schedules.store';
import {
  Option,
  ScheduleRow,
  parseStatus,
  splitDateTime,
  statusClass as statusClassValue,
  toDateControlValue,
  toDateInputValue,
  toDepartureTimesText,
  toDriverOptions,
  toGeneratedScheduleRow,
  toRouteOptions,
  toScheduleDetailFallback,
  toScheduleItemPayload as toScheduleItemPayloadValue,
  toSchedulePayload as toSchedulePayloadValue,
  toScheduleRow,
  toScheduleSetFallback,
  toScheduleStatusOptions,
  toTimeControlValue,
  toTimeInputValue,
  toVehicleOptions,
  toVehicleTypeOptions,
} from './schedules.mappers';

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

  protected activeTab: 'set' | 'schedule' = 'set';
  // When set, the Schedules tab is scoped to the trips this set generated,
  // matched exactly by the backend scheduleSetId provenance link.
  protected focusedSet: ScheduleRow | null = null;
  protected selectedRouteFilter = '';
  protected selectedStatusFilter = '';
  protected selectedDateFilter: Date | null = null;
  protected searchKeyword = '';

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isGenerating = false;
  protected isEditMode = false;
  protected isScheduleItemEditMode = false;
  protected isEditDetailLoading = false;
  protected isScheduleEditDetailLoading = false;
  protected isFormModalOpen = false;
  protected isScheduleFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected departureTimesInvalid = false;
  protected errorMessage = '';
  protected selectedSchedule: ScheduleRow | null = null;

  protected readonly scheduleForm: FormGroup;
  protected readonly scheduleItemForm: FormGroup;
  private readonly subscriptions = new Subscription();

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
    private readonly translate: TranslateService,
    private readonly store: SchedulesStore
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
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.applyLocalization();
      })
    );
  }

  ngOnInit(): void {
    // Render the cached schedules instantly on re-entry, then revalidate.
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        if (data) {
          this.rawScheduleSets = data.scheduleSets;
          this.rawGeneratedSchedules = data.generatedSchedules;
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
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        this.refreshFailed = failed && this.store.hasValue;
        if (failed && !this.store.hasValue) {
          this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_SCHEDULES_FAILED');
          this.schedules = [];
          this.filteredSchedules = [];
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

  /** Skeletons only while loading with no cached data yet. */
  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  // Unfiltered totals power the tab badges so they stay stable while filtering a tab.
  protected get scheduleSetTotal(): number {
    return this.schedules.filter((schedule) => schedule.kind === 'set').length;
  }

  protected get scheduleTripTotal(): number {
    return this.schedules.filter((schedule) => schedule.kind === 'schedule').length;
  }

  // The two tables read from the same filtered list, split by kind.
  protected get scheduleSetRows(): ScheduleRow[] {
    return this.filteredSchedules.filter((schedule) => schedule.kind === 'set');
  }

  protected get tripRows(): ScheduleRow[] {
    return this.filteredSchedules.filter((schedule) => schedule.kind === 'schedule');
  }

  protected setActiveTab(tab: 'set' | 'schedule'): void {
    this.activeTab = tab;
  }

  // Drill from a set into the schedules it produced, scoped by scheduleSetId.
  protected viewSchedulesForSet(set: ScheduleRow): void {
    if (set.kind !== 'set') {
      return;
    }
    this.focusedSet = set;
    this.activeTab = 'schedule';
    this.applyFilters();
  }

  protected clearFocusedSet(): void {
    this.focusedSet = null;
    this.applyFilters();
  }

  protected trackById(_index: number, item: ScheduleRow): number {
    return item.id;
  }

  protected statusClass(status: string): string {
    return statusClassValue(status);
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
      vehicleType: '', // design-system §3.1: start on placeholder, user picks explicitly
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
      departureDate: toDateControlValue(toDateInputValue(now)),
      departureTime: toTimeControlValue(toTimeInputValue(now)),
      route: this.routeOptions[0]?.code ?? '',
      vehicleType: '', // design-system §3.1: start on placeholder, user picks explicitly
      vehicleId: '',
      driverId: '',
    });
    this.isScheduleFormModalOpen = true;
  }

  protected async openEditModal(schedule: ScheduleRow): Promise<void> {
    if (schedule.kind !== 'set') {
      return;
    }

    // Open the modal immediately from the row data we already hold, so it
    // appears without waiting on the (slow on SIT) detail fetch. The server
    // detail is patched in once it arrives — see the fetch below.
    this.isEditMode = true;
    this.selectedSchedule = schedule;
    this.isEditDetailLoading = true;
    this.applyScheduleSetFormValues(toScheduleSetFallback(schedule), schedule);
    // Clear AFTER building the fallback: toScheduleSetFallback() runs
    // parseDepartureTimes(), which flips departureTimesInvalid=true on any
    // malformed stored time (e.g. a single-digit hour). Resetting here keeps a
    // freshly opened edit modal from showing a spurious validation error before
    // the user has touched the field.
    this.departureTimesInvalid = false;
    this.isFormModalOpen = true;

    try {
      const response = await firstValueFrom(this.adminApiService.getScheduleSetById(schedule.id));
      const detail = response?.data ?? null;
      // Ignore a stale response if the user closed the modal or switched rows.
      if (detail && this.isFormModalOpen && this.selectedSchedule?.id === schedule.id) {
        this.applyScheduleSetFormValues(detail, schedule, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      if (this.isFormModalOpen && this.selectedSchedule?.id === schedule.id) {
        this.isEditDetailLoading = false;
      }
    }
  }

  protected async openScheduleEditModal(schedule: ScheduleRow): Promise<void> {
    if (schedule.kind !== 'schedule') {
      return;
    }

    // Open the modal immediately from the row data; patch server detail in once
    // it arrives (see fetch below) so a slow SIT response can't blank-wait.
    this.isScheduleItemEditMode = true;
    this.selectedSchedule = schedule;
    this.isScheduleEditDetailLoading = true;
    this.applyScheduleItemFormValues(toScheduleDetailFallback(schedule), schedule);
    this.isScheduleFormModalOpen = true;

    try {
      const response = await firstValueFrom(this.adminApiService.getScheduleById(schedule.id));
      const detail = response?.data ?? null;
      if (detail && this.isScheduleFormModalOpen && this.selectedSchedule?.id === schedule.id) {
        this.applyScheduleItemFormValues(detail, schedule, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      if (this.isScheduleFormModalOpen && this.selectedSchedule?.id === schedule.id) {
        this.isScheduleEditDetailLoading = false;
      }
    }
  }

  // Populate the schedule-set form from a DTO. When `onlyPristine` is set (the
  // late detail patch), only controls the user hasn't started editing are
  // filled, so the arriving server data never clobbers in-progress input.
  private applyScheduleSetFormValues(
    scheduleSet: AdminScheduleSetDto,
    schedule: ScheduleRow,
    onlyPristine = false
  ): void {
    const status = parseStatus(scheduleSet.status, this.getCurrentLocale());
    const values = {
      startDate: scheduleSet.startDate ?? schedule.startDate,
      endDate: scheduleSet.endDate ?? schedule.endDate,
      departureTimesText: toDepartureTimesText(scheduleSet.departureTimes),
      frequency: scheduleSet.frequency ?? schedule.frequency,
      status: status.code,
      route: scheduleSet.route?.slug ?? schedule.routeSlug,
      vehicleType: scheduleSet.vehicleType?.slug ?? schedule.vehicleTypeSlug,
    };

    if (!onlyPristine) {
      this.scheduleForm.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.scheduleForm.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }
  }

  // Same optimistic-open / patch-only-pristine contract for the trip form.
  private applyScheduleItemFormValues(
    scheduleDetail: AdminScheduleDto,
    schedule: ScheduleRow,
    onlyPristine = false
  ): void {
    const departure = splitDateTime(scheduleDetail.departureDateTime);
    const values = {
      departureDate: toDateControlValue(departure.date || schedule.startDate),
      departureTime: toTimeControlValue(departure.time || schedule.departureTimes),
      route: scheduleDetail.route?.slug ?? schedule.routeSlug,
      vehicleType: scheduleDetail.vehicleType?.slug ?? schedule.vehicleTypeSlug,
      vehicleId: scheduleDetail.vehicle?.id ? String(scheduleDetail.vehicle.id) : '',
      driverId: scheduleDetail.driver?.id ? String(scheduleDetail.driver.id) : '',
    };

    if (!onlyPristine) {
      this.scheduleItemForm.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.scheduleItemForm.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }
  }

  protected closeFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isFormModalOpen = false;
    this.isEditDetailLoading = false;
    this.selectedSchedule = null;
    this.departureTimesInvalid = false;
    this.scheduleForm.reset();
  }

  protected closeScheduleFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isScheduleFormModalOpen = false;
    this.isScheduleEditDetailLoading = false;
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
      await this.store.refresh();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
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
      await this.store.refresh();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
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
      // Capture before closeDeleteModal clears selectedSchedule.
      const { id, kind } = this.selectedSchedule;
      if (kind === 'schedule') {
        await firstValueFrom(this.adminApiService.deleteSchedule(id));
      } else {
        await firstValueFrom(this.adminApiService.deleteScheduleSet(id));
      }
      // Optimistically remove the deleted row so the table updates synchronously,
      // without waiting for the background re-fetch to land (~2s on SIT).
      if (kind === 'schedule') {
        this.store.mutate((d) => ({ ...d, generatedSchedules: d.generatedSchedules.filter((s) => s.id !== id) }));
      } else {
        this.store.mutate((d) => ({ ...d, scheduleSets: d.scheduleSets.filter((s) => s.id !== id) }));
      }
      this.closeDeleteModal(true);
      // Overlap the table revalidate with the success dialog.
      const refresh = this.store.refresh();
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      await refresh;
    } catch (error) {
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isDeleting = false;
    }
  }

  protected async generateSchedules(schedule: ScheduleRow): Promise<void> {
    this.isGenerating = true;
    try {
      await firstValueFrom(this.adminApiService.generateSchedulesFromSet(schedule.id));
      await this.alertService.success(this.translate.instant('ADMIN.SCHEDULES.GENERATE_SUCCESS'));
      // Reload so the newly generated trips are present, then drill into them.
      await this.store.refresh();
      this.viewSchedulesForSet(schedule);
    } catch (error) {
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.SCHEDULES.GENERATE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isGenerating = false;
    }
  }

  // Re-derive every locale-dependent view field from the DTOs already in memory.
  // Runs on initial load and on each language change — no backend round-trip.
  private applyLocalization(): void {
    const currentLocale = this.getCurrentLocale();

    this.routeOptions = toRouteOptions(this.rawRoutes, currentLocale);
    this.vehicleOptions = toVehicleOptions(this.rawVehicles, currentLocale);
    this.driverOptions = toDriverOptions(this.rawUsers);
    this.vehicleTypeOptions = toVehicleTypeOptions(this.rawVehicleTypes, currentLocale);
    this.statusOptions = toScheduleStatusOptions(this.rawLookups, currentLocale);
    this.schedules = [
      ...this.rawScheduleSets.map((scheduleSet) =>
        toScheduleRow(scheduleSet, currentLocale, this.translate.currentLang)
      ),
      ...this.rawGeneratedSchedules.map((schedule) =>
        toGeneratedScheduleRow(schedule, currentLocale, this.translate.currentLang)
      ),
    ];
    this.syncFiltersWithAvailableOptions();
    this.applyFilters();
  }

  // parseDepartureTimes() used to mutate departureTimesInvalid as a side
  // effect when a time was malformed. The pure version now returns validity
  // instead, so this wrapper sets the flag at the exact same call site the
  // mutation used to happen at (see submitScheduleSet(), which still runs its
  // own `payload.departureTimes.length === 0` check right after this call).
  private toSchedulePayload(): CreateScheduleSetPayload {
    const raw = this.scheduleForm.getRawValue();
    const { payload, departureTimesValid } = toSchedulePayloadValue(raw);
    if (!departureTimesValid) {
      this.departureTimesInvalid = true;
    }

    return payload;
  }

  private toScheduleItemPayload(): CreateSchedulePayload {
    return toScheduleItemPayloadValue(this.scheduleItemForm.getRawValue());
  }

  private getDefaultScheduleStatusCode(): string {
    return (
      this.statusOptions.find((option) => option.code === 'scheduled')?.code ??
      this.statusOptions[0]?.code ??
      ''
    );
  }

  private applyFilters(): void {
    const keyword = this.searchKeyword.trim().toLowerCase();
    const routeFilter = this.selectedRouteFilter;
    const statusFilter = this.selectedStatusFilter;
    const dateFilter = toDateInputValue(this.selectedDateFilter);

    this.filteredSchedules = this.schedules.filter((schedule) => {
      if (this.focusedSet && schedule.kind === 'schedule' && !this.matchesFocusedSet(schedule)) {
        return false;
      }

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

  // A generated schedule belongs to a set when its backend scheduleSetId
  // matches. Ad-hoc schedules (no set) have a null id and never match.
  private matchesFocusedSet(schedule: ScheduleRow): boolean {
    const set = this.focusedSet;
    if (!set) {
      return true;
    }

    return schedule.scheduleSetId === set.id;
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
}
