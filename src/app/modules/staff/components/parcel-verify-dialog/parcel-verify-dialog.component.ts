import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';

export type ParcelVerifyOutcome = 'accept' | 'reject';

export interface ParcelVerifyFormValue {
  actualWeightKg: number;
  actualLengthCm: number;
  actualWidthCm: number;
  actualHeightCm: number;
  /** Only populated when the staff member picked Reject. */
  rejectReason?: string;
}

/** >0 — Validators.min(0)/required alone allow 0. Same shape as
 * `parcel-consign-form`'s `positiveWeightValidator()` (reused idiom, not
 * reinvented — this form's fields are a different set, so it isn't a
 * candidate for actually sharing the function instance). */
function positiveValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === '' || value === undefined) {
      return null; // Validators.required handles emptiness
    }
    return Number(value) > 0 ? null : { positiveValue: true };
  };
}

/** Tolerance so float/rounding noise never flags a false mismatch — purely
 * visual, never blocks either outcome (design-system §12 new-pattern note). */
const WEIGHT_TOLERANCE_KG = 0.05;
const DIMENSION_TOLERANCE_CM = 1;

type MeasuredField = 'actualWeightKg' | 'actualLengthCm' | 'actualWidthCm' | 'actualHeightCm';

/**
 * OBRS-416: dumb component, the physical verification form. Inline
 * `.admin-modal-backdrop` dialog (`adminModalBackdrop` directive, OBRS-272
 * precedent already used by `ParcelCollectDialogComponent`) — not a new
 * dialog primitive. The parent page owns the `verifyParcel()` HTTP call
 * (including the reject-confirmation `AlertService.confirm()` step) and
 * feeds back `isSubmitting`/`serverErrorKey`, identical split to
 * `ParcelCollectDialogComponent`/`ParcelConsignFormComponent`.
 */
@Component({
    selector: 'app-parcel-verify-dialog',
    templateUrl: './parcel-verify-dialog.component.html',
    styleUrl: './parcel-verify-dialog.component.scss',
    standalone: false
})
export class ParcelVerifyDialogComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() parcel: ParcelDeliveryListItemDto | null = null;
  @Input() isSubmitting = false;
  @Input() serverErrorKey: string | null = null;

  @Output() dismiss = new EventEmitter<void>();
  @Output() confirmAccept = new EventEmitter<ParcelVerifyFormValue>();
  @Output() confirmReject = new EventEmitter<ParcelVerifyFormValue>();

  protected readonly form: FormGroup;

  // design-system §3.1's "no silent default" rule, extended here to the
  // highest-stakes choice on the form: neither Accept nor Reject is
  // pre-selected on open, so a driver can never fat-finger Submit before
  // consciously picking one.
  protected outcome: ParcelVerifyOutcome | null = null;

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group({
      actualWeightKg: [null, [Validators.required, positiveValidator()]],
      actualLengthCm: [null, [Validators.required, positiveValidator()]],
      actualWidthCm: [null, [Validators.required, positiveValidator()]],
      actualHeightCm: [null, [Validators.required, positiveValidator()]],
      rejectReason: ['', [Validators.maxLength(500)]],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.form.reset({
        actualWeightKg: null,
        actualLengthCm: null,
        actualWidthCm: null,
        actualHeightCm: null,
        rejectReason: '',
      });
      this.outcome = null;
      this.applyRejectReasonValidator();
    }
  }

  /** A tap on the already-selected segment is a no-op — mirrors
   * `InspectionPageComponent.selectVerdict()`'s guard against re-firing a
   * false "switching outcome" signal. */
  protected selectOutcome(value: ParcelVerifyOutcome): void {
    if (this.isSubmitting || this.outcome === value) {
      return;
    }
    this.outcome = value;
    this.applyRejectReasonValidator();
  }

  protected get canSubmit(): boolean {
    if (this.isSubmitting || !this.outcome) {
      return false;
    }
    const measurementsValid =
      this.form.get('actualWeightKg')!.valid &&
      this.form.get('actualLengthCm')!.valid &&
      this.form.get('actualWidthCm')!.valid &&
      this.form.get('actualHeightCm')!.valid;
    if (!measurementsValid) {
      return false;
    }
    return this.outcome === 'accept' || this.form.get('rejectReason')!.valid;
  }

  /** Purely visual (design-system §12): never disables submit, never blocks
   * either outcome, never touches any amount/price field — there is none on
   * this screen (no repricing, ever). */
  protected isMismatch(fieldName: MeasuredField): boolean {
    if (!this.parcel) {
      return false;
    }
    const control = this.form.get(fieldName)!;
    if (control.value === null || control.value === '') {
      return false;
    }
    const measured = Number(control.value);
    if (!Number.isFinite(measured)) {
      return false;
    }

    const declared = this.declaredValueFor(fieldName);
    if (declared === null || declared === undefined) {
      return false;
    }

    const tolerance = fieldName === 'actualWeightKg' ? WEIGHT_TOLERANCE_KG : DIMENSION_TOLERANCE_CM;
    return Math.abs(measured - declared) > tolerance;
  }

  private declaredValueFor(fieldName: MeasuredField): number | null | undefined {
    if (!this.parcel) {
      return null;
    }
    switch (fieldName) {
      case 'actualWeightKg':
        return this.parcel.weightKg;
      case 'actualLengthCm':
        return this.parcel.lengthCm;
      case 'actualWidthCm':
        return this.parcel.widthCm;
      case 'actualHeightCm':
        return this.parcel.heightCm;
    }
  }

  protected onDismiss(): void {
    if (this.isSubmitting) {
      return;
    }
    this.dismiss.emit();
  }

  protected onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }
    this.form.markAllAsTouched();
    if (!this.outcome || !this.canSubmit) {
      return;
    }

    const raw = this.form.value as {
      actualWeightKg: number;
      actualLengthCm: number;
      actualWidthCm: number;
      actualHeightCm: number;
      rejectReason: string;
    };
    const value: ParcelVerifyFormValue = {
      actualWeightKg: Number(raw.actualWeightKg),
      actualLengthCm: Number(raw.actualLengthCm),
      actualWidthCm: Number(raw.actualWidthCm),
      actualHeightCm: Number(raw.actualHeightCm),
    };

    if (this.outcome === 'reject') {
      value.rejectReason = String(raw.rejectReason ?? '').trim();
      // The parent page intercepts this and runs AlertService.confirm()
      // (the money-moving, terminal reject-confirmation step) BEFORE the
      // actual verifyParcel() HTTP call fires — see the parent page's
      // onConfirmReject().
      this.confirmReject.emit(value);
    } else {
      this.confirmAccept.emit(value);
    }
  }

  /** Switching outcome away from reject clears the reason control's VALUE
   * (not just hiding the textarea) so stale text is never silently
   * resubmitted if the staff member flips back and forth — same idiom as
   * `InspectionPageComponent.buildItemGroup()`'s verdict/note pairing. */
  private applyRejectReasonValidator(): void {
    const control = this.form.get('rejectReason')!;
    if (this.outcome === 'reject') {
      control.setValidators([Validators.required, Validators.maxLength(500)]);
    } else {
      control.setValue('', { emitEvent: false });
      control.setValidators([Validators.maxLength(500)]);
    }
    control.updateValueAndValidity({ emitEvent: false });
  }
}
