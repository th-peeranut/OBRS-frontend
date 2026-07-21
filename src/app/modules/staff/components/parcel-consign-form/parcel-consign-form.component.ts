import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { CargoAvailabilityRespDto, ParcelQuoteRespDto } from '../../../../shared/interfaces/parcel.interface';
import {
  classifyCarryOn,
  ParcelCarryOnClassification,
} from '../../../../shared/lib/parcel-carry-on-classification';

export interface ParcelDropdownOption {
  value: string;
  label: string;
}

export type ParcelConsignMode = 'consigned' | 'carry_on_seat';

export interface ParcelConsignFormValue {
  mode: 'consigned';
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

/**
 * OBRS-341 — carry-on-on-seat branch's emitted business value. `dimensions`
 * is always present (required in this mode, unlike consigned's optional
 * one). `seatCount`/`seatNumbers` are present ONLY when the classification
 * (mirrored client-side — see `classifyCarryOn`) is on-seat; omitted
 * entirely for a free-aisle item, matching the wire contract's own
 * omit-don't-null-out shape (`parcels.md`: `seatCount` MUST BE ABSENT for
 * free-aisle). `seatNumbers` is further omitted unless the salesperson opted
 * into explicit seat selection.
 */
export interface ParcelCarryOnFormValue {
  mode: 'carry_on_seat';
  sender: { name: string; phone: string };
  scheduleId: number;
  pickupStopId: number;
  dropoffStopId: number;
  weightKg: number;
  description: string;
  prohibitedAcknowledged: boolean;
  dimensions: { lengthCm: number; widthCm: number; heightCm: number };
  seatCount?: number;
  seatNumbers?: string[];
}

export interface ParcelQuoteParams {
  scheduleId: number;
  pickupStopId: number;
  dropoffStopId: number;
  weightKg: number;
}

const PHONE_PATTERN = /^0\d{9}$/;

/**
 * >0 — `Validators.min(0)`/`required` alone allow 0; this rejects it
 * explicitly. Parametrized on the error key (OBRS-341) so the SAME shape
 * backs both the pre-existing consigned weight validator (`positiveWeight`,
 * behavior unchanged) and the new carry-on dimension validators
 * (`dimensionPositive`) without forking a second copy of the same check.
 */
function positiveNumberValidator(errorKey: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === '' || value === undefined) {
      return null; // Validators.required handles emptiness
    }
    return Number(value) > 0 ? null : { [errorKey]: true };
  };
}

function positiveWeightValidator(): ValidatorFn {
  return positiveNumberValidator('positiveWeight');
}

function dimensionPositiveValidator(): ValidatorFn {
  return positiveNumberValidator('dimensionPositive');
}

/** Dimensions are optional, but all-or-none: if any of length/width/height is
 * filled, the other two become required (design-system §3 — no partial
 * dimensions submitted silently as zero). CONSIGNED mode only — carry-on
 * mode (OBRS-341) swaps this group-level validator out for a per-control
 * `Validators.required` instead, since dimensions are mandatory there (see
 * `applyModeValidators()`). */
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
export class ParcelConsignFormComponent implements OnInit, OnChanges, OnDestroy {
  /** OBRS-341: 'consigned' (default, unchanged behavior) | 'carry_on_seat'.
   * A change resets the form (see `resetForMode()`) — the two branches have
   * genuinely different required-field shapes, and a full reset is the only
   * way to guarantee no stale value from one branch leaks into the other's
   * submit payload. */
  @Input() mode: ParcelConsignMode = 'consigned';

  @Input() scheduleOptions: ParcelDropdownOption[] = [];
  @Input() pickupOptions: ParcelDropdownOption[] = [];
  @Input() dropoffOptions: ParcelDropdownOption[] = [];
  @Input() isLoadingStops = false;

  /** OBRS-341: whole-trip seat numbers (`WalkInTripDto.availableSeatNumbers`,
   * the same source the walk-in sell page already uses), offered ONLY when
   * the salesperson opts into explicit seat selection ("ระบุที่นั่งเอง").
   * Whole-trip, NOT segment-scoped — same conservative basis the walk-in
   * sell page already uses; the server re-validates against real segment
   * occupancy regardless of what is offered here. */
  @Input() availableSeatNumbers: string[] = [];

