import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';
import { ParcelClaimRespDto } from '../../../../shared/interfaces/parcel-claim.interface';
import { parcelClaimStatusToken } from '../../../../shared/lib/parcel-claim-status';

export interface ParcelClaimFilePayload {
  parcelId: number;
  claimReason: string;
}

export interface ParcelClaimRejectPayload {
  claimId: number;
  decisionNote: string;
}

/**
 * OBRS-1388 — the "ยื่นเคลม" action on the staff delivery list
 * (`ParcelDeliveryListPageComponent`, `/staff/parcels/schedule/:scheduleId`).
 * Dumb component: the parent page owns every HTTP call (file / history /
 * reject) and feeds back loading/error state, same split as
 * `ParcelCollectDialogComponent`.
 *
 * Opens optimistically (design-system §6): `[parcel]` is the row already in
 * hand, so the parcel-info panel renders on first paint. `[history]` arrives
 * in the background and never blocks filing — a failed load shows an inline
 * retry, the reason field and File button stay live throughout (AC-2's
 * history panel is visible from first paint, not behind a tab).
 *
 * Two phases, driven entirely by `[filedClaim]` (server-confirmed, never
 * guessed client-side — the client never sends claimant name/phone, only
 * reads them back): 'form' (no filedClaim yet) shows the reason textarea +
 * history; 'filed' (filedClaim present) shows the CLAIMANT the backend
 * resolved (the real "right person?" check, BR-11) plus the standing
 * instruction not to pay before OWNER approval, then either rejects on the
 * spot or leaves the claim PENDING for the owner's queue.
 */
@Component({
    selector: 'app-parcel-claim-dialog',
    templateUrl: './parcel-claim-dialog.component.html',
    styleUrl: './parcel-claim-dialog.component.scss',
    standalone: false
})
export class ParcelClaimDialogComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() parcel: ParcelDeliveryListItemDto | null = null;
  @Input() history: ParcelClaimRespDto[] = [];
  @Input() isHistoryLoading = false;
  @Input() historyErrorKey: string | null = null;
  @Input() isFiling = false;
  @Input() fileErrorKey: string | null = null;
  @Input() filedClaim: ParcelClaimRespDto | null = null;
  @Input() isRejecting = false;
  @Input() rejectErrorKey: string | null = null;

  @Output() readonly dismiss = new EventEmitter<void>();
  @Output() readonly fileClaim = new EventEmitter<ParcelClaimFilePayload>();
  @Output() readonly retryHistory = new EventEmitter<void>();
  @Output() readonly rejectClaim = new EventEmitter<ParcelClaimRejectPayload>();
  @Output() readonly done = new EventEmitter<void>();

  protected readonly form: FormGroup;
  protected readonly rejectForm: FormGroup;
  protected showRejectForm = false;
  protected readonly statusToken = parcelClaimStatusToken;

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group({
      claimReason: ['', [Validators.required, Validators.maxLength(500)]],
    });
    this.rejectForm = this.fb.group({
      decisionNote: ['', [Validators.required, Validators.maxLength(500)]],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.form.reset({ claimReason: '' });
      this.rejectForm.reset({ decisionNote: '' });
      this.showRejectForm = false;
    }
  }

  protected get phase(): 'form' | 'filed' {
    return this.filedClaim ? 'filed' : 'form';
  }

  protected onDismiss(): void {
    if (this.isFiling || this.isRejecting) return;
    this.dismiss.emit();
  }

  protected onFile(): void {
    if (this.isFiling || !this.parcel) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.fileClaim.emit({
      parcelId: this.parcel.parcelId,
      claimReason: String(this.form.value.claimReason ?? '').trim(),
    });
  }

  protected onRetryHistory(): void {
    this.retryHistory.emit();
  }

  protected openRejectForm(): void {
    this.showRejectForm = true;
  }

  protected onReject(): void {
    if (this.isRejecting || !this.filedClaim) return;
    this.rejectForm.markAllAsTouched();
    if (this.rejectForm.invalid) return;
    this.rejectClaim.emit({
      claimId: this.filedClaim.id,
      decisionNote: String(this.rejectForm.value.decisionNote ?? '').trim(),
    });
  }

  protected onDone(): void {
    if (this.isRejecting) return;
    this.done.emit();
  }
}
