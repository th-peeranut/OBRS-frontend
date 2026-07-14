import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { CargoAvailabilityRespDto, ParcelQuoteRespDto } from '../../../../shared/interfaces/parcel.interface';

export interface ParcelDropdownOption {
  value: string;
  label: string;
}

export interface ParcelConsignFormValue {
  sender: { name: string; phone: string };
  recipient: { name: string; phone: string };
  scheduleId: number;
  pickupStopId: number;
  dropoffStopId: number;
  weightKg: number;
  description: string;
  prohibitedAcknowledged: boolean;
  dimensions?: { lengthCm: number; widthCm: number; heightCm: number };
}

export interface ParcelQuoteParams {
  scheduleId: number;
  pickupStopId: number;
  dropoffStopId: number;
  weightKg: number;
}

const PHONE_PATTERN = /^0\d{9}$/;

/** >0 — Validators.min(0)/required alone allow 0; this rejects it explicitly. */
function positiveWeightValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === '' || value === undefined) {
      return null; // Validators.required handles emptiness
    }
    return Number(value) > 0 ? null : { positiveWeight: true };
  };
}

/** Dimensions are optional, but all-or-none: if any of length/width/height is
 * filled, the other two become required (design-system §3 — no partial
 * dimensions submitted silently as zero). */
function dimensionsAllOrNoneValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const length = group.get('lengthCm')?.value;
    const width = group.get('widthCm')?.value;
    const height = group.get('heightCm')?.value;
    const filled = [length, width, height].filter((v) => v !== null && v !== '' && v !== undefined);
    if (filled.length === 0 || filled.length === 3) {
      return null;
    }
    return { dimensionsIncomplete: true };
  };
}

@Component({
  selector: 'app-parcel-consign-form',
  templateUrl: './parcel-consign-form.component.html',
  styleUrl: './parcel-consign-form.component.scss',
})
export class ParcelConsignFormComponent implements OnInit, OnDestroy {
  @Input() scheduleOptions: ParcelDropdownOption[] = [];
  @Input() pickupOptions: ParcelDropdownOption[] = [];
  @Input() dropoffOptions: ParcelDropdownOption[] = [];
  @Input() isLoadingStops = false;

  @Input() quote: ParcelQuoteRespDto | null = null;
  @Input() isLoadingQuote = false;
  @Input() quoteErrorKey: string | null = null;

  @Input() cargoAvailability: CargoAvailabilityRespDto | null = null;
  @Input() isLoadingCargo = false;
  @Input() cargoErrorKey: string | null = null;

  /** i18n key for a submit-time 400/409 errorCode, mapped by the parent page
   * (STAFF.PARCEL_CONSIGN.ERROR.*). The form is never reset on error — it
   * stays populated so the salesperson can correct and resubmit. */
  @Input() serverErrorKey: string | null = null;
  @Input() isSubmitting = false;

  @Output() scheduleChange = new EventEmitter<string>();
  @Output() pickupChange = new EventEmitter<string>();
  @Output() dropoffChange = new EventEmitter<string>();
  @Output() quoteParamsChange = new EventEmitter<ParcelQuoteParams | null>();
  @Output() submitForm = new EventEmitter<ParcelConsignFormValue>();

