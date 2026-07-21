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
  ParcelVerifyReqDto,
  ParcelVerifyRespDto,
} from '../../../../shared/interfaces/parcel.interface';
import {
  isParcelBookingBlocking,
  parcelPaymentFlag,
  ParcelPaymentFlag,
} from '../../../../shared/lib/parcel-booking-status';
import { ParcelVerifyFormValue } from '../../components/parcel-verify-dialog/parcel-verify-dialog.component';
import { ParcelVerifyListStore } from './parcel-verify-list.store';
import { mapApiErrorCode } from '../../../../shared/lib/api-error-code';

/** Error-code -> i18n key lookup, same shape as
 * `parcel-delivery-list-page.component.ts`'s `ACTION_ERROR_KEYS` (branches on
 * `error.error.errorCode`, never the localized `message` — design-system §9).
 * Confirmed against the backend's `ParcelVerificationService`
 * (`OBRS-backend` branch `ao/obrs-416-parcel-verify`): `PARCEL_NOT_CREATED_STATE`
 * is the ONE 409 this screen deliberately reads as information, not a user
 * failure — it covers BOTH "someone else verified it first" and "verified
 * twice" (the backend does not distinguish them with different codes).
 * `PARCEL_VERIFY_NOT_CONSIGNED`/`PARCEL_VERIFY_NO_PAID_PAYMENT` are rare edge
 * 409s with no dedicated copy here; they fall through to the generic
 * WRONG_STATE fallback below. */
const VERIFY_ERROR_KEYS: Record<string, string> = {
  PARCEL_BOOKING_NOT_CONFIRMED: 'STAFF.PARCEL_VERIFY.ERROR.BOOKING_NOT_CONFIRMED',
  PARCEL_NOT_CREATED_STATE: 'STAFF.PARCEL_VERIFY.ERROR.ALREADY_VERIFIED',
  PARCEL_ERROR_ID_NOT_FOUND: 'STAFF.PARCEL_VERIFY.ERROR.NOT_FOUND',
};

/**
 * Smart page, rendered as the _ตรวจรับ_ tab of
 * `/staff/parcels/schedule/:scheduleId` (OBRS-574 merged it with the handover
 * list; `/staff/parcels/verify/:scheduleId` still redirects here). It reads
 * `scheduleId` off the route it is rendered under, which is why the merge
 * needed no change in this file. Driver + salesperson —
 * the role hierarchy means a salesperson session also satisfies the
 * DRIVER-only `POST .../verify` endpoint). Component-scoped
 * `ParcelVerifyListStore` drives the manifest, backed by the dedicated
 * `getParcelsPendingVerification` endpoint (already filtered to
 * `deliveryStatus === 'created'` server-side — see the store's Javadoc for
 * OBRS-416's P0: the sibling delivery-handoff endpoint deliberately excludes
 * that status and can never back this screen); the verify dialog is a dumb
 * child, this page owns the HTTP call — same split as
 * `ParcelDeliveryListPageComponent`/`ParcelCollectDialogComponent`.
 */
@Component({
  selector: 'app-parcel-verify-list-page',
  templateUrl: './parcel-verify-list-page.component.html',
  styleUrl: './parcel-verify-list-page.component.scss',
  providers: [ParcelVerifyListStore],
})
export class ParcelVerifyListPageComponent implements OnInit, OnDestroy {
  protected rows: ParcelDeliveryListItemDto[] = [];
  protected isLoading = false;
  protected hasError = false;

  protected dialogParcel: ParcelDeliveryListItemDto | null = null;
  protected isVerifying = false;
  protected verifyErrorKey: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: ParcelVerifyListStore
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

  /** OBRS-396 precedent, reused verbatim: nobody paid for this parcel, so
   * `ParcelVerificationService.assertBookingConfirmed` 409s the verify call.
   * The row stays listed — staff are holding the physical box — but the
   * action is disabled. */
  protected paymentFlagFor(row: ParcelDeliveryListItemDto): ParcelPaymentFlag | null {
    return parcelPaymentFlag(row.bookingStatus);
  }

  protected isRowBlocked(row: ParcelDeliveryListItemDto): boolean {
    return isParcelBookingBlocking(row.bookingStatus);
  }

  protected declaredDimensionsLabel(row: ParcelDeliveryListItemDto): string {
    if (row.lengthCm == null || row.widthCm == null || row.heightCm == null) {
      return '-';
    }
    return `${row.lengthCm}×${row.widthCm}×${row.heightCm} cm`;
  }

  protected paidAmountLabel(row: ParcelDeliveryListItemDto): string {
    return row.amount != null ? row.amount.toFixed(2) : '-';
  }

  protected openVerifyDialog(row: ParcelDeliveryListItemDto): void {
    // Guard, not just a disabled button — same idiom as
    // ParcelDeliveryListPageComponent.openCollectDialog().
    if (this.isRowBlocked(row)) return;
    this.verifyErrorKey = null;
    this.dialogParcel = row;
  }

  protected closeVerifyDialog(): void {
    if (this.isVerifying) return;
    this.dialogParcel = null;
  }

  protected confirmAccept(value: ParcelVerifyFormValue): void {
    const parcel = this.dialogParcel;
    if (!parcel) return;
    this.submitVerify(parcel.parcelId, { ...this.toReqDto(value), outcome: 'accept' });
  }

