import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  ParcelDeliveryListItemDto,
  ParcelLeaveAtStopRespDto,
} from '../../../../shared/interfaces/parcel.interface';
import { parcelDeliveryStatusChip, ParcelStatusChip } from '../../../../shared/lib/parcel-delivery-status';
import {
  isParcelBookingBlocking,
  parcelPaymentFlag,
  ParcelPaymentFlag,
} from '../../../../shared/lib/parcel-booking-status';
import { parcelStopLabel } from '../../../../shared/lib/parcel-stop-label';
import { ParcelDeliveryListStore } from './parcel-delivery-list.store';
import { mapApiErrorCode } from '../../../../shared/lib/api-error-code';
import { ParcelClaimRespDto } from '../../../../shared/interfaces/parcel-claim.interface';
import {
  ParcelClaimFilePayload,
  ParcelClaimRejectPayload,
} from '../../components/parcel-claim-dialog/parcel-claim-dialog.component';

// OBRS-1388: separate error-code table from ACTION_ERROR_KEYS above — a
// different domain (claim filing/rejecting, not delivery-status transitions)
// with its own error codes, same mapApiErrorCode()/fallback-key shape.
const CLAIM_ACTION_ERROR_KEYS: Record<string, string> = {
  PARCEL_CLAIM_ALREADY_PENDING: 'STAFF.PARCEL_DELIVERY.ERROR.CLAIM_ALREADY_PENDING',
  PARCEL_CLAIM_ALREADY_DECIDED: 'STAFF.PARCEL_DELIVERY.ERROR.CLAIM_ALREADY_DECIDED',
};

const ACTION_ERROR_KEYS: Record<string, string> = {
  // OBRS-1537: COLLECTION, not COLLECT — the key was spelled without `ION`, so
  // it never matched and every wrong code fell through to WRONG_STATE.
  PARCEL_COLLECTION_CODE_MISMATCH: 'STAFF.PARCEL_DELIVERY.ERROR.CODE_MISMATCH',
  PARCEL_ALREADY_COLLECTED: 'STAFF.PARCEL_DELIVERY.ERROR.ALREADY_COLLECTED',
  PARCEL_BOOKING_NOT_CONFIRMED: 'STAFF.PARCEL_DELIVERY.ERROR.BOOKING_NOT_CONFIRMED',
  // OBRS-1345. The photo failures get their OWN messages rather than falling
  // through to WRONG_STATE: a driver standing at a roadside stop needs to know
  // whether to retake the photo or stop trying, and "the parcel is in the wrong
  // state" answers neither. AC-10 — this path must never fail quietly.
  PARCEL_ALREADY_LEFT_AT_STOP: 'STAFF.PARCEL_DELIVERY.ERROR.ALREADY_LEFT_AT_STOP',
  PARCEL_PHOTO_TOO_LARGE: 'STAFF.PARCEL_DELIVERY.ERROR.PHOTO_TOO_LARGE',
  PARCEL_PHOTO_UNSUPPORTED: 'STAFF.PARCEL_DELIVERY.ERROR.PHOTO_UNSUPPORTED',
  PARCEL_PHOTO_MISSING: 'STAFF.PARCEL_DELIVERY.ERROR.PHOTO_FAILED',
  PARCEL_PHOTO_UNREADABLE: 'STAFF.PARCEL_DELIVERY.ERROR.PHOTO_FAILED',
};

/**
 * Smart page, rendered as the _ส่งมอบ_ tab of
 * `/staff/parcels/schedule/:scheduleId` (OBRS-574 merged it with the verify
 * list; `/staff/parcels/deliveries/:scheduleId` still redirects here). Driver
 * + salesperson —
 * the role hierarchy means a salesperson session also satisfies the
 * DRIVER-only action endpoints, see the API doc's `hasRole('DRIVER')` note).
 * Component-scoped `ParcelDeliveryListStore` (providers: [] — see that
 * store's doc comment) drives the manifest; the collect dialog is a dumb
 * child, this page owns the HTTP call.
 */
@Component({
    selector: 'app-parcel-delivery-list-page',
    templateUrl: './parcel-delivery-list-page.component.html',
    styleUrl: './parcel-delivery-list-page.component.scss',
    providers: [ParcelDeliveryListStore],
    standalone: false
})
export class ParcelDeliveryListPageComponent implements OnInit, OnDestroy {
  protected rows: ParcelDeliveryListItemDto[] = [];
  protected isLoading = false;
  protected hasError = false;
  protected readonly parcelStopLabel = parcelStopLabel;
  protected readonly statusChip = parcelDeliveryStatusChip;

  /** Optimistic per-row disable while an action is in flight — the row's
   * displayed `deliveryStatus` only changes once the 200 body's actual
   * `deliveryStatus` is known (never guessed client-side). */
  protected loadingParcelIds = new Set<number>();

  protected collectDialogParcelId: number | null = null;
  protected isCollecting = false;
  protected collectErrorKey: string | null = null;

