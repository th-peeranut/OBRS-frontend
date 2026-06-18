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
import { TranslateService } from '@ngx-translate/core';

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

  protected isLoading = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected errorMessage = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected selectedVehicle: VehicleRow | null = null;

  protected readonly vehicleForm: FormGroup;
  private readonly languageSubscription: Subscription;

  private rawVehicles: AdminVehicleDto[] = [];
  private rawVehicleTypes: AdminVehicleTypeDto[] = [];
  private rawLookups: AdminLookupDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.vehicleForm = this.formBuilder.group({
      vehicleType: ['', [Validators.required]],
      numberPlate: ['', [Validators.required, Validators.maxLength(50)]],
      vehicleNumber: ['', [Validators.required, Validators.maxLength(50)]],
      status: ['', [Validators.required]],
    });

    // Language change only swaps displayed translations; data is already loaded,
    // so re-derive the view locally instead of re-fetching from the backend.
    this.languageSubscription = this.translate.onLangChange.subscribe(() => {
      this.applyLocalization();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadVehiclesAndOptions();
  }

  ngOnDestroy(): void {
    this.languageSubscription.unsubscribe();
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
    let vehicleDetail: AdminVehicleDto | null = null;
    try {
      const response = await firstValueFrom(this.adminApiService.getVehicleById(vehicle.id));
      vehicleDetail = response?.data ?? null;
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.LOAD_VEHICLES_FAILED'));
      return;
    }

    const vehicleType = String(vehicleDetail?.vehicleType?.slug ?? vehicle.vehicleTypeSlug).trim();
    const numberPlate = String(vehicleDetail?.numberPlate ?? vehicle.plate).trim();
    const vehicleNumber = String(vehicleDetail?.vehicleNumber ?? vehicle.vehicleNumber).trim();
    const status = this.parseStatus(vehicleDetail?.status ?? vehicle.statusCode).code;

    this.isEditMode = true;
    this.selectedVehicle = vehicle;
    this.vehicleForm.reset({
      vehicleType,
      numberPlate,
      vehicleNumber,
      status,
    });
    this.isFormModalOpen = true;
  }

  protected closeFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isFormModalOpen = false;
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

      await this.loadVehiclesAndOptions();
    } catch {
      this.closeFormModal(true);
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED'));
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
      await this.loadVehiclesAndOptions();
    } catch {
      this.closeDeleteModal(true);
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED'));
    } finally {
      this.isDeleting = false;
    }
  }

  private async loadVehiclesAndOptions(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [vehiclesResponse, vehicleTypesResponse, lookupsResponse] = await Promise.all([
        firstValueFrom(this.adminApiService.getVehicles()),
        firstValueFrom(this.adminApiService.getVehicleTypes()),
        firstValueFrom(this.adminApiService.getLookups()),
      ]);

      this.rawVehicles = vehiclesResponse?.data ?? [];
      this.rawVehicleTypes = vehicleTypesResponse?.data ?? [];
      this.rawLookups = lookupsResponse?.data ?? [];

      this.applyLocalization();
    } catch {
      this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_VEHICLES_FAILED');
      this.filteredVehicles = [];
    } finally {
      this.isLoading = false;
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
