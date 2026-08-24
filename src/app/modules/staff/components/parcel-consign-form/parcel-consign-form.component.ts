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
import {
  formatThaiMobile,
  separatorTolerantPattern,
  stripPhoneSeparators,
  THAI_LOCAL_PHONE_PATTERN,
  THAI_MOBILE_PATTERN,
} from '../../../../shared/constants/thai-msisdn';
import { ParcelPolicyService } from '../../../../services/parcel-policy/parcel-policy.service';
import { configuredMaxWeightValidator } from '../../../../shared/lib/configured-max-weight.validator';
import {
  ProhibitedCategoryView,
  toProhibitedCategoryViews,
} from '../../../../shared/lib/parcel-prohibited-categories';

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

/**
 * OBRS-455: the two parties on a waybill do NOT share a rule, because only one of them gets
 * texted. `SENDER_PHONE_PATTERN` stays the wide local rule (a business consigning cargo may only
 * have a landline — ADR-0082, Accepted); the recipient's number is where
 * `ParcelArrivedNotificationService` sends the arrival notice, so it must be a real Thai mobile or
 * we pay for a message that cannot land. Both were a single local `/^0\d{9}$/` before.
 */
const SENDER_PHONE_PATTERN = THAI_LOCAL_PHONE_PATTERN;
const RECIPIENT_PHONE_PATTERN = THAI_MOBILE_PATTERN;

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
    standalone: false
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

  /** OBRS-960 — "ยังไม่ได้ตั้งอัตราส่วนแบ่งพัสดุ": a banner above the submit
   * button whenever the owner has no rate override for parcel revenue
   * share. Owned by the smart page (`ParcelConsignPageComponent`, reading
   * `ParcelShareConfigStore`) — this dumb form only renders what it's told,
   * fail-safe-to-showing is the STORE's contract, not this component's. */
  @Input() shareNotConfigured = false;

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

  /* OBRS-629 — server-served parcel limits. This form is the ONLY parcel sales
   * channel open at go-live (OBRS-622 gated the online wizard), and until this
   * card it asked the sender to attest their parcel held nothing prohibited
   * while showing them NO list at all. Built once per policy load and then read
   * by the template; never recomputed in a template expression, which would
   * allocate on every change-detection cycle. */
  protected prohibitedCategories: ProhibitedCategoryView[] = [];
  protected prohibitedLoadFailed = false;
  protected policyLoaded = false;
  /** Stable object identity for the `{{max}}` interpolation; mutated in place. */
  protected readonly weightMaxParams: { max: number } = { max: 0 };
  private maxWeightKg: number | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly parcelPolicyService: ParcelPolicyService
  ) {
    this.form = this.fb.group({
      senderName: ['', [Validators.required, Validators.maxLength(100)]],
      senderPhone: ['', [Validators.required, separatorTolerantPattern(SENDER_PHONE_PATTERN)]],
      recipientName: ['', [Validators.required, Validators.maxLength(100)]],
      recipientPhone: ['', [Validators.required, separatorTolerantPattern(RECIPIENT_PHONE_PATTERN)]],
      scheduleId: ['', [Validators.required]],
      pickupStopId: ['', [Validators.required]],
      dropoffStopId: ['', [Validators.required]],
      // OBRS-629 AC-3: was Validators.max(100) — a literal that could not move
      // when an admin moved parcel.max_weight_kg, on the channel that sells.
      weightKg: [
        null,
        [Validators.required, positiveWeightValidator(), configuredMaxWeightValidator(() => this.maxWeightKg)],
      ],
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
    this.loadParcelPolicy();

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

  /* OBRS-629 — the weight cap and the prohibited list, from the config
   * ParcelIntakeService enforces. On failure the list renders an explicit "ask
   * staff" message rather than a hardcoded fallback: the salesperson is about to
   * tick an attestation on the sender's behalf, so a plausible-but-stale list is
   * worse than an honest "we could not load it", and a silent empty list would
   * read as "nothing is prohibited". The weight cap simply stays uncapped
   * client-side — validateWeight still rejects at intake. */
  private loadParcelPolicy(): void {
    this.parcelPolicyService
      .getParcelPolicy()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const policy = res?.data;
          this.policyLoaded = true;
          this.prohibitedCategories = toProhibitedCategoryViews(policy?.prohibitedCategories);
          if (typeof policy?.maxWeightKg === 'number') {
            this.maxWeightKg = policy.maxWeightKg;
            this.weightMaxParams.max = policy.maxWeightKg;
            this.form.get('weightKg')?.updateValueAndValidity({ emitEvent: false });
          }
        },
        error: () => {
          this.policyLoaded = true;
          this.prohibitedLoadFailed = true;
          this.prohibitedCategories = [];
        },
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] && !changes['mode'].firstChange) {
      this.resetForMode(changes['mode'].currentValue as ParcelConsignMode);
    }
    // OBRS-615: switching to a trip with no seat list (an OPEN-seating one) must also drop a
    // seat choice made on the previous trip - the checkbox that produced it is gone, so nothing
    // else would ever clear it and it would ride along into the next submit.
    if (changes['availableSeatNumbers'] && !this.canSpecifySeats) {
      this.selectedSeatNumbers = [];
      this.form.get('specifySeats')?.setValue(false);
    }
  }

  /** OBRS-615: an OPEN-seating trip has no seat to pick - the page passes an empty list there
   * and the backend rejects any named seat on such a trip, so the whole opt-in is hidden. */
  protected get canSpecifySeats(): boolean {
    return this.availableSeatNumbers.length > 0;
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

  /** OBRS-341 (card AC follow-up) — "รับชิ้นต่อไป": the parent page's
   * `onNextItem()` calls this to blank the form for the NEXT item without a
   * mode change (`resetForMode()` above only fires from `ngOnChanges` on an
   * actual `mode` input change). Reuses the exact same reset — the current
   * mode's validators are already correct, so re-applying them is a no-op,
   * not a special case to maintain separately. */
  resetForNextItem(): void {
    this.resetForMode(this.mode);
  }

  // OBRS-691: same focus/blur regrouping idiom as account-page.component.ts,
  // parameterized by control name since this form has two independent phone
  // fields. emitConsignedSubmit()/emitCarryOnSubmit() below always strip
  // dashes before the value reaches the emitted payload.
  protected onPhoneFocus(controlName: 'senderPhone' | 'recipientPhone'): void {
    const control = this.form.get(controlName);
    control?.setValue(stripPhoneSeparators(control.value));
  }

  protected onPhoneBlur(controlName: 'senderPhone' | 'recipientPhone'): void {
    const control = this.form.get(controlName);
    control?.setValue(formatThaiMobile(control.value));
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
      recipientPhoneCtrl?.setValidators([Validators.required, separatorTolerantPattern(RECIPIENT_PHONE_PATTERN)]);
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

  /** Scrutinize (OBRS-341) — the submit button read "Consign parcel" in
   * carry-on mode too, which is the wrong verb for a branch that records a
   * carry-on item and mints no consignment/waybill at all. */
  protected get submitLabelKey(): string {
    return this.isCarryOnMode
      ? 'STAFF.PARCEL_CONSIGN.CARRY_ON.SUBMIT'
      : 'STAFF.PARCEL_CONSIGN.SUBMIT';
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
        if (!Number.isInteger(seatCount) || seatCount < 1) return false;
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
      // OBRS-691: the controls may carry display dashes (regrouped on blur) —
      // the backend stores/validates bare digits only.
      sender: { name: v.senderName.trim(), phone: stripPhoneSeparators(v.senderPhone) },
      recipient: { name: v.recipientName.trim(), phone: stripPhoneSeparators(v.recipientPhone) },
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
      // OBRS-691: same rationale as emitConsignedSubmit above.
      sender: { name: v.senderName.trim(), phone: stripPhoneSeparators(v.senderPhone) },
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
      // OBRS-455: two fields, two rules, two messages. The recipient must be a Thai mobile (the
      // arrival SMS goes there); the sender keeps the wider local rule, and telling a staff member
      // "10-digit phone number" for a field that now rejects 02... would be a dead end.
      if (fieldName === 'recipientPhone') {
        return 'STAFF.VALIDATION.THAI_MOBILE_INVALID';
      }
      if (fieldName === 'senderPhone') {
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
    // Scrutinize (OBRS-341): `Number.isInteger`, not `isFinite` — the server
    // field is an `Integer`, so a typo'd `2.5` used to reach the wire and
    // come back as a generic deserialization 400 instead of this message.
    if (ctrl.value === null || ctrl.value === '' || !Number.isInteger(value) || value < 1) {
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

  /** OBRS-1598 — called by the parent page when the DATE changes and a fresh
   * schedule list is about to be fetched: the round chosen belongs to the OLD
   * day and must not survive into the new one.
   *
   * ⛔ This one EMITS, and that is load-bearing — do NOT "make it consistent"
   * with the two clears below by adding `{ emitEvent: false }`. The page's
   * `onScheduleChange('')` is what drops the stop options, seat list, quote and
   * cargo state that hung off the old round; silencing the event leaves all of
   * those stale and only the id looks cleared. The sibling it actually matches
   * is `resetForMode()` above, whose `form.reset(...)` emits by default and
   * whose emission the page has relied on since OBRS-341 — the two below are
   * silent precisely because the page is already mid-cascade when it calls
   * them. A spec asserts the emission (`…dom.spec.ts`, "emits the cleared
   * value"), so this is caught, but the reason belongs here. */
  clearScheduleSelection(): void {
    this.form.patchValue({ scheduleId: '' });
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
