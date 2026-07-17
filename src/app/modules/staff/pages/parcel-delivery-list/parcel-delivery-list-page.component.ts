import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';
import { parcelDeliveryStatusChip, ParcelStatusChip } from '../../../../shared/lib/parcel-delivery-status';
import {
  isParcelBookingBlocking,
  parcelPaymentFlag,
  ParcelPaymentFlag,
} from '../../../../shared/lib/parcel-booking-status';
import { parcelStopLabel } from '../../../../shared/lib/parcel-stop-label';
import { ParcelDeliveryListStore } from './parcel-delivery-list.store';

const ACTION_ERROR_KEYS: Record<string, string> = {
  PARCEL_COLLECT_CODE_MISMATCH: 'STAFF.PARCEL_DELIVERY.ERROR.CODE_MISMATCH',
  PARCEL_ALREADY_COLLECTED: 'STAFF.PARCEL_DELIVERY.ERROR.ALREADY_COLLECTED',
  PARCEL_BOOKING_NOT_CONFIRMED: 'STAFF.PARCEL_DELIVERY.ERROR.BOOKING_NOT_CONFIRMED',
};

/**
 * Smart page: `/staff/parcels/deliveries/:scheduleId` (driver + salesperson —
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
    return (errorCode && ACTION_ERROR_KEYS[errorCode]) || 'STAFF.PARCEL_DELIVERY.ERROR.WRONG_STATE';
  }
}
