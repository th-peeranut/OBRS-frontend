import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminVehicleDto,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import {
  Option,
  VehicleRow,
  buildVehicleFormValues,
  toVehicleDtoFallback,
  toVehiclePayload,
} from '../vehicles-page.mappers';

// Smart create/edit form modal, extracted from VehiclesPageComponent
// (OBRS-261, mirroring OBRS-251's PromotionFormModalComponent / OBRS-257's
// UserFormModalComponent). Owns its FormGroup, the modal template, its own
// create/update/detail-fetch API calls, and validation.
//
// Driven by @Input (isOpen/mode/selectedVehicle) — ngOnChanges reacts only
// to `isOpen` transitions so a re-render with the same open modal never
// clobbers in-progress input (same idiom as the promotion/user form modals).
//
// `reloadStructure` is a callback @Input (not an @Output) so the parent's
// store refresh can still be triggered from here without a round-trip
// through an @Output subscriber. Ordering is byte-for-byte parity with the
// pre-split VehiclesPageComponent.submitVehicle: API call -> emit closed
// (== the old closeFormModal(true)) -> await the success alert -> THEN
// reloadStructure() LAST. The modal does not stay open during the refresh —
// do not reorder this to await reloadStructure before the close/alert.
//
// getCurrentLocale(): the pre-split component kept this private rather than
// threading a resolved locale in from the parent (its `||` short-circuit
// must only call translate.getDefaultLang() when currentLang is falsy — see
// the method below). PromotionFormModalComponent/UserFormModalComponent both
// keep their own private copy for the same reason; this component follows
// that actual precedent.
@Component({
  selector: 'app-vehicle-form-modal',
  templateUrl: './vehicle-form-modal.component.html',
  styleUrl: './vehicle-form-modal.component.scss',
})
export class VehicleFormModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() selectedVehicle: VehicleRow | null = null;
  @Input() vehicleTypeOptions: Option[] = [];
  @Input() statusOptions: Option[] = [];
  @Input() reloadStructure!: () => Promise<void>;
  @Output() closed = new EventEmitter<void>();

  protected isSubmitting = false;
  protected isEditDetailLoading = false;

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

  // Only `isOpen` transitions drive the form: the parent always sets
  // mode/selectedVehicle together with isOpen in the same synchronous call
  // (openCreateModal/openEditModal), so gating on isOpen alone mirrors that
  // call boundary without re-initializing the form on an unrelated parent
  // re-render (e.g. a background store refresh) while the modal stays open.
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen']) {
      return;
    }

    if (this.isOpen) {
      if (this.mode === 'edit' && this.selectedVehicle) {
        this.initEditForm(this.selectedVehicle);
      } else {
        this.initCreateForm();
      }
    } else {
      this.isEditDetailLoading = false;
      this.vehicleForm.reset();
    }
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.vehicleForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected requestClose(): void {
    if (this.isSubmitting) {
      return;
    }
    this.closed.emit();
  }

  protected async submitVehicle(): Promise<void> {
    if (this.vehicleForm.invalid) {
      this.vehicleForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = toVehiclePayload(this.vehicleForm.value);

      if (this.mode === 'edit' && this.selectedVehicle) {
        await firstValueFrom(
          this.adminApiService.updateVehicle(this.selectedVehicle.id, payload)
        );
        this.closed.emit();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createVehicle(payload));
        this.closed.emit();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      await this.reloadStructure();
    } catch (error) {
      this.closed.emit();
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  // NOTE (discrepancy vs. the promotions/user form modals, and vs.
  // design-system.md §3.1 "no pre-seeded default"): the pre-split
  // VehiclesPageComponent.openCreateModal actually reset vehicleType/status
  // to the FIRST option's code, not to ''. That is reproduced verbatim here
  // — this refactor is behavior-preserving only, so the pre-existing
  // design-system deviation is carried over rather than silently fixed. See
  // the split report for the flagged follow-up.
  private initCreateForm(): void {
    this.isEditDetailLoading = false;
    this.vehicleForm.reset({
      vehicleType: this.vehicleTypeOptions[0]?.code ?? '',
      numberPlate: '',
      vehicleNumber: '',
      status: this.statusOptions[0]?.code ?? '',
    });
  }

  // Open immediately with the row data already in hand, then patch in the
  // server detail once it arrives (pristine controls only) — same pattern
  // as the pre-split VehiclesPageComponent.openEditModal.
  private async initEditForm(vehicle: VehicleRow): Promise<void> {
    this.isEditDetailLoading = true;
    this.applyVehicleFormValues(toVehicleDtoFallback(vehicle), vehicle);

    try {
      const response = await firstValueFrom(this.adminApiService.getVehicleById(vehicle.id));
      const vehicleDetail = response?.data ?? null;
      // Ignore a stale response if the modal has since closed or moved on to
      // editing a different vehicle.
      if (vehicleDetail && this.isOpen && this.selectedVehicle?.id === vehicle.id) {
        this.applyVehicleFormValues(vehicleDetail, vehicle, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      if (this.isOpen && this.selectedVehicle?.id === vehicle.id) {
        this.isEditDetailLoading = false;
      }
    }
  }

  // Populate the vehicle form from a DTO. When `onlyPristine` is set (the
  // late detail patch), only controls the admin hasn't started editing are
  // filled, so the arriving server data never clobbers in-progress input.
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

  // NOTE: `||` short-circuit is deliberate — translate.getDefaultLang() must
  // only be called when currentLang is falsy (some TranslateService stubs
  // don't implement it).
  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }
}