  protected readonly form: FormGroup;
  private readonly destroy$ = new Subject<void>();

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group({
      senderName: ['', [Validators.required, Validators.maxLength(100)]],
      senderPhone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
      recipientName: ['', [Validators.required, Validators.maxLength(100)]],
      recipientPhone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
      scheduleId: ['', [Validators.required]],
      pickupStopId: ['', [Validators.required]],
      dropoffStopId: ['', [Validators.required]],
      weightKg: [null, [Validators.required, positiveWeightValidator(), Validators.max(100)]],
      description: ['', [Validators.required, Validators.maxLength(500)]],
      dimensions: this.fb.group(
        {
          lengthCm: [null],
          widthCm: [null],
          heightCm: [null],
        },
        { validators: dimensionsAllOrNoneValidator() }
      ),
      prohibitedAcknowledged: [false, [Validators.requiredTrue]],
    });
  }

  ngOnInit(): void {
    this.form
      .get('scheduleId')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((value: string) => this.scheduleChange.emit(value));

    this.form
      .get('pickupStopId')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((value: string) => this.pickupChange.emit(value));

    this.form
      .get('dropoffStopId')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((value: string) => this.dropoffChange.emit(value));

    // Debounced quote/cargo trigger (design spec: ~400ms on
    // schedule/pickup/dropoff/weight change).
    this.form.valueChanges
      .pipe(debounceTime(400), takeUntil(this.destroy$))
      .subscribe(() => this.emitQuoteParams());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private emitQuoteParams(): void {
    const scheduleId = Number(this.form.get('scheduleId')?.value);
    const pickupStopId = Number(this.form.get('pickupStopId')?.value);
    const dropoffStopId = Number(this.form.get('dropoffStopId')?.value);
    const weightKg = Number(this.form.get('weightKg')?.value);

    if (
      !scheduleId ||
      !pickupStopId ||
      !dropoffStopId ||
      !Number.isFinite(weightKg) ||
      weightKg <= 0
    ) {
      this.quoteParamsChange.emit(null);
      return;
    }

    this.quoteParamsChange.emit({ scheduleId, pickupStopId, dropoffStopId, weightKg });
  }

  protected get canSubmit(): boolean {
    return this.form.valid && !this.isSubmitting;
  }

  protected onSubmit(): void {
    if (this.isSubmitting) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.value as {
      senderName: string;
      senderPhone: string;
      recipientName: string;
      recipientPhone: string;
      scheduleId: string;
      pickupStopId: string;
      dropoffStopId: string;
      weightKg: number;
      description: string;
      dimensions: { lengthCm: number | null; widthCm: number | null; heightCm: number | null };
      prohibitedAcknowledged: boolean;
    };

    const payload: ParcelConsignFormValue = {
      sender: { name: v.senderName.trim(), phone: v.senderPhone.trim() },
      recipient: { name: v.recipientName.trim(), phone: v.recipientPhone.trim() },
      scheduleId: Number(v.scheduleId),
      pickupStopId: Number(v.pickupStopId),
      dropoffStopId: Number(v.dropoffStopId),
      weightKg: Number(v.weightKg),
      description: v.description.trim(),
      prohibitedAcknowledged: v.prohibitedAcknowledged,
    };

    if (v.dimensions.lengthCm != null && v.dimensions.widthCm != null && v.dimensions.heightCm != null) {
      payload.dimensions = {
        lengthCm: Number(v.dimensions.lengthCm),
        widthCm: Number(v.dimensions.widthCm),
        heightCm: Number(v.dimensions.heightCm),
      };
    }

    this.submitForm.emit(payload);
  }

  protected fieldError(fieldName: string): string | null {
    const ctrl = this.form.get(fieldName);
    if (!ctrl || !ctrl.invalid || !(ctrl.dirty || ctrl.touched)) return null;
    const errors = ctrl.errors ?? {};
    if (errors['required']) return 'STAFF.VALIDATION.REQUIRED';
    if (errors['pattern']) {
      if (fieldName === 'senderPhone' || fieldName === 'recipientPhone') {
        return 'STAFF.VALIDATION.PHONE_INVALID';
      }
    }
    if (errors['maxlength']) return 'STAFF.VALIDATION.FIELD_INVALID';
    if (errors['positiveWeight']) return 'STAFF.PARCEL_CONSIGN.VALIDATION.WEIGHT_POSITIVE';
    if (errors['max']) return 'STAFF.PARCEL_CONSIGN.VALIDATION.WEIGHT_MAX';
    return 'STAFF.VALIDATION.FIELD_INVALID';
  }

  protected isFieldInvalid(fieldName: string): boolean {
    return !!this.fieldError(fieldName);
  }

  protected get dimensionsGroup(): FormGroup {
    return this.form.get('dimensions') as FormGroup;
  }

  protected get isDimensionsIncomplete(): boolean {
    const group = this.dimensionsGroup;
    return group.invalid && (group.dirty || group.touched);
  }

  /** Called by the parent page whenever the schedule changes and a fresh
   * stop list is being fetched — the previously-selected pickup/dropoff ids
   * belong to the OLD route and must not silently carry over. */
  clearStopSelections(): void {
    this.form.patchValue({ pickupStopId: '', dropoffStopId: '' }, { emitEvent: false });
  }

  /** Called by the parent page when the pickup stop changes and the dropoff
   * options are re-filtered — clears a now-invalid dropoff selection. */
  clearDropoffSelection(): void {
    this.form.patchValue({ dropoffStopId: '' }, { emitEvent: false });
  }
}
