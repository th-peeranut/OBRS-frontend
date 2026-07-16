import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { Observable, combineLatest, map, startWith } from 'rxjs';
import { formatDisplayDateTime } from '../../shared/lib/display-date-time';
import { parcelStopLabel } from '../../shared/lib/parcel-stop-label';
import {
  parcelCustomerStatusLabelKey,
  parcelDeliveryStatusChip,
} from '../../shared/lib/parcel-delivery-status';
import { AlertService } from '../../shared/services/alert.service';
import { ParcelMeDto } from '../../shared/interfaces/parcel.interface';
import { invokeLoadMyParcelsApi } from './store/my-parcels.action';
import {
  selectMyParcelsError,
  selectMyParcelsHasMore,
  selectMyParcelsItems,
  selectMyParcelsLoaded,
  selectMyParcelsLoading,
  selectMyParcelsPage,
} from './store/my-parcels.selector';

interface MyParcelsVm {
  items: ParcelMeDto[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  hasMore: boolean;
  page: number;
}

interface StatusFilterOption {
  value: string;
  labelKey: string;
}

/**
 * Smart page: `/my-parcels` — the customer's own paginated parcel list, the
 * ONLY durable recovery path for a tracking number lost after the one-time
 * success screen (SPEC/UX-OBRS-415 §12, added 2026-07-16; no SMS/email
 * notification exists yet, OBRS-346). Mirrors `my-bookings`' own isolated
 * NgRx feature-slice shape/`.filter-pills`/skeleton-card conventions
 * (UX §12.7/§13) — the established pattern for a customer filtered
 * read-list page in this codebase.
 *
 * OUT OF SCOPE (explicitly cut from this card): the "Continue to payment"
 * action for a still-`pending` row. Everything else in UX §12 stands —
 * the unpaid badge/`expiresAt` still render, there's just no button to
 * re-enter the payment phase yet.
 */
@Component({
  selector: 'app-my-parcels',
  templateUrl: './my-parcels.component.html',
  styleUrl: './my-parcels.component.scss',
})
export class MyParcelsComponent implements OnInit {
  protected readonly statusFilters: StatusFilterOption[] = [
    { value: '', labelKey: 'PARCEL_BOOKING.MY_PARCELS.FILTERS.ALL' },
  ];
  protected selectedStatus = '';
  protected readonly skeletonRows = Array.from({ length: 3 });

  protected vm$!: Observable<MyParcelsVm>;

  constructor(
    private readonly store: Store,
    private readonly translate: TranslateService,
    private readonly alertService: AlertService
  ) {}

  ngOnInit(): void {
    const locale$ = this.translate.onLangChange.pipe(
      map((event: LangChangeEvent) => event.lang),
      startWith(this.translate.currentLang)
    );

    this.vm$ = combineLatest([
      this.store.select(selectMyParcelsItems),
      this.store.select(selectMyParcelsLoading),
      this.store.select(selectMyParcelsLoaded),
      this.store.select(selectMyParcelsError),
      this.store.select(selectMyParcelsHasMore),
      this.store.select(selectMyParcelsPage),
      locale$,
    ]).pipe(
      map(([items, loading, loaded, error, hasMore, page]) => ({
        items,
        loading,
        loaded,
        error,
        hasMore,
        page,
      }))
    );

    this.store.dispatch(invokeLoadMyParcelsApi({ status: null, page: 0, append: false }));
  }

  protected onStatusChange(status: string): void {
    if (status === this.selectedStatus) return;
    this.selectedStatus = status;
    this.store.dispatch(invokeLoadMyParcelsApi({ status: status || null, page: 0, append: false }));
  }

  protected onLoadMore(nextPage: number): void {
    this.store.dispatch(
      invokeLoadMyParcelsApi({ status: this.selectedStatus || null, page: nextPage, append: true })
    );
  }

  protected onRetry(): void {
    this.store.dispatch(
      invokeLoadMyParcelsApi({ status: this.selectedStatus || null, page: 0, append: false })
    );
  }

  protected trackByParcelId(_index: number, row: ParcelMeDto): number {
    return row.parcelId;
  }

  protected chipToken(status: string): string {
    return parcelDeliveryStatusChip(status).token;
  }

  protected statusLabelKey(status: string): string {
    return parcelCustomerStatusLabelKey(status);
  }

  protected stopLabel = parcelStopLabel;

  protected displayDateTime(value: string | null | undefined): string {
    return formatDisplayDateTime(value, this.translate.currentLang);
  }

  protected isCreatedAndPaid(row: ParcelMeDto): boolean {
    return row.deliveryStatus?.toLowerCase() === 'created' && row.bookingStatus === 'confirmed';
  }

  protected isPending(row: ParcelMeDto): boolean {
    return row.bookingStatus === 'pending';
  }

  protected async copyTrackingNumber(trackingNumber: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      this.alertService.toast(
        this.translate.instant('PARCEL_BOOKING.MY_PARCELS.COPY_TRACKING_NUMBER_SUCCESS'),
        'success'
      );
    } catch {
      // Clipboard access can fail (permissions, non-secure context) — no
      // further recourse; the tracking number is still visible on the row.
    }
  }

  protected async copyTrackingLink(trackingNumber: string): Promise<void> {
    const link = `${window.location.origin}/track-parcel/${trackingNumber}`;
    try {
      await navigator.clipboard.writeText(link);
      this.alertService.toast(
        this.translate.instant('PARCEL_BOOKING.MY_PARCELS.COPY_TRACKING_LINK_SUCCESS'),
        'success'
      );
    } catch {
      // Same as copyTrackingNumber — best-effort only.
    }
  }
}
