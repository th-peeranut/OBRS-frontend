import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { BookingService, RescheduleEstimateParams } from '../../../../../services/booking/booking.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';

/** OBRS-844: the approval code is always exactly six digits (server-generated, zero-padded). */
const APPROVAL_CODE_LENGTH = 6;

/** What the parent needs from this panel to build the confirm payload. */
export interface CounterCashHandoverState {
  cashHandedOverNow: boolean;
  approvalCode: string;
}

/**
 * OBRS-1167 (AC-5): the counter's cash hand-over affordance, inside the CUSTOMER's reschedule
 * dialog.
 *
 * <p><b>Why it lives in the customer dialog and not on a staff screen.</b> There is no counter
 * reschedule surface, and measuring rather than assuming is what OBRS-686 cost: the ADMIN
 * reschedule endpoint has zero callers in this repo, and a walk-in's `actorId` is the salesperson
 * who sold the ticket, so `/my-bookings` IS where the counter reschedules a walk-in. Putting this
 * on a new staff page would build a screen for a door nobody uses and leave the real one alone —
 * which is exactly the mistake the previous card measured.
 *
 * <p><b>The consequence is that one dialog serves two very different people</b>, so this panel is
 * rendered only when the viewer holds a staff role AND the server says this move refunds cash
 * (`estimate.cashRefundEligible`). The role check here is a UX gate and nothing more: the server
 * runs its own, and the whole card exists because a claim about physical cash must never be
 * inferred from who is asking. A customer who forges the request body is refused by
 * `RescheduleService`, not by this component.
 *
 * <p><b>Nothing is polled after the ask.</b> The owner authorizes on their own device and reads
 * six digits to the counter — the same deliberate design as the counter cancel, for the same
 * measured reasons (the app's STOMP setup has one ADMIN-only destination, and ADR-0043's in-memory
 * broker would drop approvals silently on a second instance).
 */
@Component({
    selector: 'app-counter-cash-handover',
    templateUrl: './counter-cash-handover.component.html',
    styleUrl: './counter-cash-handover.component.scss',
    standalone: false
})
export class CounterCashHandoverComponent implements OnDestroy {
  /** The booking being rescheduled. */
  @Input() bookingId!: number;
  /** The exact estimate query this reschedule will confirm on — the owner must be asked to
   *  authorize the amount THIS move produces, not some other candidate round's. */
  @Input() estimateQuery: RescheduleEstimateParams | null = null;
  /** Formatted cash amount about to leave the drawer, for the prompt. */
  @Input() amountLabel = '';
  @Input() disabled = false;

  @Output() readonly stateChange = new EventEmitter<CounterCashHandoverState>();

  protected handedOver = false;
  protected approvalCode = '';
  protected approvalError = '';

  /**
   * Where the ask has got to. There is no 'approved' — this screen never learns that; the owner
   * does, and tells the counter out loud.
   */
  protected approvalState: 'idle' | 'requesting' | 'requested' | 'failed' = 'idle';

  protected readonly approvalCodeLength = APPROVAL_CODE_LENGTH;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly bookingService: BookingService,
    private readonly translate: TranslateService
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Un-ticking resets the code and the ask. A half-filled panel left behind after the operator
   * changed their mind is how the wrong claim gets submitted on the next tap.
   */
  protected onHandedOverToggle(checked: boolean): void {
    this.handedOver = checked;
    if (!checked) {
      this.approvalCode = '';
      this.approvalState = 'idle';
      this.approvalError = '';
    }
    this.emit();
  }

  protected onCodeInput(value: string): void {
    this.approvalCode = value;
    this.emit();
  }

  protected requestApproval(): void {
    const query = this.estimateQuery;
    if (!query || this.approvalState === 'requesting') {
      return;
    }
    this.approvalState = 'requesting';
    this.approvalError = '';
    this.bookingService
      .requestRescheduleCashRefundApproval(this.bookingId, query)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.approvalState = 'requested';
        },
        error: (error: unknown) => {
          this.approvalState = 'failed';
          this.approvalError =
            extractApiErrorMessage(error) ||
            this.translate.instant('MY_BOOKINGS.RESCHEDULE.CASH_HANDOVER.REQUEST_FAILED');
        },
      });
  }

  /** Six digits, or the confirm has nothing to send. Mirrors the counter cancel's own rule. */
  protected get isCodeWellFormed(): boolean {
    return new RegExp(`^\\d{${APPROVAL_CODE_LENGTH}}$`).test(this.approvalCode.trim());
  }

  protected get showCodeError(): boolean {
    return this.handedOver && this.approvalCode.length > 0 && !this.isCodeWellFormed;
  }

  private emit(): void {
    this.stateChange.emit({
      cashHandedOverNow: this.handedOver,
      approvalCode: this.approvalCode.trim(),
    });
  }
}
