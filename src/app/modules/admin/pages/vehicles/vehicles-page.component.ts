import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
  CreateVehiclePayload,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../auth/auth.service';
import { VehiclesStore } from './vehicles.store';
import {
  Option,
  VehicleRow,
  buildVehicleFormValues,
  filterMaintenanceStatusLookups,
  filterVehiclesByStatus,
  isVehicleStatusFilterStale,
  statusClass,
  toVehicleDtoFallback,
  toVehiclePayload,
  toVehicleRow,
  toVehicleStatusOptions,
  toVehicleTypeOptions,
} from './vehicles-page.mappers';

@Component({
  selector: 'app-vehicles-page',
  templateUrl: './vehicles-page.component.html',
  styleUrl: './vehicles-page.component.scss',
})
export class VehiclesPageComponent implements OnInit, OnDestroy {
  protected vehicles: VehicleRow[] = [];
  protected filteredVehicles: VehicleRow[] = [];
  protected vehicleTypeOptions: Option[] = [];
  protected statusOptions: Option[] = [];
  protected selectedStatusFilter = '';

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected errorMessage = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected isEditDetailLoading = false;
  protected selectedVehicle: VehicleRow | null = null;

  // OBRS-209: Maintenance tab — the tab bar mirrors SchedulesPageComponent's
  // pattern (set/schedule tabs). "Maintenance" starts disabled until a
  // vehicle row's "Manage maintenance" action focuses one.
  protected activeTab: 'list' | 'maintenance' = 'list';
  protected focusedVehicle: VehicleRow | null = null;
  protected maintenanceStatusOptions: AdminLookupDto[] = [];
  // Write affordances on the maintenance panel (Add + modal Save) are
  // owner/admin only; the per-row "Manage maintenance" action itself is
  // available to every reader. Computed once — single source of truth
  // passed down to the panel as an @Input().
  protected readonly canWriteMaintenance: boolean;

  protected readonly vehicleForm: FormGroup;
  private readonly subscriptions = new Subscription();

