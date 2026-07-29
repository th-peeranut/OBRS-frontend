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
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminBookingDetailDto,
  OverrideRefundRateChoice,
  getAdminLookupLabel,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { errorCodeFromMessageKey, extractApiErrorCode } from '../../../../../shared/lib/api-error-code';
import {
  CancelBookingResult,
  formatRefundAmount,
  refundLane,
} from '../../../../../shared/interfaces/my-booking.interface';
import { trimmedRequiredValidator } from '../../../../../shared/validators/trimmed-required.validator';
import { formatDisplayDateTime } from '../../../../../shared/lib/display-date-time';
import {
  applyRefundDestinationRequired,
  buildRefundDestinationForm,
  toRefundDestinationPayload,
} from '../../../../../shared/lib/refund-destination-form';

/** OBRS-286: the two destination error codes `adminOverrideCancelBooking` can
 * 400 with — SA-SPEC-OBRS-286.md contract #2, same set as the customer path.
 *
 * OBRS-839: these were compared as the dotted `messageKey` form, which the wire
 * `errorCode` field NEVER carries — `CancellationService` throws both without an
 * explicit errorCode, so `DomainException.getErrorCode()` derives
 * `CANCEL_ERROR_REFUND_DESTINATION_REQUIRED`. The set could not match, and the
 * dedicated inline message OBRS-286 AC-1 put next to the destination fields has
 * never rendered on this screen: every rejection fell through to the generic
 * banner, which does not say WHICH field to fix. Derived via
 * `errorCodeFromMessageKey()` rather than hand-typed, so the two forms cannot
 * drift apart again (see its doc comment). */
const REFUND_DESTINATION_ERROR_CODES = new Set<string>([
  errorCodeFromMessageKey('cancel.error.refund-destination-required'),
  errorCodeFromMessageKey('cancel.error.refund-destination-invalid'),
]);

/** OBRS-286 Flow A3 — whether the booking's refund destination requirement
 * has been resolved. Component-local, NOT NgRx (the UI spec is explicit: a
 * three-state enum plus one boolean doesn't warrant a store). */
type RefundMethodState = 'loading' | 'resolved' | 'error';

// OBRS-690 / OBRS-661 AC9 — OWNER override-cancel dialog.
//
// This is the *override* path (cancel OUTSIDE the normal rules: past the
// cancellation window and/or a full refund), NOT the everyday act-on-behalf
// cancel. Two named permissions, decided by the owner (2026-07-23) and codified
// in ADR-0103:
//   - the refund rate is a CLOSED two-button enum (POLICY | FULL). There is
//     deliberately NO free numeric field — that field IS the fraud vector.
//   - a reason is required ONLY when a rule is actually broken (out-of-window
//     OR FULL). Requiring it always trains staff to type "-"; the field must
//     appear only when it carries meaning (AC2).
//
// The backend (POST /admin/bookings/{id}/cancel) is the real gate and returns
// 400 `cancel.error.override-reason-required` if the reason is missing when a
// rule is broken. Everything computed here (the window check especially) is a
// UX mirror of that gate, never a substitute for it.
const CANCEL_WINDOW_HOURS = 2; // mirrors backend CANCEL_WINDOW_HOURS_DEFAULT
const MS_PER_HOUR = 60 * 60 * 1000;

