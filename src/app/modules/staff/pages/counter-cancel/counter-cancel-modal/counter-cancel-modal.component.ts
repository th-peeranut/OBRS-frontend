import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import {
  CancellationPolicy,
  CancelBookingReqDto,
  CancelBookingResult,
  CASH_REFUND_METHOD,
  MANUAL_REFUND_METHOD,
  formatRefundAmount,
  refundLane,
  toAmountNumber,
} from '../../../../../shared/interfaces/my-booking.interface';
import { CounterBookingSearchResultDto, StaffApiService } from '../../../../../services/staff/staff-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { AuthService } from '../../../../../auth/auth.service';
import { errorCodeFromMessageKey, extractApiErrorCode } from '../../../../../shared/lib/api-error-code';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import {
  buildRefundDestinationForm,
  applyRefundDestinationRequired,
  toRefundDestinationPayload,
} from '../../../../../shared/lib/refund-destination-form';

/**
 * OBRS-766 (QA-caught, see `api-error-code.ts`'s `errorCodeFromMessageKey`
 * doc comment for the full incident): the wire `error.error.errorCode`
 * NEVER carries the dotted `messageKey` form — every code this component
 * compares against is DERIVED from its messageKey, never hand-typed as a
 * second SCREAMING_SNAKE literal, so the two representations cannot drift
 * apart again. The messageKey strings below are the actual backend i18n
 * bundle keys (`cancel.error.*`, `RefundApprovalService`'s three
 * `ForbiddenException`s derive the same way with no explicit errorCode).
 */
const CANCEL_ERROR = {
  WINDOW_CLOSED: errorCodeFromMessageKey('cancel.error.window-closed'),
  APPROVAL_REQUIRED: errorCodeFromMessageKey('cancel.error.approval-required'),
  APPROVER_INVALID: errorCodeFromMessageKey('cancel.error.approver-invalid'),
  APPROVER_NOT_OWNER: errorCodeFromMessageKey('cancel.error.approver-not-owner'),
  APPROVER_SELF: errorCodeFromMessageKey('cancel.error.approver-self'),
  REFUND_DESTINATION_REQUIRED: errorCodeFromMessageKey('cancel.error.refund-destination-required'),
  REFUND_DESTINATION_INVALID: errorCodeFromMessageKey('cancel.error.refund-destination-invalid'),
} as const;

/** Errors this endpoint can 400/409 with that this modal must place BY the
 * relevant field group, rather than the generic banner — mirrors
 * `OverrideCancelModalComponent`'s `REFUND_DESTINATION_ERROR_CODES` set. */
const REFUND_DESTINATION_ERROR_CODES = new Set<string>([
  CANCEL_ERROR.REFUND_DESTINATION_REQUIRED,
  CANCEL_ERROR.REFUND_DESTINATION_INVALID,
]);
const APPROVER_ERROR_CODES = new Set<string>([
  CANCEL_ERROR.APPROVAL_REQUIRED,
  CANCEL_ERROR.APPROVER_INVALID,
  CANCEL_ERROR.APPROVER_NOT_OWNER,
  CANCEL_ERROR.APPROVER_SELF,
]);

/**
 * OBRS-766 preview state machine — independent of the booking summary, which
 * renders immediately (optimistic open) from the row already in hand.
 *   - 'loading'  → fetching the policy.
 *   - 'blocked'  → `CANCEL_ERROR_WINDOW_CLOSED` (wire code derived from
 *     messageKey `cancel.error.window-closed`). TERMINAL (ADR-0103): no
 *     retry, no override affordance — that is the OWNER-only override modal,
 *     a different surface.
 *   - 'error'    → any other fetch failure. Confirm disabled, Retry re-fires.
 *   - 'resolved' → the policy preview IS the modal's primary content; the
 *     operator must see the amount before Confirm unblocks.
 */
export type CounterCancelPreviewState = 'loading' | 'blocked' | 'error' | 'resolved';

/**
 * OBRS-766 — the counter (staff act-on-behalf) cancel confirmation. Opens
 * OPTIMISTICALLY the instant a row is clicked (design-system §6): the
 * booking summary below renders from `[booking]` immediately, while
 * `previewState` independently tracks the refund-policy fetch.
 *
 * Component-local state only (no NgRx) — same precedent
 * `OverrideCancelModalComponent` already set for this exact shape: an
 * isolated staff/admin modal with nothing to plug a store into, as opposed
 * to the customer `my-bookings` flow, which is NgRx only because it plugs
 * into a pre-existing store.
 */
