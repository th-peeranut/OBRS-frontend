import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminTranslationDto,
  AdminVehicleDto,
  CreateVehiclePayload,
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
export class VehiclesPageComponent implements OnInit {
  protected vehicles: VehicleRow[] = [];
  protected vehicleTypeOptions: Option[] = [];
  protected statusOptions: Option[] = [];

  protected isLoading = false;
  protected errorMessage = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected selectedVehicle: VehicleRow | null = null;

  protected readonly vehicleForm: FormGroup;

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
  }

  async ngOnInit(): Promise<void> {
    await this.loadVehiclesAndOptions();
  }

  protected get totalVehicles(): number {
    return this.vehicles.length;
  }

  protected get activeVehicles(): number {
    return this.vehicles.filter((vehicle) => this.statusClass(vehicle.status) === 'is-success').length;
  }

  protected get pendingVehicles(): number {
    return this.vehicles.filter((vehicle) => this.statusClass(vehicle.status) === 'is-warning').length;
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

  protected openEditModal(vehicle: VehicleRow): void {
    this.isEditMode = true;
    this.selectedVehicle = vehicle;
    this.vehicleForm.reset({
      vehicleType: vehicle.vehicleTypeSlug,
      numberPlate: vehicle.plate,
      vehicleNumber: vehicle.vehicleNumber,
      status: vehicle.statusCode,
    });
    this.isFormModalOpen = true;
  }

  protected closeFormModal(): void {
    if (this.isSubmitting) {
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

  protected closeDeleteModal(): void {
    if (this.isDeleting) {
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
        this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createVehicle(payload));
        this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      this.closeFormModal();
      await this.loadVehiclesAndOptions();
    } catch {
      this.alertService.error(this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED'));
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
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      this.closeDeleteModal();
      await this.loadVehiclesAndOptions();
    } catch {
      this.alertService.error(this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED'));
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

      const vehicles = vehiclesResponse?.data ?? [];
      const vehicleTypes = vehicleTypesResponse?.data ?? [];
      const lookups = lookupsResponse?.data ?? [];

      this.vehicleTypeOptions = vehicleTypes.map((type) => ({
        code: type.slug,
        label: this.getTranslationLabel(type.translations, 'en') ?? type.slug,
      }));

      this.statusOptions = lookups
        .filter((lookup) => lookup.category === 'vehicle_status')
        .map((lookup) => ({
          code: lookup.slug,
          label: this.getTranslationLabel(lookup.translations, 'en') ?? lookup.slug,
        }));

      this.vehicles = vehicles.map((vehicle) => this.toVehicleRow(vehicle));
    } catch {
      this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_VEHICLES_FAILED');
    } finally {
      this.isLoading = false;
    }
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
    const statusCode = (vehicle.status ?? 'unknown').toLowerCase();
    const statusLabel = statusCode.replace(/_/g, ' ').toUpperCase();

    return {
      id: vehicle.id,
      vehicleTypeSlug: vehicle.vehicleType?.slug ?? '',
      statusCode,
      vehicleNumber: vehicle.vehicleNumber ?? '-',
      plate: vehicle.numberPlate ?? '-',
      vehicleType:
        this.getTranslationLabel(vehicle.vehicleType?.translations, 'en') ??
        vehicle.vehicleType?.slug ??
        '-',
      route: '-',
      status: statusLabel,
    };
  }

  private getTranslationLabel(
    translations: AdminTranslationDto[] | null | undefined,
    locale?: string
  ): string | null {
    if (!translations || translations.length === 0) {
      return null;
    }

    if (locale) {
      const translation = translations.find(
        (item) => item.locale?.toLowerCase() === locale.toLowerCase()
      );

      if (translation?.label) {
        return translation.label;
      }
    }

    return translations.find((item) => item.label)?.label ?? null;
  }
}