@Component({
  selector: 'app-override-cancel-modal',
  templateUrl: './override-cancel-modal.component.html',
  styleUrl: './override-cancel-modal.component.scss',
})
export class OverrideCancelModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() booking: AdminBookingDetailDto | null = null;
  /** Emitted after a successful override-cancel — parent revalidates the list. */
  @Output() cancelled = new EventEmitter<void>();
  /** Emitted when the dialog is dismissed without cancelling. */
  @Output() closed = new EventEmitter<void>();

  protected rateChoice: OverrideRefundRateChoice = 'POLICY';
  protected isSubmitting = false;
  protected errorMessage = '';
  protected readonly form: FormGroup;

  // OBRS-286 Flow A3 — refund-destination requirement, component-local state.
  protected refundMethodState: RefundMethodState = 'loading';
  protected destinationRequired = false;
  /** Belt-and-braces (Flow A3 step 6): a submit-time destination error code,
   * shown inline next to the destination fields — never the modal's generic
   * `errorMessage` banner. */
  protected destinationErrorMessage = '';

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.form = this.formBuilder.group({
      reason: ['', [Validators.maxLength(500)]],
      destination: buildRefundDestinationForm(this.formBuilder),
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen']) {
      return;
    }
    if (this.isOpen) {
      // Every open starts clean: POLICY selected, no reason, no stale error.
      this.rateChoice = 'POLICY';
      this.errorMessage = '';
      this.destinationErrorMessage = '';
      this.form.reset({ reason: '' });
      this.applyReasonValidators();
      this.fetchRefundMethod();
    }
  }

  // ── Refund-destination requirement (Flow A3) ─────────────────────────────

  protected get destinationForm(): FormGroup {
    return this.form.get('destination') as FormGroup;
  }

  private fetchRefundMethod(): void {
    const booking = this.booking;
    if (!booking) {
      return;
    }
    this.refundMethodState = 'loading';
    // Loading: nothing mounted either way, Confirm blocked by canSubmit —
    // do NOT pre-apply a required/optional validator yet (Flow A3 step 3).
    this.adminApiService.getBookingRefundMethod(booking.id).subscribe({
      next: (response) => {
        this.destinationRequired = response.data?.destinationRequired ?? true;
        this.refundMethodState = 'resolved';
        this.applyDestinationValidators();
      },
      error: () => {
        // Deliberately NOT fail-safe-to-required (see the UI spec's Flow A3
        // step 5 for the full argued reasoning) — renders as optional.
        this.refundMethodState = 'error';
        this.applyDestinationValidators();
      },
    });
  }

  protected retryCheck(): void {
    this.fetchRefundMethod();
  }

  /** Mirrors `applyReasonValidators()`'s shape — re-run on every
   * `refundMethodState` change (and again, forced-required, from `submit()`'s
   * belt-and-braces branch on a destination-error 400). Defaults to the
   * current resolved-state's own predicate when called with no argument. */
  private applyDestinationValidators(
    required: boolean = this.refundMethodState === 'resolved' && this.destinationRequired
  ): void {
    applyRefundDestinationRequired(this.destinationForm, required);
  }

  // ── Rate toggle (AC1: two buttons, never a numeric input) ────────────────
  protected selectRate(choice: OverrideRefundRateChoice): void {
    if (this.isSubmitting || this.rateChoice === choice) {
      return;
    }
    this.rateChoice = choice;
    // Switching to FULL breaks the rule → reason becomes required; switching
    // back to POLICY (while in-window) drops the requirement again.
    this.applyReasonValidators();
  }

  // ── Rule-breaking / window state (AC2) ───────────────────────────────────

  /** Earliest departure across all journeys, in epoch-ms, or null if unknown. */
  private get departureMs(): number | null {
    const times = (this.booking?.journeys ?? [])
      .map((j) => j.departureDateTime)
      .filter((t): t is string => !!t)
      .map((t) => new Date(t).getTime())
      .filter((ms) => Number.isFinite(ms));
    return times.length ? Math.min(...times) : null;
  }

  /**
   * True when departure is inside the cancellation window (or already past).
   * Unknown departure → false: we cannot assert a violation the backend hasn't
   * confirmed, and FULL still forces the reason field on its own.
   */
  protected get outsideWindow(): boolean {
    const departure = this.departureMs;
    if (departure === null) {
      return false;
    }
    return departure - Date.now() < CANCEL_WINDOW_HOURS * MS_PER_HOUR;
  }

  /** A rule is broken when refunding in full OR cancelling out-of-window. */
  protected get isBreakingRule(): boolean {
    return this.rateChoice === 'FULL' || this.outsideWindow;
  }

  protected get reasonRequired(): boolean {
    return this.isBreakingRule;
  }

  private applyReasonValidators(): void {
    const control = this.form.get('reason');
    if (!control) {
      return;
    }
    if (this.reasonRequired) {
      control.setValidators([trimmedRequiredValidator, Validators.maxLength(500)]);
    } else {
      control.setValidators([Validators.maxLength(500)]);
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  protected get isReasonInvalid(): boolean {
    const control = this.form.get('reason');
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  protected get canSubmit(): boolean {
    // Flow A3 step 3: while the refund-method check is still in flight we
    // don't yet know whether a destination applies at all, so Confirm is
    // blocked for that reason alone — the rest of the modal (rate toggle,
    // reason) stays interactive throughout.
    return !this.isSubmitting && this.form.valid && this.refundMethodState !== 'loading';
  }

  /** Whether `AppRefundDestinationFieldsComponent` should mount at all —
   * Flow A3 step 4/5: resolved+required, OR the check itself failed (shown
   * as optional). Never mounted while loading, never mounted merely because
   * `destinationRequired` resolved false. */
  protected get showDestinationFields(): boolean {
    return (
      (this.refundMethodState === 'resolved' && this.destinationRequired) ||
      this.refundMethodState === 'error'
    );
  }

  // ── Display helpers ──────────────────────────────────────────────────────

  protected get bookingNumber(): string {
    return this.booking?.bookingNumber ?? '-';
  }

  protected get routeLabel(): string {
    const journey = this.booking?.journeys?.[0];
    if (!journey) {
      return '-';
    }
    const from = getAdminLookupLabel(journey.fromStop) ?? '-';
    const to = getAdminLookupLabel(journey.toStop) ?? '-';
    return `${from} -> ${to}`;
  }

  protected get departureLabel(): string {
    const departure = this.booking?.journeys?.[0]?.departureDateTime;
    if (!departure) {
      return '-';
    }
    return formatDisplayDateTime(departure, this.translate.currentLang);
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  protected requestClose(): void {
    if (this.isSubmitting) {
      return;
    }
    this.closed.emit();
  }

  /**
   * OBRS-843: read the outcome from the response BODY, never from
   * `response.message` — that envelope field is built from
   * `HttpStatus.OK.getReasonPhrase()` and is the literal "OK" on every 2xx, so
   * the `||` fallback to the translated string could never fire and this
   * dialog's own SUCCESS copy was dead code.
   *
   * An override cancel is the OWNER breaking policy on purpose, so the amount
   * they just authorised is the thing worth confirming back to them. OBRS-670
   * keeps a cash share here as MANUAL (nobody is at a counter to hand it over),
   * so this surface realistically only ever shows the MANUAL and AUTO lanes —
   * `refundLane()` still covers CASH rather than assuming, since the lane is
   * resolved by the backend, not by this screen.
   */
  private successMessage(result: CancelBookingResult | null | undefined): string {
    if (!result) {
      return this.translate.instant('ADMIN.BOOKINGS.CANCEL_OVERRIDE.SUCCESS');
    }
    const refund = formatRefundAmount(result.refundAmount);
    switch (refundLane(result.refundMethod)) {
      case 'CASH':
        return this.translate.instant('ADMIN.BOOKINGS.CANCEL_OVERRIDE.SUCCESS_CASH', { refund });
      case 'MANUAL':
        return this.translate.instant('ADMIN.BOOKINGS.CANCEL_OVERRIDE.SUCCESS_MANUAL', { refund });
      default:
        return this.translate.instant('ADMIN.BOOKINGS.CANCEL_OVERRIDE.SUCCESS_AUTO', { refund });
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const booking = this.booking;
    if (!booking) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.destinationErrorMessage = '';
    try {
      const reason = String(this.form.get('reason')?.value ?? '').trim();
      const refundDestination = toRefundDestinationPayload(this.destinationForm);
      const response = await firstValueFrom(
        this.adminApiService.adminOverrideCancelBooking(booking.id, {
          rateChoice: this.rateChoice,
          // Only send a reason when a rule is broken; a blank one for an
          // in-window POLICY cancel would be noise the backend ignores anyway.
          reason: this.reasonRequired ? reason : undefined,
          refundDestination,
        })
      );
      this.cancelled.emit();
      this.closed.emit();
      await this.alertService.success(this.successMessage(response?.data));
    } catch (error) {
      const code = extractApiErrorCode(error, null);
      if (code && REFUND_DESTINATION_ERROR_CODES.has(code)) {
        // Flow A3 step 6 — belt and braces: force the destination fields to
        // mount (covers the raced `destinationRequired === false`/optional
        // case) and required, then show a DEDICATED inline message next to
        // them — never the generic `errorMessage` banner below. The modal
        // stays open; reason/rateChoice survive untouched.
        this.destinationRequired = true;
        this.refundMethodState = 'resolved';
        this.applyDestinationValidators(true);
        this.destinationErrorMessage =
          extractApiErrorMessage(error) ||
          this.translate.instant('REFUND_DESTINATION.ERROR.SERVER_INVALID');
      } else {
        // Keep the dialog open so a typed reason is not lost — surface the
        // backend's already-localized message inline (the reason-required gate
        // should never reach here since it is mirrored above, but 409/500/network
        // still can).
        this.errorMessage =
          extractApiErrorMessage(error) ||
          this.translate.instant('ADMIN.BOOKINGS.CANCEL_OVERRIDE.FAILED');
      }
    } finally {
      this.isSubmitting = false;
    }
  }
}