  /**
   * The money-moving, terminal step (UX-OBRS-416 §"Reject confirmation").
   * Reuses `AlertService.confirm()` — never a raw `Swal.fire()` call — right
   * before `verifyParcel()` fires, stating the exact refund amount read off
   * the list row (the paid amount, BEFORE the verify call, per the contract
   * note: the response's refund amount cannot be known ahead of the call).
   * Cancelling returns the staff member to the same filled-in dialog —
   * nothing is sent.
   *
   * The copy names the *payment channel*, never a person (OBRS-548). A
   * consigned parcel's booking is minted with the SENDER as payer, so the
   * refund goes back the way the sender paid — naming the recipient told
   * staff the opposite. Interpolating no name also keeps a null
   * `recipientName` from leaking a raw `{{recipient}}` token onto the screen.
   */
  protected async onConfirmReject(value: ParcelVerifyFormValue): Promise<void> {
    const parcel = this.dialogParcel;
    if (!parcel) return;

    const amount = (parcel.amount ?? 0).toFixed(2);
    const confirmed = await this.alertService.confirm({
      icon: 'warning',
      title: this.translate.instant('STAFF.PARCEL_VERIFY.REJECT_CONFIRM.TITLE'),
      text: this.translate.instant('STAFF.PARCEL_VERIFY.REJECT_CONFIRM.BODY', {
        tracking: parcel.trackingNumber,
        amount,
      }),
      confirmButtonText: this.translate.instant('STAFF.PARCEL_VERIFY.REJECT_CONFIRM.CONFIRM_BTN'),
      cancelButtonText: this.translate.instant('STAFF.PARCEL_VERIFY.REJECT_CONFIRM.CANCEL_BTN'),
    });
    if (!confirmed) return; // dialog stays open, form state preserved, nothing sent

    this.submitVerify(parcel.parcelId, { ...this.toReqDto(value), outcome: 'reject' });
  }

  private toReqDto(value: ParcelVerifyFormValue): Omit<ParcelVerifyReqDto, 'outcome'> {
    return {
      actualWeightKg: value.actualWeightKg,
      actualLengthCm: value.actualLengthCm,
      actualWidthCm: value.actualWidthCm,
      actualHeightCm: value.actualHeightCm,
      rejectReason: value.rejectReason,
    };
  }

  private submitVerify(parcelId: number, payload: ParcelVerifyReqDto): void {
    this.isVerifying = true;
    this.verifyErrorKey = null;
    this.staffApiService
      .verifyParcel(parcelId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => this.handleVerifySuccess(parcelId, resp?.data, payload.outcome),
        error: (err: unknown) => {
          this.isVerifying = false;
          this.handleVerifyError(err);
        },
      });
  }

  private handleVerifySuccess(
    parcelId: number,
    data: ParcelVerifyRespDto | undefined,
    outcome: ParcelVerifyReqDto['outcome']
  ): void {
    this.isVerifying = false;
    this.dialogParcel = null;
    // The verified parcel is no longer 'created' — it belongs on the sibling
    // delivery-handoff list now, not here. Optimistic removal, matching
    // ParcelDeliveryListPageComponent's row-mutation-on-transition idiom.
    this.store.mutate((rows) => rows.filter((r) => r.parcelId !== parcelId));

    if (outcome !== 'reject') {
      return; // accept: silent success (no toast) — matches the sibling
      // list page's silent-success convention for Load/Mark-arrived.
    }

    const amount = ((data?.refundAmount ?? 0) as number).toFixed(2);
    // MUST distinguish a real gateway refund from manual_refund_required —
    // the latter means the money has NOT actually gone back yet and a human
    // still owes the sender a cash hand-back. A single "refunded
    // successfully" toast for both would misinform staff that the money
    // already moved (task brief, non-negotiable).
    const isManual = data?.refundStatus === 'manual_refund_required';
    const key = isManual
      ? 'STAFF.PARCEL_VERIFY.SUCCESS.REJECTED_MANUAL_REFUND'
      : 'STAFF.PARCEL_VERIFY.SUCCESS.REJECTED_REFUNDED';
    this.alertService.toast(this.translate.instant(key, { amount }), isManual ? 'warning' : 'success');
  }

  private handleVerifyError(err: unknown): void {
    const errorCode = (err as HttpErrorResponse)?.error?.errorCode as string | undefined;

    if (errorCode === 'PARCEL_VERIFY_REJECT_REASON_REQUIRED') {
      // Client-side validation already requires this before submit is even
      // reachable; a server-side 400 slipping through renders inline and
      // keeps the dialog open — same `serverErrorKey` pattern as
      // parcel-collect-dialog/parcel-consign-form.
      this.verifyErrorKey = 'STAFF.PARCEL_VERIFY.ERROR.VALIDATION';
      return;
    }

    // Every other error closes the dialog and re-syncs the list: the row is
    // either gone (someone else verified it) or this page's cached state no
    // longer matches the server.
    const isAlreadyVerified = errorCode === 'PARCEL_NOT_CREATED_STATE';
    const toastKey = mapApiErrorCode(errorCode, VERIFY_ERROR_KEYS, 'STAFF.PARCEL_VERIFY.ERROR.WRONG_STATE');
    this.alertService.toast(this.translate.instant(toastKey), isAlreadyVerified ? 'info' : 'error');
    this.dialogParcel = null;
    void this.store.refresh();
  }
}
