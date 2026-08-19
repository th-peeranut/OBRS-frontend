import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ParcelClaimApproveReqDto, ParcelClaimRespDto } from '../../../../shared/interfaces/parcel-claim.interface';
import { extractApiErrorCode, mapApiErrorCode } from '../../../../shared/lib/api-error-code';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { ParcelClaimApprovePayload } from './parcel-claim-approve-modal/parcel-claim-approve-modal.component';

const APPROVE_ERROR_KEYS: Record<string, string> = {
  PARCEL_CLAIM_ALREADY_DECIDED: 'ADMIN.PARCEL_CLAIM.ERROR.ALREADY_DECIDED',
  DRIVER_CASH_DAY_ALREADY_RETURNED: 'ADMIN.PARCEL_CLAIM.ERROR.DAY_ALREADY_RETURNED',
};

type QueueContentState = 'loading' | 'error' | 'empty' | 'data';

/**
 * OBRS-1388 — the OWNER's pending parcel-claims queue (`/admin/parcel-claims`,
 * nav sidebar `operations` section). Flow 2 of the UX spec: the OWNER opens
 * this from wherever they are (often a different device than the counter
 * that filed it), approves or leaves it for later.
 *
 * Deliberately no NgRx store, same reasoning as `CashRefundApprovalsPageComponent`
 * right next to it: a cached queue would show the owner a claim another
 * device already decided.
 */
@Component({
    selector: 'app-parcel-claims-page',
    templateUrl: './parcel-claims-page.component.html',
    styleUrl: './parcel-claims-page.component.scss',
    standalone: false
})
export class ParcelClaimsPageComponent implements OnInit, OnDestroy {
  protected rows: ParcelClaimRespDto[] = [];
  protected isLoading = true;
  protected errorMessage = '';
  /** Set only on a 409 PARCEL_CLAIM_ALREADY_DECIDED — someone else decided
   * this claim between the queue load and this owner's approve attempt. */
  protected queueNoteKey: string | null = null;
  protected readonly skeletonRows = Array.from({ length: 5 });

  protected isApproveModalOpen = false;
  protected selectedClaim: ParcelClaimRespDto | null = null;
  protected approveHistory: ParcelClaimRespDto[] = [];
  protected isApproveHistoryLoading = false;
  protected approveHistoryErrorKey: string | null = null;
  protected isSubmittingApproval = false;
  protected approveSubmitErrorKey: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get contentState(): QueueContentState {
    if (this.isLoading) {
      return 'loading';
    }
    if (this.errorMessage) {
      return 'error';
    }
    return this.rows.length ? 'data' : 'empty';
  }

  protected load(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.adminApiService
      .getPendingParcelClaims()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          this.rows = response?.data ?? [];
        },
        error: (error) => {
          this.isLoading = false;
          this.rows = [];
          this.errorMessage =
            extractApiErrorMessage(error) || this.translate.instant('ADMIN.PARCEL_CLAIM.LOAD_FAILED');
        },
      });
  }

  /** Opens optimistically (design-system §6) on the row already in hand; the
   * claim-history GET (same history the filing counter saw, AC-2) fires in
   * the background. */
  protected openApproveModal(row: ParcelClaimRespDto): void {
    this.selectedClaim = row;
    this.isApproveModalOpen = true;
    this.approveSubmitErrorKey = null;
    this.queueNoteKey = null;
    this.loadApproveHistory(row.parcelId);
  }

  protected closeApproveModal(): void {
    if (this.isSubmittingApproval) {
      return;
    }
    this.isApproveModalOpen = false;
    this.selectedClaim = null;
    this.approveHistory = [];
    this.approveHistoryErrorKey = null;
  }

  private loadApproveHistory(parcelId: number): void {
    this.isApproveHistoryLoading = true;
    this.approveHistoryErrorKey = null;
    this.adminApiService
      .getParcelClaimHistory(parcelId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isApproveHistoryLoading = false;
          this.approveHistory = response?.data ?? [];
        },
        error: () => {
          this.isApproveHistoryLoading = false;
          this.approveHistory = [];
          this.approveHistoryErrorKey = 'STAFF.PARCEL_DELIVERY.CLAIM_DIALOG.HISTORY_LOAD_FAILED';
        },
      });
  }

  protected onApproveRequested(payload: ParcelClaimApprovePayload): void {
    void this.confirmAndApprove(payload);
  }

  /** BR-11: the confirm copy IS the operational instruction ("this signals
   * the counter to pay the customer NOW; only confirm when ready for the
   * money to leave the box") — `AlertService.confirm()` fires before the
   * POST, never after. */
  private async confirmAndApprove(payload: ParcelClaimApprovePayload): Promise<void> {
    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.PARCEL_CLAIM.APPROVE_MODAL.CONFIRM_TITLE'),
      text: this.translate.instant('ADMIN.PARCEL_CLAIM.APPROVE_MODAL.CONFIRM_BODY'),
      confirmButtonText: this.translate.instant('ADMIN.PARCEL_CLAIM.APPROVE_MODAL.SUBMIT_BTN'),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.isSubmittingApproval = true;
    this.approveSubmitErrorKey = null;
    const requestPayload: ParcelClaimApproveReqDto = {
      approvedAmount: payload.approvedAmount,
      decisionNote: payload.decisionNote,
    };
    this.adminApiService
      .approveParcelClaim(payload.claimId, requestPayload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSubmittingApproval = false;
          this.rows = this.rows.filter((row) => row.id !== payload.claimId);
          this.isApproveModalOpen = false;
          this.selectedClaim = null;
          this.alertService.toast(this.translate.instant('ADMIN.PARCEL_CLAIM.APPROVE_MODAL.SUCCESS'), 'success');
        },
        error: (error: unknown) => {
          this.isSubmittingApproval = false;
          const code = extractApiErrorCode(error, null);
          if (code === 'PARCEL_CLAIM_ALREADY_DECIDED') {
            // Someone else already decided this claim elsewhere. The row
            // itself is stale, not the whole queue — reload rather than
            // showing a raw error, same treatment as MarkRefundedModalComponent's
            // ALREADY_DECIDED-shaped code.
            this.isApproveModalOpen = false;
            this.selectedClaim = null;
            this.queueNoteKey = 'ADMIN.PARCEL_CLAIM.ERROR.ALREADY_DECIDED';
            this.load();
            return;
          }
          this.approveSubmitErrorKey = mapApiErrorCode(
            code,
            APPROVE_ERROR_KEYS,
            'COMMON.ERROR.REQUEST_FAILED'
          );
        },
      });
  }
}
