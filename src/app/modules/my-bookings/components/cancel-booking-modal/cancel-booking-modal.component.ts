import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  CancellationPolicy,
  MANUAL_REFUND_METHOD,
  MyBookingView,
  toAmountNumber,
} from '../../../../shared/interfaces/my-booking.interface';
import { RefundDestinationReqDto } from '../../../../shared/interfaces/refund-destination.interface';
import { formatMoney } from '../../../../shared/lib/money-display';
import {
  applyRefundDestinationRequired,
  buildRefundDestinationForm,
  toRefundDestinationPayload,
} from '../../../../shared/lib/refund-destination-form';

/**
 * OBRS-286 Flow A1 — replaces the plain Swal confirm for a cancel that
 * resolves to `MANUAL_REFUND_REQUIRED`: the traveler must supply where the
 * refund should be sent before the cancel is submitted. Opened by
 * `MyBookingsComponent` from `selectCancelRefundDestinationModal`
 * (`openCancelRefundDestinationModal` action) — real NgRx surface, unlike the
 * override-cancel modal's component-local state (that one has no
 * `destinationRequired` fetch of its own to await; this modal's `policy` is
 * already in hand when it opens).
 *
 * Hand-rolled backdrop, mirroring `ChangeStopDialogComponent` /
 * `ChangeEmailDialogComponent` (design-system §6/§12) rather than a fourth
 * customer-shell modal chrome.
 *
 * OBRS-942 — renamed from `CancelRefundDestinationModalComponent`: this is now
 * the ONLY cancel screen, for every `refundMethod`. `requestCancel$` used to
 * fork here only for `MANUAL_REFUND_REQUIRED` and fall through to a plain Swal
 * confirm otherwise (never mentioning the OBRS-813 reschedule offer on that
 * lane). The fork is gone — `isManualRefund` now gates the destination form
 * and the manual-only note instead of a second screen existing at all. The
 * `crdm-*` SCSS class prefix, the `*RefundDestinationModal` action/selector
 * names and the `refundDestinationModal` state slice keep their pre-rename
 * names on purpose (see the class-level comment in the .scss and
 * `my-bookings.action.ts`) — they are still accurate and three e2e/capture
 * files depend on the `crdm-` prefix literally.
 */
@Component({
    selector: 'app-cancel-booking-modal',
    templateUrl: './cancel-booking-modal.component.html',
    styleUrl: './cancel-booking-modal.component.scss',
    standalone: false
})
export class CancelBookingModalComponent implements OnInit, OnChanges {
  @Input({ required: true }) booking!: MyBookingView;
  @Input({ required: true }) policy!: CancellationPolicy;
  /** Server-side destination-invalid 400 (Flow A1 step 5) — the modal stays
   * open and whatever was typed survives; this input never closes it. */
  @Input() error: string | null = null;

  @Output() readonly confirmed = new EventEmitter<{ refundDestination?: RefundDestinationReqDto }>();
  @Output() readonly dismissed = new EventEmitter<void>();
  /**
   * OBRS-813 — the traveler chose the other door: close this modal and open the
   * existing reschedule dialog. Emitted only from the offer block, which only
   * renders when `booking.rescheduleEligible` (the same predicate the card's
   * own Reschedule menu item uses), so this can never route someone into a flow
   * the backend would reject.
   */
  @Output() readonly rescheduleRequested = new EventEmitter<void>();

  protected readonly form: FormGroup;
  protected submitting = false;