  @Input() quote: ParcelQuoteRespDto | null = null;
  @Input() isLoadingQuote = false;
  @Input() quoteErrorKey: string | null = null;

  @Input() cargoAvailability: CargoAvailabilityRespDto | null = null;
  @Input() isLoadingCargo = false;
  @Input() cargoErrorKey: string | null = null;

  /** i18n key for a submit-time 400/409 errorCode, mapped by the parent page
   * (STAFF.PARCEL_CONSIGN.ERROR.* / STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.*).
   * The form is never reset on error — it stays populated so the
   * salesperson can correct and resubmit. */
  @Input() serverErrorKey: string | null = null;
  @Input() isSubmitting = false;

  @Output() scheduleChange = new EventEmitter<string>();
  @Output() pickupChange = new EventEmitter<string>();
  @Output() dropoffChange = new EventEmitter<string>();
  @Output() quoteParamsChange = new EventEmitter<ParcelQuoteParams | null>();
  @Output() submitForm = new EventEmitter<ParcelConsignFormValue | ParcelCarryOnFormValue>();

  protected readonly form: FormGroup;
  /** Explicit seat numbers chosen via the checkbox list — plain component
   * state rather than a FormControl, since a `string[]` checklist has no
   * natural single-input ControlValueAccessor shape (unlike every other
   * field here, which maps 1:1 to a native input). Reset alongside the rest
   * of the form on a mode switch (`resetForMode()`). */
  protected selectedSeatNumbers: string[] = [];

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
      // OBRS-341 carry-on-only controls. Always present (simpler and safer
      // than conditionally adding/removing controls, which is exactly the
      // shape of the "debounced rebuild orphans mid-edit controls" family of
      // bugs) — inert and unvalidated while mode === 'consigned'.
      seatCount: [null],
      specifySeats: [false],
    });
  }

  ngOnInit(): void {
    this.applyModeValidators();

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
    // schedule/pickup/dropoff/weight change). Unaffected by mode — both
    // branches need scheduleId/pickupStopId/dropoffStopId/weightKg.
    this.form.valueChanges
      .pipe(debounceTime(400), takeUntil(this.destroy$))
      .subscribe(() => this.emitQuoteParams());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] && !changes['mode'].firstChange) {
      this.resetForMode(changes['mode'].currentValue as ParcelConsignMode);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Full reset on a mode switch (OBRS-341) — see the `mode` `@Input()` doc
   * comment above for why a full reset, rather than a hand-enumerated
   * per-field clear, is the deliberate choice here. The parent page's
   * `onModeChange()` clears its own schedule/stop/quote state in lockstep
   * (see that component) — a half-reset here would leave the two out of
   * sync. */
  private resetForMode(mode: ParcelConsignMode): void {
    this.mode = mode;
    this.selectedSeatNumbers = [];
    this.form.reset({
      senderName: '',
      senderPhone: '',
      recipientName: '',
      recipientPhone: '',
      scheduleId: '',
      pickupStopId: '',
      dropoffStopId: '',
      weightKg: null,
      description: '',
      dimensions: { lengthCm: null, widthCm: null, heightCm: null },
      prohibitedAcknowledged: false,
      seatCount: null,
      specifySeats: false,
    });
    this.applyModeValidators();
    this.quoteParamsChange.emit(null);
  }

  private applyModeValidators(): void {
    const recipientNameCtrl = this.form.get('recipientName');
    const recipientPhoneCtrl = this.form.get('recipientPhone');
    const lengthCtrl = this.dimensionsGroup.get('lengthCm');
    const widthCtrl = this.dimensionsGroup.get('widthCm');
    const heightCtrl = this.dimensionsGroup.get('heightCm');

    if (this.mode === 'carry_on_seat') {
      recipientNameCtrl?.clearValidators();
      recipientPhoneCtrl?.clearValidators();
      this.dimensionsGroup.setValidators(null);
      lengthCtrl?.setValidators([Validators.required, dimensionPositiveValidator()]);
      widthCtrl?.setValidators([Validators.required, dimensionPositiveValidator()]);
      heightCtrl?.setValidators([Validators.required, dimensionPositiveValidator()]);
    } else {
      recipientNameCtrl?.setValidators([Validators.required, Validators.maxLength(100)]);
      recipientPhoneCtrl?.setValidators([Validators.required, Validators.pattern(PHONE_PATTERN)]);
      this.dimensionsGroup.setValidators(dimensionsAllOrNoneValidator());
      lengthCtrl?.setValidators(null);
      widthCtrl?.setValidators(null);
      heightCtrl?.setValidators(null);
    }
    recipientNameCtrl?.updateValueAndValidity({ emitEvent: false });
    recipientPhoneCtrl?.updateValueAndValidity({ emitEvent: false });
    lengthCtrl?.updateValueAndValidity({ emitEvent: false });
    widthCtrl?.updateValueAndValidity({ emitEvent: false });
    heightCtrl?.updateValueAndValidity({ emitEvent: false });
    this.dimensionsGroup.updateValueAndValidity({ emitEvent: false });
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

  /** OBRS-341 — mirrors the server's classification (see
   * `shared/lib/parcel-carry-on-classification.ts`) from the CURRENT
   * dimensions values, live as the salesperson types. `null` while any of
   * the three is not yet a usable positive number (incomplete input). */
  protected get carryOnClassification(): ParcelCarryOnClassification | null {
    const length = Number(this.dimensionsGroup.get('lengthCm')?.value);
    const width = Number(this.dimensionsGroup.get('widthCm')?.value);
    const height = Number(this.dimensionsGroup.get('heightCm')?.value);
    if (![length, width, height].every((v) => Number.isFinite(v) && v > 0)) {
      return null;
    }
    return classifyCarryOn(Math.max(length, width, height));
  }

  protected get isCarryOnMode(): boolean {
    return this.mode === 'carry_on_seat';
  }

  protected get isOnSeat(): boolean {
    return this.isCarryOnMode && this.carryOnClassification === 'on_seat';
  }

  /**
   * The price to DISPLAY for a carry-on on-seat item — `farePerUnit ×
   * seatCount`, deliberately NOT `quote.amount`. `GET /parcels/quote` (the
   * same endpoint reused unchanged from the consigned flow) returns `amount
   * = farePerUnit * weightTierMultiplier`, but the carry-on on-seat server
   * path (ADR-0063 §3) deliberately does NOT apply that multiplier — it
   * prices strictly `getPricePerSeatBy(...) * seatCount`. Both formulas
   * agree today only because `weightTierMultiplier` is always 1.0; they
   * WILL diverge the moment OBRS-417 (weight-tier pricing) ships, at which
   * point reading `quote.amount` here would silently show the wrong price.
   * Do not "simplify" this back to `quote.amount`.
   */
  protected get carryOnDisplayAmount(): number | null {
    if (!this.isOnSeat || !this.quote) return null;
    const seatCount = Number(this.form.get('seatCount')?.value);
    if (!Number.isFinite(seatCount) || seatCount < 1) return null;
    return this.quote.farePerUnit * seatCount;
  }

  protected toggleSeatNumber(seat: string): void {
    const idx = this.selectedSeatNumbers.indexOf(seat);
    this.selectedSeatNumbers =
      idx === -1
        ? [...this.selectedSeatNumbers, seat]
        : this.selectedSeatNumbers.filter((s) => s !== seat);
  }

  protected isSeatNumberSelected(seat: string): boolean {
    return this.selectedSeatNumbers.includes(seat);
  }

  protected get seatNumbersMismatch(): boolean {
    if (!this.isOnSeat || !this.form.get('specifySeats')?.value) return false;
    const seatCount = Number(this.form.get('seatCount')?.value);
    return Number.isFinite(seatCount) && seatCount >= 1 && this.selectedSeatNumbers.length !== seatCount;
  }

  protected get canSubmit(): boolean {
    if (this.isSubmitting || this.form.invalid) return false;
    if (this.isCarryOnMode) {
      if (this.carryOnClassification == null) return false;
      if (this.isOnSeat) {
        const seatCount = Number(this.form.get('seatCount')?.value);
        if (!Number.isFinite(seatCount) || seatCount < 1) return false;
        if (this.form.get('specifySeats')?.value && this.seatNumbersMismatch) return false;
      }
    }
    return true;
  }

  protected onSubmit(): void {
    if (this.isSubmitting) return;
    this.form.markAllAsTouched();
    if (!this.canSubmit) return;

    if (this.isCarryOnMode) {
      this.emitCarryOnSubmit();
      return;
    }
    this.emitConsignedSubmit();
  }

  private emitConsignedSubmit(): void {
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
      mode: 'consigned',
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

  private emitCarryOnSubmit(): void {
    const v = this.form.value as {
      senderName: string;
      senderPhone: string;
      scheduleId: string;
      pickupStopId: string;
      dropoffStopId: string;
      weightKg: number;
      description: string;
      dimensions: { lengthCm: number; widthCm: number; heightCm: number };
      prohibitedAcknowledged: boolean;
      seatCount: number | null;
      specifySeats: boolean;
    };

    const payload: ParcelCarryOnFormValue = {
      mode: 'carry_on_seat',
      sender: { name: v.senderName.trim(), phone: v.senderPhone.trim() },
      scheduleId: Number(v.scheduleId),
      pickupStopId: Number(v.pickupStopId),
      dropoffStopId: Number(v.dropoffStopId),
      weightKg: Number(v.weightKg),
      description: v.description.trim(),
      prohibitedAcknowledged: v.prohibitedAcknowledged,
      dimensions: {
        lengthCm: Number(v.dimensions.lengthCm),
        widthCm: Number(v.dimensions.widthCm),
        heightCm: Number(v.dimensions.heightCm),
      },
    };

    // seatCount/seatNumbers: MUST BE ABSENT for a free-aisle item (contract,
    // parcels.md) — only ever set when the classification is on-seat.
    if (this.isOnSeat) {
      payload.seatCount = Number(v.seatCount);
      if (v.specifySeats && this.selectedSeatNumbers.length > 0) {
        payload.seatNumbers = [...this.selectedSeatNumbers];
      }
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

  /** OBRS-341 — the dimension controls' own errors (required/
   * dimensionPositive), distinct from `fieldError()` above because they
   * live nested under `dimensionsGroup`, not directly on `this.form`. */
  protected dimensionFieldError(fieldName: 'lengthCm' | 'widthCm' | 'heightCm'): string | null {
    const ctrl = this.dimensionsGroup.get(fieldName);
    if (!ctrl || !ctrl.invalid || !(ctrl.dirty || ctrl.touched)) return null;
    const errors = ctrl.errors ?? {};
    if (errors['required']) return 'STAFF.VALIDATION.REQUIRED';
    if (errors['dimensionPositive']) return 'STAFF.PARCEL_CONSIGN.VALIDATION.DIMENSION_POSITIVE';
    return 'STAFF.VALIDATION.FIELD_INVALID';
  }

  protected get seatCountError(): string | null {
    if (!this.isOnSeat) return null;
    const ctrl = this.form.get('seatCount');
    if (!ctrl || !(ctrl.dirty || ctrl.touched)) return null;
    const value = Number(ctrl.value);
    if (ctrl.value === null || ctrl.value === '' || !Number.isFinite(value) || value < 1) {
      return 'STAFF.PARCEL_CONSIGN.CARRY_ON.VALIDATION.SEAT_COUNT_REQUIRED';
    }
    return null;
  }

  protected get dimensionsGroup(): FormGroup {
    return this.form.get('dimensions') as FormGroup;
  }

  protected get isDimensionsIncomplete(): boolean {
    const group = this.dimensionsGroup;
    return !this.isCarryOnMode && group.invalid && (group.dirty || group.touched);
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
