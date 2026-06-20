import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminStatusDto,
  AdminTranslationCollection,
  AdminVehicleDto,
  AdminVehicleTypeDto,
  CreateVehiclePayload,
  getAdminLookupLabel,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { VehiclesStore } from './vehicles.store';

interface VehicleRow {
  id: number;
  vehicleTypeSlug: string;
  statusCode: string;
  vehicleNumber: string;
  plate: string;
  vehicleType: string;
  route: string;
  status: string;
}

interface Option {
  code: string;
  label: string;
}

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
    private readonly store: VehiclesStore
  ) {
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
    const normalizedStatus = status.toUpperCase();

    if (
      normalizedStatus === 'ACTIVE' ||
      normalizedStatus === 'ONLINE' ||
      normalizedStatus === 'AVAILABLE'
    ) {
      return 'is-success';
    }

    if (normalizedStatus === 'PENDING') {
      return 'is-warning';
    }

    return 'is-danger';
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatusFilter = String(value ?? '').trim().toLowerCase();
    this.applyVehicleFilter();
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
    this.applyVehicleFormValues(this.toVehicleDtoFallback(vehicle), vehicle);
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
    const values = {
      vehicleType: String(vehicleDetail.vehicleType?.slug ?? vehicle.vehicleTypeSlug).trim(),
      numberPlate: String(vehicleDetail.numberPlate ?? vehicle.plate).trim(),
      vehicleNumber: String(vehicleDetail.vehicleNumber ?? vehicle.vehicleNumber).trim(),
      status: this.parseStatus(vehicleDetail.status ?? vehicle.statusCode).code,
    };

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

  private toVehicleDtoFallback(vehicle: VehicleRow): AdminVehicleDto {
    return {
      id: vehicle.id,
      numberPlate: vehicle.plate,
      vehicleNumber: vehicle.vehicleNumber,
      status: vehicle.statusCode,
      vehicleType: { id: 0, slug: vehicle.vehicleTypeSlug },
    };
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
      this.closeDeleteModal(true);
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      await this.store.refresh();
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

    this.vehicleTypeOptions = this.rawVehicleTypes.map((type) => ({
      code: type.slug,
      label:
        this.getTranslationLabel(type.translations, currentLocale) ??
        this.getTranslationLabel(type.translations, 'en') ??
        type.slug,
    }));

    this.statusOptions = this.rawLookups
      .filter((lookup) => lookup.category === 'vehicle_status')
      .map((lookup) => ({
        code: lookup.slug,
        label:
          this.getTranslationLabel(lookup.translations, currentLocale) ??
          this.getTranslationLabel(lookup.translations, 'en') ??
          lookup.slug,
      }));

    this.vehicles = this.rawVehicles.map((vehicle) => this.toVehicleRow(vehicle));
    this.syncStatusFilterWithAvailableOptions();
    this.applyVehicleFilter();
  }

  private toVehiclePayload(): CreateVehiclePayload {
    return {
      vehicleType: String(this.vehicleForm.value['vehicleType'] ?? '').trim().toLowerCase(),
      numberPlate: String(this.vehicleForm.value['numberPlate'] ?? '').trim(),
      vehicleNumber: String(this.vehicleForm.value['vehicleNumber'] ?? '').trim(),
      status: String(this.vehicleForm.value['status'] ?? '').trim().toLowerCase(),
    };
  }

  private toVehicleRow(vehicle: AdminVehicleDto): VehicleRow {
    const status = this.parseStatus(vehicle.status);
    const currentLocale = this.getCurrentLocale();

    return {
      id: vehicle.id,
      vehicleTypeSlug: vehicle.vehicleType?.slug ?? '',
      statusCode: status.code,
      vehicleNumber: vehicle.vehicleNumber ?? '-',
      plate: vehicle.numberPlate ?? '-',
      vehicleType:
        getAdminLookupLabel(vehicle.vehicleType, currentLocale) ??
        this.getTranslationLabel(vehicle.vehicleType?.translations, currentLocale) ??
        this.getTranslationLabel(vehicle.vehicleType?.translations, 'en') ??
        vehicle.vehicleType?.slug ??
        '-',
      route: '-',
      status: status.name,
    };
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

  private applyVehicleFilter(): void {
    const statusFilter = this.selectedStatusFilter;

    this.filteredVehicles = this.vehicles.filter((vehicle) => {
      if (statusFilter.length === 0) {
        return true;
      }

      return vehicle.statusCode.trim().toLowerCase() === statusFilter;
    });
  }

  private syncStatusFilterWithAvailableOptions(): void {
    if (
      this.selectedStatusFilter &&
      !this.statusOptions.some(
        (option) => option.code.trim().toLowerCase() === this.selectedStatusFilter
      )
    ) {
      this.selectedStatusFilter = '';
    }
  }
}
