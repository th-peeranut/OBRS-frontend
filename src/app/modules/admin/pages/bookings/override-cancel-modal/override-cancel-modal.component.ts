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
import { trimmedRequiredValidator } from '../../../../../shared/validators/trimmed-required.validator';
import { formatDisplayDateTime } from '../../../../../shared/lib/display-date-time';

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

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.form = this.formBuilder.group({
      reason: ['', [Validators.maxLength(500)]],
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
      this.form.reset({ reason: '' });
      this.applyReasonValidators();
    }
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
    return !this.isSubmitting && this.form.valid;
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
    try {
      const reason = String(this.form.get('reason')?.value ?? '').trim();
      const response = await firstValueFrom(
        this.adminApiService.adminOverrideCancelBooking(booking.id, {
          rateChoice: this.rateChoice,
          // Only send a reason when a rule is broken; a blank one for an
          // in-window POLICY cancel would be noise the backend ignores anyway.
          reason: this.reasonRequired ? reason : undefined,
        })
      );
      this.cancelled.emit();
      this.closed.emit();
      await this.alertService.success(
        response?.message ||
          this.translate.instant('ADMIN.BOOKINGS.CANCEL_OVERRIDE.SUCCESS')
      );
    } catch (error) {
      // Keep the dialog open so a typed reason is not lost — surface the
      // backend's already-localized message inline (the reason-required gate
      // should never reach here since it is mirrored above, but 409/500/network
      // still can).
      this.errorMessage =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.BOOKINGS.CANCEL_OVERRIDE.FAILED');
    } finally {
      this.isSubmitting = false;
    }
  }
}
