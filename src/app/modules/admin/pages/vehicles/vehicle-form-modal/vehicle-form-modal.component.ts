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
  toDriverOptions,
  toVehicleDtoFallback,
  toVehiclePayload,
} from '../vehicles-page.mappers';
import {
  RETIRED_VEHICLE_STATUS,
  optionalGpsImeiValidator,
  optionalPositiveIntegerValidator,
  optionalYearRangeValidator,
  vehicleNumberRequiredUnlessRetiredValidator,
} from './vehicle-form-modal.validators';

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
    standalone: false
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
  // R1 fetch-fail guard (OBRS-316 Gap 1): the modal opens synchronously from a row
  // fallback that has none of the 7 new attribute fields; real values only arrive
  // from the late getVehicleById pristine-patch in initEditForm. Because PUT is a
  // full-replace, submitting before/without that patch would silently NULL all 7
  // on the server. Save stays disabled (and submitVehicle() short-circuits) while
  // this is true, so the only recovery is close + reopen (== retry the fetch).
  protected isEditDetailError = false;

  protected readonly maxYear = new Date().getFullYear() + 1;

  // OBRS-1332: the assigned-driver picker's options, fetched once per modal lifetime
  // (the driver roster does not change while a form is open). A failed fetch leaves the
  // list empty and is NOT treated like isEditDetailError: the assignment being saved
  // comes from the vehicle detail control, not from this list, so an empty picker cannot
  // wipe it — every other field still saves normally.
  protected driverOptions: Option[] = [];
  private areDriversLoaded = false;

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
      // OBRS-842: conditionally required, mirroring the backend's
      // VehicleReqDto#isVehicleNumberValid — required for every status EXCEPT
      // `retired`. An unconditional Validators.required here is what made a
      // retired vehicle uneditable in the first place, and the '-' placeholder
      // that used to satisfy it is what made the corruption silent.
      vehicleNumber: [
        '',
        [vehicleNumberRequiredUnlessRetiredValidator(), Validators.maxLength(50)],
      ],
      status: ['', [Validators.required]],
      // OBRS-316 Gap 1: all 7 optional (no Validators.required, no asterisk) —
      // design-system §3.1 only requires the no-pre-seeded-default rule for
      // selects, but the same "optional means actually optional" principle
      // applies here: PUT sends null for a blank field, never rejects it.
      brand: ['', [Validators.maxLength(100)]],
      model: ['', [Validators.maxLength(100)]],
      manufactureYear: [null, [optionalYearRangeValidator(1980, this.maxYear)]],
      colour: ['', [Validators.maxLength(50)]],
      engineCc: [null, [optionalPositiveIntegerValidator]],
      chassisNumber: ['', [Validators.maxLength(100)]],
      note: [''],
      // OBRS-835: the Thaistar GPS tracker fitted to this vehicle. Optional (many
      // vehicles have no box) but format-bound to 15 digits, mirroring the backend's
      // @Pattern - a typo'd IMEI is not rejected by anything downstream, it just
      // silently matches no GPS batch and the van never appears on the map.
      gpsImei: ['', [optionalGpsImeiValidator]],
      // OBRS-1332: the driver who normally drives this van. Optional — a van with no
      // regular driver is the state every row starts in, and clearing this is how an
      // owner takes a driver off a van.
      assignedDriverId: [''],
      // OBRS-885: the service window. Both optional, and BLANK MEANS SOMETHING — a blank
      // start is "not known" (not "since forever") and a blank end is "still in service".
      // No client-side order validator: the backend already owns that rule
      // (VehicleReqDto#isInServiceWindowValid) and answers with a localized message, which
      // is what AC-3 asks to be shown. A second copy here would be a rule that can drift.
      inServiceFrom: [null],
      inServiceTo: [null],
    });

    // OBRS-842: vehicleNumber's validity depends on a SIBLING control, and Angular
    // re-runs a control's validators only when that control's own value changes —
    // so switching the status dropdown to/from `retired` must re-validate it here,
    // or the field keeps the verdict it got under the previous status.
    this.vehicleForm
      .get('status')
      ?.valueChanges.subscribe(() => this.revalidateVehicleNumber());
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
      void this.loadDriverOptions();
      if (this.mode === 'edit' && this.selectedVehicle) {
        this.initEditForm(this.selectedVehicle);
      } else {
        this.initCreateForm();
      }
    } else {
      this.isEditDetailLoading = false;
      this.isEditDetailError = false;
      this.vehicleForm.reset();
    }
  }

  // OBRS-842: drives the `*` next to the หมายเลขพาหนะ label. A retired vehicle has
  // no number to give, so marking the field required there would be a lie the admin
  // cannot satisfy.
  protected get isVehicleNumberOptional(): boolean {
    return (
      String(this.vehicleForm.get('status')?.value ?? '').trim().toLowerCase() ===
      RETIRED_VEHICLE_STATUS
    );
  }

  private revalidateVehicleNumber(): void {
    this.vehicleForm.get('vehicleNumber')?.updateValueAndValidity({ emitEvent: false });
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.vehicleForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  // Mirrors ReminderConfigPageComponent.errorKey — a distinct key per failure
  // reason so the template shows an accurate message. yearRange only applies to
  // manufactureYear; notInteger/positiveNumber are shared with engineCc.
  protected errorKey(fieldName: string): string {
    const field = this.vehicleForm.get(fieldName);
    if (field?.hasError('yearRange')) {
      return 'ADMIN.VALIDATION.YEAR_RANGE';
    }
    if (field?.hasError('notInteger')) {
      return 'ADMIN.VALIDATION.WHOLE_NUMBER';
    }
    // OBRS-835: gpsImei's only failure reason. Kept as its own branch rather than
    // folded into the POSITIVE_NUMBER fallback - "must be a positive number" would be
    // wrong advice for a field that wants exactly 15 digits.
    if (field?.hasError('gpsImeiFormat')) {
      return 'ADMIN.VEHICLES.DETAILS.GPS_IMEI_FORMAT';
    }
    return 'ADMIN.VALIDATION.POSITIVE_NUMBER';
  }

  // R1 guard: Enter-in-text-field submits the <form> even when the Save button
  // is [disabled], so submitVehicle() itself must also refuse to run while the
  // full vehicle detail hasn't loaded (or failed to load) in edit mode.
  protected get isSaveBlocked(): boolean {
    return this.mode === 'edit' && (this.isEditDetailLoading || this.isEditDetailError);
  }

  protected requestClose(): void {
    if (this.isSubmitting) {
      return;
    }
    this.closed.emit();
  }

  protected async submitVehicle(): Promise<void> {
    if (this.isSaveBlocked) {
      return;
    }

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

  // Create mode starts every select BLANK (empty = the field-name placeholder
  // shows), per design-system.md §3.1 "no pre-seeded default" — matching the
  // promotions/user form modals. OBRS-262 fixed the deviation OBRS-261 had
  // carried over verbatim (first-option pre-seed) from the pre-split
  // VehiclesPageComponent.openCreateModal.
  private initCreateForm(): void {
    this.isEditDetailLoading = false;
    this.isEditDetailError = false;
    this.vehicleForm.reset({
      vehicleType: '',
      numberPlate: '',
      vehicleNumber: '',
      status: '',
      brand: '',
      model: '',
      manufactureYear: null,
      colour: '',
      engineCc: null,
      chassisNumber: '',
      note: '',
      gpsImei: '',
      assignedDriverId: '',
      inServiceFrom: null,
      inServiceTo: null,
    });
  }

  private async loadDriverOptions(): Promise<void> {
    if (this.areDriversLoaded) {
      return;
    }
    try {
      const response = await firstValueFrom(this.adminApiService.getDrivers());
      this.driverOptions = toDriverOptions(response?.data ?? []);
      this.areDriversLoaded = true;
    } catch {
      this.driverOptions = [];
    }
  }

  // Open immediately with the row data already in hand, then patch in the
  // server detail once it arrives (pristine controls only) — same pattern
  // as the pre-split VehiclesPageComponent.openEditModal.
  //
  // R1 guard (OBRS-316 Gap 1): the row fallback has none of the 7 new
  // attribute fields, and PUT is a full-replace, so a save before this detail
  // fetch resolves would NULL them all. A failed fetch is no longer silent —
  // it sets isEditDetailError so Save stays disabled/guarded until the admin
  // closes and reopens (== retries).
  private async initEditForm(vehicle: VehicleRow): Promise<void> {
    this.isEditDetailLoading = true;
    this.isEditDetailError = false;
    this.applyVehicleFormValues(toVehicleDtoFallback(vehicle), vehicle);

    try {
      const response = await firstValueFrom(this.adminApiService.getVehicleById(vehicle.id));
      const vehicleDetail = response?.data ?? null;
      // Ignore a stale response if the modal has since closed or moved on to
      // editing a different vehicle.
      if (this.isOpen && this.selectedVehicle?.id === vehicle.id) {
        if (vehicleDetail) {
          this.applyVehicleFormValues(vehicleDetail, vehicle, true);
        } else {
          // R1 guard: a 2xx with a null/empty data envelope means the 7
          // attributes never loaded — treat it like a failed fetch so a
          // full-replace PUT can't null them all (same block-until-reopen).
          this.isEditDetailError = true;
        }
      }
    } catch {
      if (this.isOpen && this.selectedVehicle?.id === vehicle.id) {
        this.isEditDetailError = true;
      }
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
      // OBRS-842: `reset` validates each control as it walks the group, and
      // `vehicleNumber` is declared BEFORE `status`, so it would otherwise be
      // judged against the status the form is being reset AWAY from. Re-run it
      // once the whole group holds its new values rather than depending on
      // declaration order.
      this.revalidateVehicleNumber();
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.vehicleForm.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }

    this.revalidateVehicleNumber();
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
