import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ParcelClaimRespDto } from '../../../../../shared/interfaces/parcel-claim.interface';
import { parcelClaimStatusToken } from '../../../../../shared/lib/parcel-claim-status';

export interface ParcelClaimApprovePayload {
  claimId: number;
  approvedAmount: number;
  decisionNote?: string;
}

/**
 * OBRS-1388 — the owner's approve modal on `/admin/parcel-claims`
 * (`ParcelClaimsPageComponent`). Dumb component: the parent page owns the
 * history fetch and the confirm+approve orchestration
 * (`AlertService.confirm()` + POST + error-code branching), same split as
 * `DriverCashDayReturnModalComponent`/`SettlementsPageComponent`.
 *
 * Opens optimistically (design-system §6): `[claim]` is the queue row
 * already in hand. `[history]` (the SAME cross-counter history the filing
 * counter saw, AC-2) arrives in the background and never blocks approval.
 *
 * `approvedAmount` is a plain `<input type="number">` (`mark-refunded-modal`
 * idiom, §1 of the UX spec) — not PrimeNG `p-inputNumber`, which has no
 * precedent in this module. The ฿500 ceiling (§1, BR-4) is enforced
 * client-side as a friendly inline error, with the hint visible before any
 * submit attempt; the DB CHECK is the hard invariant either way.
 */
@Component({
    selector: 'app-parcel-claim-approve-modal',
    templateUrl: './parcel-claim-approve-modal.component.html',
    styleUrl: './parcel-claim-approve-modal.component.scss',
    standalone: false
})
export class ParcelClaimApproveModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() claim: ParcelClaimRespDto | null = null;
  @Input() history: ParcelClaimRespDto[] = [];
  @Input() isHistoryLoading = false;
  @Input() historyErrorKey: string | null = null;
  @Input() isSubmitting = false;
  @Input() submitErrorKey: string | null = null;

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly approveRequested = new EventEmitter<ParcelClaimApprovePayload>();

  protected readonly form: FormGroup;
  protected readonly statusToken = parcelClaimStatusToken;

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group({
      approvedAmount: [null as number | null, [Validators.required, Validators.min(0.01), Validators.max(500)]],
      decisionNote: ['', [Validators.maxLength(500)]],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.form.reset({ approvedAmount: null, decisionNote: '' });
    }
  }

  /** Inline range error, visible as soon as the field is touched — not only
   * after a failed submit (UX spec §1: "visible before submit, not only on
   * failure"). */
  protected get amountOutOfRange(): boolean {
    const control = this.form.get('approvedAmount');
    return !!control && control.touched && (control.hasError('min') || control.hasError('max'));
  }

  protected onClose(): void {
    if (this.isSubmitting) return;
    this.closed.emit();
  }

  protected onSubmit(): void {
    if (this.isSubmitting || !this.claim) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const decisionNote = String(this.form.value.decisionNote ?? '').trim();
    this.approveRequested.emit({
      claimId: this.claim.id,
      approvedAmount: Number(this.form.value.approvedAmount),
      decisionNote: decisionNote ? decisionNote : undefined,
    });
  }
}