  // OBRS-1388 — "ยื่นเคลม" dialog state. `claimDialogParcel` is the row
  // already in hand (optimistic open, design-system §6); `claimHistory` and
  // `filedClaim` arrive from the server and are never guessed client-side.
  protected claimDialogParcel: ParcelDeliveryListItemDto | null = null;
  protected claimHistory: ParcelClaimRespDto[] = [];
  protected isClaimHistoryLoading = false;
  protected claimHistoryErrorKey: string | null = null;
  protected isFilingClaim = false;
  protected fileClaimErrorKey: string | null = null;
  protected filedClaim: ParcelClaimRespDto | null = null;
  protected isRejectingClaim = false;
  protected rejectClaimErrorKey: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: ParcelDeliveryListStore
  ) {}

  ngOnInit(): void {
    const scheduleId = Number(this.route.snapshot.paramMap.get('scheduleId'));
    this.store.setScheduleId(scheduleId);

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.rows = data ?? [];
    });
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isLoading = refreshing;
    });
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((hasError) => {
      this.hasError = hasError;
    });

    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isEmpty(): boolean {
    return !this.isLoading && !this.hasError && this.rows.length === 0;
  }

  protected chipFor(row: ParcelDeliveryListItemDto): ParcelStatusChip {
    return this.statusChip(row.deliveryStatus);
  }

  /** OBRS-396: the unpaid/expired badge, or `null` for a paid row (the
   * everyday case renders no badge at all). */
  protected paymentFlagFor(row: ParcelDeliveryListItemDto): ParcelPaymentFlag | null {
    return parcelPaymentFlag(row.bookingStatus);
  }

  /**
   * OBRS-396: nobody paid for this parcel, so `ParcelDeliveryService` 409s
   * every transition on it (OBRS-359). The row stays listed — staff are
   * holding the physical box and need to see it — but its actions are off.
   */
  protected isRowBlocked(row: ParcelDeliveryListItemDto): boolean {
    return isParcelBookingBlocking(row.bookingStatus);
  }

  protected isRowBusy(parcelId: number): boolean {
    return this.loadingParcelIds.has(parcelId);
  }

  protected onLoad(row: ParcelDeliveryListItemDto): void {
    this.runAction(row.parcelId, this.staffApiService.loadParcel(row.parcelId));
  }

  protected onArrived(row: ParcelDeliveryListItemDto): void {
    this.runAction(row.parcelId, this.staffApiService.markParcelArrived(row.parcelId));
  }

  protected openCollectDialog(row: ParcelDeliveryListItemDto): void {
    // Guard, not just a disabled button: handing the goods over is the one
    // action that can't be undone, so the invariant lives in the component.
    if (this.isRowBlocked(row)) return;
    this.collectErrorKey = null;
    this.collectDialogParcelId = row.parcelId;
  }

  protected closeCollectDialog(): void {
    if (this.isCollecting) return;
    this.collectDialogParcelId = null;
  }

  /** Opens optimistically (design-system §6): `row` is already in hand, so
   * the parcel-info panel renders on first paint. History fetches in the
   * background and never gates the reason field or the File button. */
  protected openClaimDialog(row: ParcelDeliveryListItemDto): void {
    this.claimDialogParcel = row;
    this.fileClaimErrorKey = null;
    this.filedClaim = null;
    this.isRejectingClaim = false;
    this.rejectClaimErrorKey = null;
    this.loadClaimHistory(row.parcelId);
  }

  protected closeClaimDialog(): void {
    if (this.isFilingClaim || this.isRejectingClaim) return;
    this.claimDialogParcel = null;
    this.claimHistory = [];
    this.claimHistoryErrorKey = null;
    this.filedClaim = null;
    this.fileClaimErrorKey = null;
    this.rejectClaimErrorKey = null;
  }

  protected onRetryClaimHistory(): void {
    if (this.claimDialogParcel) {
      this.loadClaimHistory(this.claimDialogParcel.parcelId);
    }
  }

  private loadClaimHistory(parcelId: number): void {
    this.isClaimHistoryLoading = true;
    this.claimHistoryErrorKey = null;
    this.staffApiService
      .getParcelClaimHistory(parcelId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.isClaimHistoryLoading = false;
          this.claimHistory = resp?.data ?? [];
        },
        error: () => {
          this.isClaimHistoryLoading = false;
          this.claimHistory = [];
          this.claimHistoryErrorKey = 'STAFF.PARCEL_DELIVERY.CLAIM_DIALOG.HISTORY_LOAD_FAILED';
        },
      });
  }

  protected onFileClaim(payload: ParcelClaimFilePayload): void {
    this.isFilingClaim = true;
    this.fileClaimErrorKey = null;
    this.staffApiService
      .fileParcelClaim(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.isFilingClaim = false;
          this.filedClaim = resp?.data ?? null;
        },
        error: (err: unknown) => {
          this.isFilingClaim = false;
          this.fileClaimErrorKey = this.mapClaimErrorCode(err);
        },
      });
  }

  protected onRejectClaim(payload: ParcelClaimRejectPayload): void {
    this.isRejectingClaim = true;
    this.rejectClaimErrorKey = null;
    this.staffApiService
      .rejectParcelClaim(payload.claimId, { decisionNote: payload.decisionNote })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isRejectingClaim = false;
          void this.alertService.success(
            this.translate.instant('STAFF.PARCEL_DELIVERY.CLAIM_DIALOG.REJECTED_CONFIRM')
          );
          this.closeClaimDialog();
        },
        error: (err: unknown) => {
          this.isRejectingClaim = false;
          this.rejectClaimErrorKey = this.mapClaimErrorCode(err);
        },
      });
  }

  protected onClaimDone(): void {
    this.closeClaimDialog();
  }

  protected confirmCollect(collectionCode: string): void {
    const parcelId = this.collectDialogParcelId;
    if (parcelId === null) return;

    this.isCollecting = true;
    this.collectErrorKey = null;
    this.staffApiService
      .collectParcel(parcelId, { collectionCode })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.isCollecting = false;
          this.collectDialogParcelId = null;
          this.applyStatus(parcelId, resp?.data?.deliveryStatus);
        },
        error: (err: unknown) => {
          this.isCollecting = false;
          this.collectErrorKey = this.mapErrorCode(err);
        },
      });
  }

  /**
   * OBRS-1345: the driver found nobody at the stop. The button behind this
   * opens the phone camera (`capture="environment"` on a hidden file input),
   * and the photo it returns is the request — there is no way from this screen
   * to record a drop-off without one, because the backend has no endpoint that
   * would accept it.
   *
   * On failure the row is deliberately left where it was and the store is
   * re-synced: the parcel is still `arrived_notified` server-side, so showing
   * anything else would tell the driver the goods are recorded as delivered
   * when the only evidence of that never arrived (AC-10, OBRS-832's lesson).
   */
  protected onLeaveAtStopPhotoChosen(row: ParcelDeliveryListItemDto, event: Event): void {
    const input = event.target as HTMLInputElement;
    const photo = input.files?.[0];
    // Reset immediately so retaking the SAME file after a failure still fires
    // a change event — without this a retry on an unchanged filename is silent.
    input.value = '';
    if (!photo) return;

    this.loadingParcelIds.add(row.parcelId);
    this.staffApiService
      .leaveParcelAtStop(row.parcelId, photo)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.loadingParcelIds.delete(row.parcelId);
          this.applyLeftAtStop(row.parcelId, resp?.data);
        },
        error: (err: unknown) => {
          this.loadingParcelIds.delete(row.parcelId);
          this.alertService.toast(this.translate.instant(this.mapErrorCode(err)), 'error');
          void this.store.refresh();
        },
      });
  }

  /** Writes back the SERVER's status, timestamp and URL together — the proof
   * and the claim-window start (OBRS-629 Q8) are never reconstructed locally. */
  private applyLeftAtStop(parcelId: number, data: ParcelLeaveAtStopRespDto | undefined): void {
    if (!data?.deliveryStatus) return;
    this.store.mutate((rows) =>
      rows.map((r) =>
        r.parcelId === parcelId
          ? {
              ...r,
              deliveryStatus: data.deliveryStatus,
              leftAtStopAt: data.leftAtStopAt,
              leftAtStopPhotoUrl: data.photoUrl,
            }
          : r
      )
    );
  }

  /** Shared runner for the simple (no-dialog) load/arrived transitions —
   * optimistic per-row DISABLE, never an optimistic state flip. */
  private runAction(parcelId: number, request: ReturnType<StaffApiService['loadParcel']>): void {
    this.loadingParcelIds.add(parcelId);
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: (resp) => {
        this.loadingParcelIds.delete(parcelId);
        this.applyStatus(parcelId, resp?.data?.deliveryStatus);
      },
      error: (err: unknown) => {
        this.loadingParcelIds.delete(parcelId);
        this.alertService.toast(
          this.translate.instant(this.mapErrorCode(err)),
          'error'
        );
        void this.store.refresh(); // wrong-state 409 -> re-sync with server truth
      },
    });
  }

  private applyStatus(parcelId: number, deliveryStatus: string | undefined): void {
    if (!deliveryStatus) return;
    this.store.mutate((rows) =>
      rows.map((r) => (r.parcelId === parcelId ? { ...r, deliveryStatus } : r))
    );
  }

  private mapErrorCode(err: unknown): string {
    const errorCode = (err as HttpErrorResponse)?.error?.errorCode as string | undefined;
    return mapApiErrorCode(errorCode, ACTION_ERROR_KEYS, 'STAFF.PARCEL_DELIVERY.ERROR.WRONG_STATE');
  }

  private mapClaimErrorCode(err: unknown): string {
    const errorCode = (err as HttpErrorResponse)?.error?.errorCode as string | undefined;
    return mapApiErrorCode(errorCode, CLAIM_ACTION_ERROR_KEYS, 'STAFF.PARCEL_DELIVERY.ERROR.CLAIM_GENERIC');
  }
}