  /** The operator's `reschedule_max_days_ahead`; already the date picker's bound
   * (`RescheduleDialogComponent.computeDateBounds`). Quoted here so the offer
   * states the one limit that can make this door useless to the traveler — if
   * they don't yet know when they want to travel, only a cancel helps.
   *
   * OBRS-699: read off the cancel quote (`policy`), which the backend resolves
   * under the operator selling THIS booking's trip — `booking` here is the
   * flattened `MyBookingView`, which carries no policy numbers. Null when the
   * backend could not resolve an operator; the bullet is then not rendered
   * rather than stating a horizon nobody set. */
  protected get rescheduleMaxDaysAhead(): number | null {
    return this.policy?.rescheduleMaxDaysAhead ?? null;
  }

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly translate: TranslateService
  ) {
    this.form = buildRefundDestinationForm(this.formBuilder);
  }

  ngOnInit(): void {
    // OBRS-942: required only on the manual lane — this modal now also opens
    // for card/gateway/CASH refund methods, where no destination is ever
    // collected (the fields aren't even rendered, see the template).
    applyRefundDestinationRequired(this.form, this.isManualRefund);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['error'] && this.error) {
      // A server-side destination-invalid 400 landed — stop showing a stuck
      // spinner, but keep everything the traveler typed intact.
      this.submitting = false;
    }
  }

  /**
   * OBRS-942 — which of the two lanes this modal is currently rendering.
   * Read off the pre-cancel policy PREVIEW (`this.policy`), which is exactly
   * right for this component: it never sees the post-cancel response, only
   * what `openCancelRefundDestinationModal` carried in. Do NOT reuse
   * `refundLane()` from `my-booking.interface.ts` here — its own docstring
   * requires the CANCEL RESPONSE, never the pre-cancel preview, because the
   * two can disagree; `refundLane()` stays scoped to the post-cancel
   * SUCCESS/SUCCESS_MANUAL split in `MyBookingsEffect.showCancelSuccess`.
   */
  protected get isManualRefund(): boolean {
    return this.policy?.refundMethod === MANUAL_REFUND_METHOD;
  }

  /**
   * OBRS-1136 AC-3 — the published wait for a manual refund, in calendar days, straight off the
   * policy the server just quoted. AC-2's rule applies: the number is NEVER typed into i18n, it
   * renders from the same `manual_refund_due_days` config the owner's overdue badge counts with
   * (AC-4), so the promise on this screen and the measurement on the worklist cannot drift.
   *
   * Null when the server did not send it — the FE (Netlify) and the backend (Koyeb) deploy
   * separately, so a frontend can be live against a backend that predates AC-3 for a few minutes.
   * The template answers that by rendering the OLD note, which makes no timing promise at all,
   * rather than a sentence with a blank where the number should be.
   */
  protected get manualRefundDueDays(): number | null {
    const days = this.policy?.manualRefundDueDays;
    return typeof days === 'number' && days > 0 ? days : null;
  }

  protected get canSubmit(): boolean {
    return !this.submitting && this.form.valid;
  }

  /**
   * OBRS-813 — offer the reschedule door only when the server would actually
   * open it. `rescheduleEligible` is computed once in
   * `MyBookingsComponent.computeRescheduleEligibility` (confirmed + one-way +
   * never rescheduled + outside the 2h window); this modal re-uses that verdict
   * rather than re-deriving it, so there is exactly one FE mirror of the
   * backend's prerequisites and it cannot drift against the menu item that
   * opens the same dialog.
   *
   * This is also what keeps the offer off the operator-cancellation path: a
   * trip the operator cancelled leaves the booking non-`confirmed`, which fails
   * the first check above (and takes the Cancel action itself away, so this
   * modal never opens there at all). That case owes the traveler their money,
   * never an alternative.
   *
   * OBRS-942: unchanged by the lane merge — the offer renders on the SAME
   * predicate for both lanes, so a card payer now sees it too.
   */
  protected get canOfferReschedule(): boolean {
    return this.booking?.rescheduleEligible === true;
  }

  protected requestReschedule(): void {
    if (this.submitting) {
      return;
    }
    this.rescheduleRequested.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.requestClose();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.requestClose();
    }
  }

  protected requestClose(): void {
    if (this.submitting) {
      return;
    }
    this.dismissed.emit();
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const refundDestination = toRefundDestinationPayload(this.form);
    // OBRS-942: on the non-manual lane no mode is ever chosen (the picker
    // isn't rendered), so `toRefundDestinationPayload` always returns
    // `undefined` here — that is the correct, expected payload for that lane,
    // not a guard failure. Only the manual lane requires a resolved
    // destination before Confirm may submit.
    if (this.isManualRefund && !refundDestination) {
      return;
    }
    this.submitting = true;
    this.confirmed.emit({ refundDestination });
  }

  protected get refundLabel(): string {
    return this.formatCurrency(this.policy?.refundAmount ?? 0);
  }

  protected get penaltyLabel(): string {
    return this.formatCurrency(this.policy?.penaltyAmount ?? 0);
  }

  /**
   * OBRS-813 — what the traveler keeps by rescheduling instead of cancelling.
   * Taken from the cancel-policy response the backend already computed for
   * THIS booking (`originalAmount`), never re-derived in the FE: the whole
   * point of the comparison is that both sides are the server's own numbers.
   *
   * The reschedule side deliberately quotes no fee. It cannot: the fee depends
   * on the trip the traveler has not picked yet (`resolveRescheduleFee` keys on
   * how far away the NEW departure is), and reproducing that predicate here is
   * exactly the duplication this card forbids. `FEE_SHOWN_FIRST` promises the
   * number instead, and the reschedule dialog's estimate step keeps that
   * promise — old fare, new fare, fee and net, all before Confirm.
   */
  protected get originalAmountLabel(): string {
    return this.formatCurrency(this.policy?.originalAmount ?? 0);
  }

  private formatCurrency(value: number | string): string {
    return formatMoney(toAmountNumber(value), this.translate.currentLang);
  }
}
