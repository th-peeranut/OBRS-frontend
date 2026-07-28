import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ParcelOnlineQuoteParams, ParcelQuoteRespDto } from '../../../../shared/interfaces/parcel.interface';
import {
  ANY_DIGITS_PHONE_PATTERN,
  formatThaiMobile,
  separatorTolerantPattern,
  stripPhoneSeparators,
  THAI_MOBILE_PATTERN,
} from '../../../../shared/constants/thai-msisdn';

export interface ParcelDetailsFormValue {
  senderPhone: string;
  recipient: { name: string; phone: string };
  weightKg: number;
  description: string;
  prohibitedAcknowledged: boolean;
  dimensions?: { lengthCm: number; widthCm: number; heightCm: number };
}

export interface ProhibitedCategory {
  icon: string;
  i18nKey: string;
}

/** The prohibited-categories disclosure list — static/hardcoded (UX-OBRS-415
 * §0-C / §6): there is no GET endpoint for it (OBRS-438 tracks adding one).
 * Matches the DB seed of known categories as of 2026-07-16. Shown in full,
 * unhidden, directly above the acknowledgement checkbox — never behind an
 * accordion/tooltip/second click (a required disclosure hidden behind an
 * extra interaction is the anti-pattern this design explicitly avoids). */
export const PROHIBITED_CATEGORIES: ProhibitedCategory[] = [
  { icon: 'local_fire_department', i18nKey: 'PARCEL_BOOKING.PROHIBITED.FLAMMABLE' },
  { icon: 'warning', i18nKey: 'PARCEL_BOOKING.PROHIBITED.EXPLOSIVE' },
  { icon: 'gavel', i18nKey: 'PARCEL_BOOKING.PROHIBITED.WEAPON' },
  { icon: 'medication', i18nKey: 'PARCEL_BOOKING.PROHIBITED.NARCOTIC' },
  { icon: 'sentiment_very_dissatisfied', i18nKey: 'PARCEL_BOOKING.PROHIBITED.CORPSE' },
];

/**
 * OBRS-455 split what used to be one `PHONE_PATTERN` here, because the backend's two rules were
 * never the same rule. `senderPhone` keeps `ParcelOnlineReqDto`'s wide contract (ADR-0082, now
 * Accepted — nothing texts the sender), while `validateRecipient` was narrowed to the Thai-mobile
 * rule: the recipient is who the arrival SMS goes to. Mirroring both keeps the form from
 * promising something the API will reject, in either direction.
 */
const SENDER_PHONE_PATTERN = ANY_DIGITS_PHONE_PATTERN;
const RECIPIENT_PHONE_PATTERN = THAI_MOBILE_PATTERN;

/** >0 — `Validators.required`/`Validators.min(0)` alone allow 0. */
function positiveWeightValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === '' || value === undefined) return null;
    return Number(value) > 0 ? null : { positiveWeight: true };
  };
}

/** All-or-none dimensions — same convention as the staff consign form's
 * `dimensionsAllOrNoneValidator`. */
function dimensionsAllOrNoneValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const length = group.get('lengthCm')?.value;
    const width = group.get('widthCm')?.value;
    const height = group.get('heightCm')?.value;
    const filled = [length, width, height].filter((v) => v !== null && v !== '' && v !== undefined);
    if (filled.length === 0 || filled.length === 3) return null;
    return { dimensionsIncomplete: true };
  };
}

/**
 * Dumb form: phase 2 (Details) of the parcel booking wizard — UX-OBRS-415
 * §4.2. Sender NAME is a read-only display (`senderNameDisplay`) — it is
 * NOT a form control, the backend derives it server-side and the client
 * cannot supply it (SPEC-OBRS-415 §1.4/§0.4). Sender PHONE IS an input:
 * required, prefilled from the account when present, editable.
 */
@Component({
  selector: 'app-parcel-details-form',
  templateUrl: './parcel-details-form.component.html',
  styleUrl: './parcel-details-form.component.scss',
})
export class ParcelDetailsFormComponent implements OnInit, OnChanges, OnDestroy {
  @Input() senderNameDisplay = '';
  @Input() senderPhonePrefill: string | null = null;

  /** Trip-phase selections needed to build the full quote request — this
   * form only owns `weightKg`. */
  @Input() scheduleId: number | null = null;
  @Input() pickupStopId: number | null = null;
  @Input() dropoffStopId: number | null = null;

  @Input() quote: ParcelQuoteRespDto | null = null;
  @Input() isLoadingQuote = false;
  @Input() quoteErrorKey: string | null = null;

  @Input() serverErrorKey: string | null = null;
  @Input() isSubmitting = false;

  @Output() quoteParamsChange = new EventEmitter<ParcelOnlineQuoteParams | null>();
  @Output() submitForm = new EventEmitter<ParcelDetailsFormValue>();