  private rawVehicles: AdminVehicleDto[] = [];
  private rawVehicleTypes: AdminVehicleTypeDto[] = [];
  private rawLookups: AdminLookupDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: VehiclesStore,
    private readonly authService: AuthService
  ) {
    this.canWriteMaintenance = this.authService.hasAnyRole(['owner']);

    this.vehicleForm = this.formBuilder.group({
      vehicleType: ['', [Validators.required]],
      numberPlate: ['', [Validators.required, Validators.maxLength(50)]],
      vehicleNumber: ['', [Validators.required, Validators.maxLength(50)]],
      status: ['', [Validators.required]],
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
    // Render the cached list instantly on re-entry, then revalidate.
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        if (data) {
          this.rawVehicles = data.vehicles;
          this.rawVehicleTypes = data.vehicleTypes;
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
          this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_VEHICLES_FAILED');
          this.filteredVehicles = [];
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

  protected trackById(_index: number, item: VehicleRow): number {
    return item.id;
  }

  protected get totalVehicles(): number {
    return this.vehicles.length;
  }

  protected get activeVehicles(): number {
    return this.vehicles.filter((vehicle) => this.statusClass(vehicle.statusCode) === 'is-success').length;
  }

  protected get pendingVehicles(): number {
    return this.vehicles.filter((vehicle) => this.statusClass(vehicle.statusCode) === 'is-warning').length;
  }

  protected statusClass(status: string): string {
    return statusClass(status);
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatusFilter = String(value ?? '').trim().toLowerCase();
    this.applyVehicleFilter();
  }

  protected setActiveTab(tab: 'list' | 'maintenance'): void {
    // The Maintenance tab is disabled (visible, not hidden) until a vehicle
    // is focused via the per-row "Manage maintenance" action.
    if (tab === 'maintenance' && !this.focusedVehicle) {
      return;
    }
    this.activeTab = tab;
  }

  // Per-row "Manage maintenance" action — copies
  // SchedulesPageComponent.viewSchedulesForSet()'s focus pattern.
  protected viewMaintenanceForVehicle(vehicle: VehicleRow): void {
    this.focusedVehicle = vehicle;
    this.activeTab = 'maintenance';
  }

  protected clearFocusedVehicle(): void {
    this.focusedVehicle = null;
    this.activeTab = 'list';
  }

  protected openCreateModal(): void {
    this.isEditMode = false;
    this.selectedVehicle = null;
    this.vehicleForm.reset({
      vehicleType: this.vehicleTypeOptions[0]?.code ?? '',
      numberPlate: '',
      vehicleNumber: '',
      status: this.statusOptions[0]?.code ?? '',
    });
    this.isFormModalOpen = true;
  }

  protected async openEditModal(vehicle: VehicleRow): Promise<void> {
    // Open the modal immediately with the row data we already hold, so it
    // appears without waiting on the (slow on SIT) detail fetch. The server
    // detail is patched in once it arrives — see the fetch below.
    this.isEditMode = true;
    this.selectedVehicle = vehicle;
    this.isEditDetailLoading = true;
    this.applyVehicleFormValues(toVehicleDtoFallback(vehicle), vehicle);
    this.isFormModalOpen = true;

    try {
      const response = await firstValueFrom(this.adminApiService.getVehicleById(vehicle.id));
      const vehicleDetail = response?.data ?? null;
      // Ignore a stale response if the user has closed the modal or moved on
      // to editing a different vehicle in the meantime.
      if (vehicleDetail && this.isFormModalOpen && this.selectedVehicle?.id === vehicle.id) {
        this.applyVehicleFormValues(vehicleDetail, vehicle, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      // Only clear the loading hint if this fetch is still the current one.
      if (this.isFormModalOpen && this.selectedVehicle?.id === vehicle.id) {
        this.isEditDetailLoading = false;
      }
    }
  }

  // Populate the vehicle form from a DTO. When `onlyPristine` is set (the late
  // detail patch), only controls the user hasn't started editing are filled,
  // so the arriving server data never clobbers in-progress input.
  private applyVehicleFormValues(
    vehicleDetail: AdminVehicleDto,
    vehicle: VehicleRow,
    onlyPristine = false
  ): void {
    const values = buildVehicleFormValues(vehicleDetail, vehicle, this.getCurrentLocale());

    if (!onlyPristine) {
      this.vehicleForm.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.vehicleForm.get(name);
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
    this.selectedVehicle = null;
    this.vehicleForm.reset();
  }

  protected openDeleteModal(vehicle: VehicleRow): void {
    this.selectedVehicle = vehicle;
    this.isDeleteModalOpen = true;
  }

  protected closeDeleteModal(force = false): void {
    if (this.isDeleting && !force) {
      return;
    }

    this.isDeleteModalOpen = false;
    this.selectedVehicle = null;
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.vehicleForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected async submitVehicle(): Promise<void> {
    if (this.vehicleForm.invalid) {
      this.vehicleForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = this.toVehiclePayload();

      if (this.isEditMode && this.selectedVehicle) {
        await firstValueFrom(
          this.adminApiService.updateVehicle(this.selectedVehicle.id, payload)
        );
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createVehicle(payload));
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      await this.store.refresh();
    } catch (error) {
      this.closeFormModal(true);
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  protected async confirmDelete(): Promise<void> {
    if (!this.selectedVehicle) {
      return;
    }

    this.isDeleting = true;
    try {
      await firstValueFrom(this.adminApiService.deleteVehicle(this.selectedVehicle.id));
      // Capture id before closeDeleteModal clears selectedVehicle.
      const id = this.selectedVehicle.id;
      // Optimistically remove the deleted row so the table updates synchronously,
      // without waiting for the background re-fetch to land (~2s on SIT).
      this.store.mutate((d) => ({ ...d, vehicles: d.vehicles.filter((v) => v.id !== id) }));
      this.closeDeleteModal(true);
      // Overlap the table revalidate with the success dialog.
      const refresh = this.store.refresh();
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      await refresh;
    } catch (error) {
      this.closeDeleteModal(true);
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isDeleting = false;
    }
  }

  // Re-derive every locale-dependent view field from the DTOs already in memory.
  // Runs on initial load and on each language change — no backend round-trip.
  private applyLocalization(): void {
    const currentLocale = this.getCurrentLocale();

    this.vehicleTypeOptions = toVehicleTypeOptions(this.rawVehicleTypes, currentLocale);
    this.statusOptions = toVehicleStatusOptions(this.rawLookups, currentLocale);

    // OBRS-209: raw Lookup rows (not pre-mapped to Option[]) — the
    // maintenance panel derives its own localized labels, mirroring how this
    // page derives statusOptions above.
    this.maintenanceStatusOptions = filterMaintenanceStatusLookups(this.rawLookups);

    this.vehicles = this.rawVehicles.map((vehicle) => toVehicleRow(vehicle, currentLocale));
    this.syncStatusFilterWithAvailableOptions();
    this.applyVehicleFilter();
  }

  private toVehiclePayload(): CreateVehiclePayload {
    return toVehiclePayload(this.vehicleForm.value);
  }

  // NOTE: `||` short-circuit is deliberate — translate.getDefaultLang() must
  // only be called when currentLang is falsy (some TranslateService stubs
  // don't implement it). Kept un-extracted for the same reason the other
  // admin pages (promotions/role/user/schedules/routes) keep their
  // getCurrentLocale private rather than moving it to the mappers file.
  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }

  private applyVehicleFilter(): void {
    this.filteredVehicles = filterVehiclesByStatus(this.vehicles, this.selectedStatusFilter);
  }

  private syncStatusFilterWithAvailableOptions(): void {
    if (isVehicleStatusFilterStale(this.selectedStatusFilter, this.statusOptions)) {
      this.selectedStatusFilter = '';
    }
  }
}