@Component({
  selector: 'app-counter-cancel-modal',
  templateUrl: './counter-cancel-modal.component.html',
  styleUrl: './counter-cancel-modal.component.scss',
})
export class CounterCancelModalComponent implements OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() booking: CounterBookingSearchResultDto | null = null;
  @Output() readonly cancelled = new EventEmitter<void>();
  @Output() readonly closed = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  protected previewState: CounterCancelPreviewState = 'loading';
  protected policy: CancellationPolicy | null = null;
  protected isSubmitting = false;
  protected errorMessage = '';
  protected approverErrorMessage = '';
  protected destinationErrorMessage = '';
  protected readonly form: FormGroup;

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly authService: AuthService,
    private readonly translate: TranslateService
  ) {
    this.form = this.formBuilder.group({
      approverEmail: [''],
      approverPassword: [''],
      destination: buildRefundDestinationForm(this.formBuilder),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen']) {
      return;
    }
    if (this.isOpen) {
      // Every open starts clean, mirroring OverrideCancelModalComponent.
      this.previewState = 'loading';
      this.policy = null;
      this.isSubmitting = false;
      this.errorMessage = '';
      this.approverErrorMessage = '';
      this.destinationErrorMessage = '';
      this.form.reset({ approverEmail: '', approverPassword: '' });
      this.applyApproverValidators(false);
      this.applyDestinationValidators(false);
      this.fetchPolicy();
    }
  }

  // ── Policy preview (independent state machine) ───────────────────────────

  private fetchPolicy(): void {
    const booking = this.booking;
    if (!booking) {
      return;
    }
    this.previewState = 'loading';
    this.staffApiService
      .getCancelPolicy(booking.bookingId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.policy = response.data ?? null;
          this.previewState = 'resolved';
          this.applyApproverValidators(this.isCashRefund);
          this.applyDestinationValidators(this.isManualRefund);
        },
        error: (error) => {
          const code = extractApiErrorCode(error, null);
          // ADR-0103: window-closed is TERMINAL — no retry, no override
          // affordance. Everything else gets the Retry button (this modal's
          // deliberate divergence from OverrideCancelModalComponent's
          // refund-method check: THIS fetch is the modal's primary content,
          // so a failure blocks Confirm outright rather than degrading to
          // "optional").
          this.previewState = code === CANCEL_ERROR.WINDOW_CLOSED ? 'blocked' : 'error';
        },
      });
  }

  protected retryCheck(): void {
    this.fetchPolicy();
  }

  protected get isCashRefund(): boolean {
    return this.policy?.refundMethod === CASH_REFUND_METHOD;
  }

  protected get isManualRefund(): boolean {
    return this.policy?.refundMethod === MANUAL_REFUND_METHOD;
  }

  // ── Cash step-up approver fields ──────────────────────────────────────────

  /** Soft client-side check (UX spec §CASH step 4): disables Confirm and
   * shows the inline hint the instant the typed email matches the LOGGED-IN
   * salesperson's own username. This is a nudge only, not the control — the
   * backend's `CANCEL_ERROR_APPROVER_SELF` (messageKey `cancel.error.approver-self`)
   * is the real gate (it also catches a salesperson holding two accounts,
   * which this cannot). */
  private readonly approverNotSelfValidator = (control: AbstractControl): ValidationErrors | null => {
    const email = String(control.value ?? '').trim().toLowerCase();
    if (!email) {
      return null;
    }
    const username = (this.authService.getUsername() ?? '').trim().toLowerCase();
    return username && email === username ? { self: true } : null;
  };

  private applyApproverValidators(required: boolean): void {
    const email = this.form.get('approverEmail');
    const password = this.form.get('approverPassword');
    if (required) {
      email?.setValidators([Validators.required, Validators.email, this.approverNotSelfValidator]);
      password?.setValidators([Validators.required]);
    } else {
      email?.clearValidators();
      password?.clearValidators();
    }
    email?.updateValueAndValidity({ emitEvent: false });
    password?.updateValueAndValidity({ emitEvent: false });
  }

  protected get approverEmailControl(): AbstractControl | null {
    return this.form.get('approverEmail');
  }

  protected get approverPasswordControl(): AbstractControl | null {
    return this.form.get('approverPassword');
  }

  protected get isApproverSelf(): boolean {
    return !!this.approverEmailControl?.hasError('self');
  }

  protected get isApproverEmailInvalid(): boolean {
    const control = this.approverEmailControl;
    return !!control && control.invalid && !control.hasError('self') && (control.dirty || control.touched);
  }

  protected get isApproverPasswordInvalid(): boolean {
    const control = this.approverPasswordControl;
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  // ── Manual-refund destination fields ─────────────────────────────────────

  protected get destinationForm(): FormGroup {
    return this.form.get('destination') as FormGroup;
  }

  private applyDestinationValidators(required: boolean): void {
    applyRefundDestinationRequired(this.destinationForm, required);
  }

  // ── Display helpers ──────────────────────────────────────────────────────

  protected get bookingNumber(): string {
    return this.booking?.bookingNumber ?? '-';
  }

  protected get contactName(): string {
    return this.booking?.contactName ?? '-';
  }

  protected get refundLabel(): string {
    return this.formatCurrency(this.policy?.refundAmount ?? 0);
  }

  protected get penaltyLabel(): string {
    return this.formatCurrency(this.policy?.penaltyAmount ?? 0);
  }

  protected formatCurrency(value: number | string): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 2,
    }).format(toAmountNumber(value));
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  protected requestClose(): void {
    if (this.isSubmitting) {
      return;
    }
    this.closed.emit();
  }

  protected get canSubmit(): boolean {
    return !this.isSubmitting && this.form.valid && this.previewState === 'resolved';
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const booking = this.booking;
    if (!booking || this.previewState !== 'resolved') {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.approverErrorMessage = '';
    this.destinationErrorMessage = '';

    // FE-1 (byte-identical regression): payload starts as a genuinely EMPTY
    // object and only ever gains fields inside a branch that applies to THIS
    // booking's resolved refund method — never an empty-string/null default
    // for the branch that doesn't apply.
    const payload: CancelBookingReqDto = {};
    if (this.isCashRefund) {
      payload.approverEmail = String(this.form.get('approverEmail')?.value ?? '').trim();
      payload.approverPassword = String(this.form.get('approverPassword')?.value ?? '');
    } else if (this.isManualRefund) {
      payload.refundDestination = toRefundDestinationPayload(this.destinationForm);
    }

    this.staffApiService
      .cancelCounterBooking(booking.bookingId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isSubmitting = false;
          this.cancelled.emit();
          this.closed.emit();
          void this.alertService.success(this.successMessage(response?.data));
        },
        error: (error) => {
          this.isSubmitting = false;
          this.handleSubmitError(error);
        },
      });
  }

  /**
   * OBRS-843: the confirmation the salesperson reads, built from the CANCEL
   * RESPONSE — never from `response.message`.
   *
   * That envelope field is `ApiSuccessRespDto`'s, assembled from
   * `HttpStatus.OK.getReasonPhrase()`, so it is the literal string "OK" on every
   * 2xx this API returns. `response?.message || translate.instant(...)` therefore
   * never reached its right-hand side: the left was never empty. The Thai
   * translation below existed, was correct, and was dead code — the owner
   * photographed a confirmation dialog titled "OK".
   *
   * The cash lane is the one that matters most: this screen is where a
   * salesperson decides how many baht to take out of the drawer and hand back,
   * and `CancelBookingRespDto.refundAmount` is the only place that number is
   * stated. Showing "OK" there did not just lose a translation, it withheld the
   * figure the transaction depends on.
   *
   * Falls back to the bare confirmation only if `data` is missing entirely — a
   * shape the endpoint does not return today, but the cancel HAS happened by
   * then, so the dialog must still confirm it rather than read as a failure.
   */
  private successMessage(result: CancelBookingResult | null | undefined): string {
    if (!result) {
      return this.translate.instant('STAFF.CANCEL_BOOKING.MODAL.SUCCESS');
    }
    const refund = formatRefundAmount(result.refundAmount);
    switch (refundLane(result.refundMethod)) {
      case 'CASH':
        return this.translate.instant('STAFF.CANCEL_BOOKING.MODAL.SUCCESS_CASH', { refund });
      case 'MANUAL':
        return this.translate.instant('STAFF.CANCEL_BOOKING.MODAL.SUCCESS_MANUAL', { refund });
      default:
        return this.translate.instant('STAFF.CANCEL_BOOKING.MODAL.SUCCESS_AUTO', { refund });
    }
  }

  private handleSubmitError(error: unknown): void {
    const code = extractApiErrorCode(error, null);

    if (code === CANCEL_ERROR.WINDOW_CLOSED) {
      // The window closed between open and submit — return to the same
      // terminal preview state the initial fetch would have landed on.
      this.previewState = 'blocked';
      return;
    }

    if (code && REFUND_DESTINATION_ERROR_CODES.has(code)) {
      this.destinationErrorMessage =
        extractApiErrorMessage(error) || this.translate.instant('REFUND_DESTINATION.ERROR.SERVER_INVALID');
      return;
    }

    if (code && APPROVER_ERROR_CODES.has(code)) {
      if (code === CANCEL_ERROR.APPROVER_INVALID || code === CANCEL_ERROR.APPROVER_SELF) {
        // Never leave a rejected password in the DOM.
        this.form.get('approverPassword')?.setValue('');
      }
      this.approverErrorMessage =
        code === CANCEL_ERROR.APPROVER_SELF
          ? // Same copy as the client-side hint (UX spec) — the rejection
            // reads as confirmation of a stated rule, not a new surprise.
            this.translate.instant('STAFF.CANCEL_BOOKING.MODAL.APPROVER_SELF')
          : extractApiErrorMessage(error) || this.translate.instant(this.approverErrorKey(code));
      return;
    }

    this.errorMessage = extractApiErrorMessage(error) || this.translate.instant('STAFF.CANCEL_BOOKING.MODAL.FAILED');
  }

  private approverErrorKey(code: string): string {
    switch (code) {
      case CANCEL_ERROR.APPROVAL_REQUIRED:
        return 'STAFF.CANCEL_BOOKING.MODAL.APPROVAL_REQUIRED';
      case CANCEL_ERROR.APPROVER_INVALID:
        return 'STAFF.CANCEL_BOOKING.MODAL.APPROVER_INVALID';
      case CANCEL_ERROR.APPROVER_NOT_OWNER:
        return 'STAFF.CANCEL_BOOKING.MODAL.APPROVER_NOT_OWNER';
      default:
        return 'STAFF.CANCEL_BOOKING.MODAL.FAILED';
    }
  }
}