  protected readonly prohibitedCategories = PROHIBITED_CATEGORIES;
  protected readonly form: FormGroup;
  private readonly destroy$ = new Subject<void>();
  private prefillApplied = false;

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group({
      senderPhone: ['', [Validators.required, separatorTolerantPattern(SENDER_PHONE_PATTERN)]],
      recipientName: ['', [Validators.required, Validators.maxLength(100)]],
      recipientPhone: ['', [Validators.required, separatorTolerantPattern(RECIPIENT_PHONE_PATTERN)]],
      weightKg: [null, [Validators.required, positiveWeightValidator(), Validators.max(100)]],
      description: ['', [Validators.required, Validators.maxLength(500)]],
      dimensions: this.fb.group(
        { lengthCm: [null], widthCm: [null], heightCm: [null] },
        { validators: dimensionsAllOrNoneValidator() }
      ),
      prohibitedAcknowledged: [false, [Validators.requiredTrue]],
    });
  }

  ngOnInit(): void {
    this.form.valueChanges.pipe(debounceTime(400), takeUntil(this.destroy$)).subscribe(() => {
      this.emitQuoteParams();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Prefill senderPhone exactly once, the first time it arrives — never
    // clobber what the customer has since typed (design-system: never let a
    // late response overwrite an in-progress edit).
    if (!this.prefillApplied && changes['senderPhonePrefill'] && this.senderPhonePrefill) {
      // OBRS-691: display grouped, same as every other phone field at rest.
      this.form.get('senderPhone')?.setValue(formatThaiMobile(this.senderPhonePrefill));
      this.prefillApplied = true;
    }
  }

  // OBRS-691: same focus/blur regrouping idiom as account-page.component.ts,
  // parameterized by control name since this form has two independent phone
  // fields. onSubmit() below always strips dashes before the value reaches
  // the emitted payload.
  protected onPhoneFocus(controlName: 'senderPhone' | 'recipientPhone'): void {
    const control = this.form.get(controlName);
    control?.setValue(stripPhoneSeparators(control.value));
  }

  protected onPhoneBlur(controlName: 'senderPhone' | 'recipientPhone'): void {
    const control = this.form.get(controlName);
    control?.setValue(formatThaiMobile(control.value));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private emitQuoteParams(): void {
    const weightKg = Number(this.form.get('weightKg')?.value);
    if (
      !this.scheduleId ||
      !this.pickupStopId ||
      !this.dropoffStopId ||
      !Number.isFinite(weightKg) ||
      weightKg <= 0
    ) {
      this.quoteParamsChange.emit(null);
      return;
    }

    this.quoteParamsChange.emit({
      scheduleId: this.scheduleId,
      pickupStopId: this.pickupStopId,
      dropoffStopId: this.dropoffStopId,
      weightKg,
    });
  }

  protected get canSubmit(): boolean {
    return this.form.valid && !this.isSubmitting;
  }

  protected onSubmit(): void {
    if (this.isSubmitting) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.value as {
      senderPhone: string;
      recipientName: string;
      recipientPhone: string;
      weightKg: number;
      description: string;
      dimensions: { lengthCm: number | null; widthCm: number | null; heightCm: number | null };
      prohibitedAcknowledged: boolean;
    };

    const payload: ParcelDetailsFormValue = {
      // OBRS-691: the controls may carry display dashes (regrouped on blur) —
      // the backend stores/validates bare digits only.
      senderPhone: stripPhoneSeparators(v.senderPhone),
      recipient: { name: v.recipientName.trim(), phone: stripPhoneSeparators(v.recipientPhone) },
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
    if (errors['required']) return 'PARCEL_BOOKING.VALIDATION.REQUIRED';
    // OBRS-455: recipientPhone is now the Thai-mobile rule (the arrival SMS goes to it) while
    // senderPhone keeps the wide one - so the message has to follow the field, not the form.
    if (errors['pattern']) {
      return fieldName === 'recipientPhone'
        ? 'PARCEL_BOOKING.VALIDATION.THAI_MOBILE_INVALID'
        : 'PARCEL_BOOKING.VALIDATION.PHONE_INVALID';
    }
    if (errors['maxlength']) return 'PARCEL_BOOKING.VALIDATION.REQUIRED';
    if (errors['positiveWeight']) return 'PARCEL_BOOKING.VALIDATION.WEIGHT_POSITIVE';
    if (errors['max']) return 'PARCEL_BOOKING.VALIDATION.WEIGHT_MAX';
    return 'PARCEL_BOOKING.VALIDATION.REQUIRED';
  }

  protected get dimensionsGroup(): FormGroup {
    return this.form.get('dimensions') as FormGroup;
  }

  protected get isDimensionsIncomplete(): boolean {
    const group = this.dimensionsGroup;
    return group.invalid && (group.dirty || group.touched);
  }
}
