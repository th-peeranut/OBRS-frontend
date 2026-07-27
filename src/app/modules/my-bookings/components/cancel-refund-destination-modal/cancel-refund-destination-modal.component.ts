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
import {
  CancellationPolicy,
  MyBookingView,
  toAmountNumber,
} from '../../../../shared/interfaces/my-booking.interface';
import { RefundDestinationReqDto } from '../../../../shared/interfaces/refund-destination.interface';
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
 */
@Component({
  selector: 'app-cancel-refund-destination-modal',
  templateUrl: './cancel-refund-destination-modal.component.html',
  styleUrl: './cancel-refund-destination-modal.component.scss',
})
export class CancelRefundDestinationModalComponent implements OnInit, OnChanges {
  @Input({ required: true }) booking!: MyBookingView;
  @Input({ required: true }) policy!: CancellationPolicy;
  /** Server-side destination-invalid 400 (Flow A1 step 5) — the modal stays
   * open and whatever was typed survives; this input never closes it. */
  @Input() error: string | null = null;

  @Output() readonly confirmed = new EventEmitter<{ refundDestination: RefundDestinationReqDto }>();
  @Output() readonly dismissed = new EventEmitter<void>();

  protected readonly form: FormGroup;
  protected submitting = false;

  constructor(private readonly formBuilder: FormBuilder) {
    this.form = buildRefundDestinationForm(this.formBuilder);
  }

  ngOnInit(): void {
    // Always required on this path — the modal only ever opens once the
    // resolved refund method is MANUAL_REFUND_REQUIRED (Flow A1 step 2).
    applyRefundDestinationRequired(this.form, true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['error'] && this.error) {
      // A server-side destination-invalid 400 landed — stop showing a stuck
      // spinner, but keep everything the traveler typed intact.
      this.submitting = false;
    }
  }

  protected get canSubmit(): boolean {
    return !this.submitting && this.form.valid;
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
    if (!refundDestination) {
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

  private formatCurrency(value: number | string): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 2,
    }).format(toAmountNumber(value));
  }
}
