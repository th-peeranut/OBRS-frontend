import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
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

/** OBRS-844: the approval code is always exactly six digits (server-generated, zero-padded). */
const APPROVAL_CODE_LENGTH = 6;

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
 *
 * OBRS-844 — the cash step-up no longer asks the owner to type their password
 * into this browser. The salesperson asks, the owner authorizes from their own
 * device, and six digits come back to this screen.
 *
 * **Why this screen does not wait for the approval by itself.** The obvious
 * design is to poll (or subscribe) until the owner approves and then unlock
 * Confirm without anyone typing anything. Measured against the code on `dev`,
 * that is the expensive option: the app's STOMP setup has exactly one
 * destination and `StompAuthChannelInterceptor` restricts it to role ADMIN, so
 * a salesperson can subscribe to nothing today; and ADR-0043's in-memory broker
 * would start dropping approvals silently the day the backend runs on more than
 * one instance. Polling would trade that for an unbounded open request against
 * a screen the operator may leave sitting all afternoon. Six typed digits fail
 * loudly and cost nothing to run.
 */
@Component({
    selector: 'app-counter-cancel-modal',
    templateUrl: './counter-cancel-modal.component.html',
    styleUrl: './counter-cancel-modal.component.scss',
    standalone: false
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

  /**
   * OBRS-844 — where the cash step-up has got to. Independent of
   * `previewState` for the same reason that one is independent of the booking
   * summary: they resolve on different clocks, and folding them together
   * would make a slow policy fetch look like a failed approval request.
   *   - 'idle'      → the salesperson has not asked yet.
   *   - 'requesting'→ the ask is in flight.
   *   - 'requested' → the owners have been notified; waiting for them to read
   *     out a code. There is no polling here on purpose (see the component
   *     javadoc) — the counter learns the code from the owner, not the server.
   *   - 'failed'    → the ask itself failed; the button re-arms.
   */
  protected approvalState: 'idle' | 'requesting' | 'requested' | 'failed' = 'idle';

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.form = this.formBuilder.group({
      approvalCode: [''],
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
      this.approvalState = 'idle';
      this.form.reset({ approvalCode: '' });
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

  /**
   * OBRS-1136 AC-3 — same published wait as the customer's own cancel dialog, off the same
   * `/cancel-policy` quote. This screen reuses `MY_BOOKINGS.CANCEL.MANUAL_REFUND_NOTE`, so it has
   * to supply the same parameter; the salesperson is about to say this out loud to the person
   * standing at the counter, and them hearing a different number from the one the customer's own
   * screen shows is exactly the drift AC-2's rule exists to prevent. Null-guarded for the same
   * split-deploy reason as the customer modal.
   */
  protected get manualRefundDueDays(): number | null {
    const days = this.policy?.manualRefundDueDays;
    return typeof days === 'number' && days > 0 ? days : null;
  }

  // ── Cash step-up: ask the owner, then type the code they issue ────────────

  private applyApproverValidators(required: boolean): void {
    const code = this.form.get('approvalCode');
    if (required) {
      code?.setValidators([
        Validators.required,
        Validators.pattern(`^\\d{${APPROVAL_CODE_LENGTH}}$`),
      ]);
    } else {
      code?.clearValidators();
    }
    code?.updateValueAndValidity({ emitEvent: false });
  }

  protected get approvalCodeControl(): AbstractControl | null {
    return this.form.get('approvalCode');
  }

  protected get isApprovalCodeInvalid(): boolean {
    const control = this.approvalCodeControl;
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  protected readonly approvalCodeLength = APPROVAL_CODE_LENGTH;

  /**
   * Asks the fleet's owners to authorize this refund. The owner reads the code
   * back to the counter; there is deliberately no live channel that would push
   * it here (see the component javadoc), so nothing is polled after this.
   */
  protected requestApproval(): void {
    const booking = this.booking;
    if (!booking || this.approvalState === 'requesting') {
      return;
    }
    this.approvalState = 'requesting';
    this.approverErrorMessage = '';
    this.staffApiService
      .requestCashRefundApproval(booking.bookingId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.approvalState = 'requested';
        },
        error: (error) => {
          this.approvalState = 'failed';
          this.approverErrorMessage =
            extractApiErrorMessage(error) ||
            this.translate.instant('STAFF.CANCEL_BOOKING.MODAL.APPROVAL_REQUEST_FAILED');
        },
      });
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
      payload.approvalCode = String(this.form.get('approvalCode')?.value ?? '').trim();
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
      if (code === CANCEL_ERROR.APPROVER_INVALID) {
        // OBRS-844: clear the rejected code. A code the server has refused is
        // dead in every case that produces this error — expired, already used,
        // wrong booking — so leaving it in the field would only invite the
        // salesperson to press Confirm again and burn an attempt against a
        // request that can no longer succeed.
        this.form.get('approvalCode')?.setValue('');
        // The old request is spent either way, so the counter has to ask again.
        this.approvalState = 'idle';
      }
      this.approverErrorMessage =
        code === CANCEL_ERROR.APPROVER_SELF
          ? this.translate.instant('STAFF.CANCEL_BOOKING.MODAL.APPROVER_SELF')
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
