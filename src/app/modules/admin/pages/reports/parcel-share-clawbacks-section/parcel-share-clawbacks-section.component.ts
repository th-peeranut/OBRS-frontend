import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  ParcelShareClawbackRowDto,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { formatDisplayDate } from '../../../../../shared/lib/display-date-time';
import { mapApiErrorCode } from '../../../../../shared/lib/api-error-code';
import {
  ParcelShareClawbackFilter,
  ParcelShareClawbacksStore,
} from '../parcel-share-clawbacks.store';

const COLLECT_ERROR_KEYS: Record<string, string> = {
  PARCEL_SHARE_CLAWBACK_ALREADY_COLLECTED:
    'ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.ERROR.ALREADY_COLLECTED',
  PARCEL_SHARE_CLAWBACK_NOT_FOUND: 'ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.ERROR.NOT_FOUND',
};

/**
 * OBRS-1053 — the owner-facing half of OBRS-992. The backend shipped the
 * clawback ledger and the manual-collect endpoint, and nothing called them:
 * a driver's share comes back automatically inside his daily return, but a
 * SALESPERSON has no daily cash lifecycle at all, so without this table
 * their share was recoverable only by hand-crafting an HTTP request.
 *
 * Its OWN component rather than more state on `ReportsPageComponent`: this
 * section needs `AdminApiService` + `AlertService` on top of the page's
 * existing three dependencies, and 19 call sites construct that page
 * directly with `new ReportsPageComponent(...)` — widening its constructor
 * to serve one section would edit all of them for no gain here.
 *
 * ⚠️ Today every clawback amount on prod would be `0.00`: both
 * `parcel.share.driver_pct` and `parcel.share.salesperson_pct` are still at
 * their `0` default and no owner override exists, and OBRS-992's table has a
 * `CHECK (amount > 0.00)`, so no row is ever written. This section is
 * therefore expected to render its empty state until the owner sets a share
 * percentage — that is correct behaviour, not a broken fetch.
 */
@Component({
    selector: 'app-parcel-share-clawbacks-section',
    templateUrl: './parcel-share-clawbacks-section.component.html',
    styleUrl: './parcel-share-clawbacks-section.component.scss',
    standalone: false
})
export class ParcelShareClawbacksSectionComponent implements OnInit, OnDestroy {
  protected rows: ParcelShareClawbackRowDto[] = [];
  protected isLoading = false;
  protected loadFailed = false;

  /** Keyed by `clawbackId` so two rows never share one input's text. */
  protected readonly noteDrafts = new Map<number, string>();
  /** The row whose collect POST is in flight — disables just that button. */
  protected collectingId: number | null = null;

  protected readonly skeletonRows = Array.from({ length: 3 });
  protected readonly filterOptions: { value: ParcelShareClawbackFilter; label: string }[] = [
    { value: 'OUTSTANDING', label: 'ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.FILTER.OUTSTANDING' },
    { value: 'COLLECTED', label: 'ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.FILTER.COLLECTED' },
    { value: 'ALL', label: 'ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.FILTER.ALL' },
  ];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: ParcelShareClawbacksStore,
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.rows = data ?? [];
    });
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isLoading = refreshing;
    });
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      // A background revalidate failure keeps showing the cached rows — the
      // message is only meaningful when there is nothing to show at all
      // (same rule as `ReportsPageComponent.resolveLoadError`).
      this.loadFailed = failed && !this.store.hasValue;
    });
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get selectedFilter(): ParcelShareClawbackFilter {
    return this.store.filter;
  }

  // OBRS-1631: the dropdown's own `[placeholder]` is a clickable row emitting `''`, which is not
  // one of the three wire values — and not 'ALL' either, so the store sent a blank `status=`.
  protected onFilterChange(value: string): void {
    const filter = String(value ?? '').trim();
    if (!filter) {
      return;
    }
    this.store.setFilter(filter as ParcelShareClawbackFilter);
  }

  /** Dropdown options carry i18n KEYS (the store's values are wire values, and
   * translating at bind time keeps a language switch live). */
  protected get translatedFilterOptions(): { value: string; label: string }[] {
    return this.filterOptions.map((option) => ({
      value: option.value,
      label: this.translate.instant(option.label),
    }));
  }

  protected roleLabel(row: ParcelShareClawbackRowDto): string {
    return this.translate.instant(`ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.ROLE.${row.payeeRole}`);
  }

  protected statusLabel(row: ParcelShareClawbackRowDto): string {
    return this.translate.instant(`ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.STATUS.${row.status}`);
  }

  /** `collectedVia` is null while OUTSTANDING — an em dash, not a raw key. */
  protected channelLabel(row: ParcelShareClawbackRowDto): string {
    if (!row.collectedVia) {
      return '—';
    }
    return this.translate.instant(
      `ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.CHANNEL.${row.collectedVia}`
    );
  }

  protected payeeLabel(row: ParcelShareClawbackRowDto): string {
    return (
      row.payeeName ??
      this.translate.instant('ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.PAYEE_UNKNOWN')
    );
  }

  protected displayDate(value: string | null | undefined): string {
    return formatDisplayDate(value, this.translate.currentLang);
  }

  protected noteDraft(row: ParcelShareClawbackRowDto): string {
    return this.noteDrafts.get(row.clawbackId) ?? '';
  }

  protected onNoteChange(row: ParcelShareClawbackRowDto, value: string): void {
    this.noteDrafts.set(row.clawbackId, value);
  }

  protected canCollect(row: ParcelShareClawbackRowDto): boolean {
    return row.status === 'OUTSTANDING' && this.collectingId !== row.clawbackId;
  }

  protected trackByClawbackId(_index: number, row: ParcelShareClawbackRowDto): number {
    return row.clawbackId;
  }

  /**
   * A collect is irreversible (there is no un-collect endpoint and no
   * `WAIVED` state), so it goes through the same confirm-then-POST
   * orchestration as the driver-cash return sign-off.
   */
  protected async collect(row: ParcelShareClawbackRowDto): Promise<void> {
    if (!this.canCollect(row)) {
      return;
    }

    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.CONFIRM_TITLE'),
      text: this.translate.instant('ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.CONFIRM_TEXT', {
        amount: row.amount,
        payee: this.payeeLabel(row),
      }),
      confirmButtonText: this.translate.instant(
        'ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.COLLECT_BTN'
      ),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    const note = this.noteDraft(row).trim();
    this.collectingId = row.clawbackId;
    this.adminApiService
      .collectParcelShareClawback(row.clawbackId, note.length > 0 ? note : undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.collectingId = null;
          this.noteDrafts.delete(row.clawbackId);
          const collected = response?.data;
          this.alertService.success(
            this.translate.instant('ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.SUCCESS')
          );
          // Reflect the write immediately: under the default OUTSTANDING
          // filter the row LEAVES the list, otherwise it stays and flips.
          this.store.mutate((current) =>
            this.store.filter === 'OUTSTANDING'
              ? current.filter((item) => item.clawbackId !== row.clawbackId)
              : current.map((item) =>
                  item.clawbackId === row.clawbackId ? (collected ?? item) : item
                )
          );
          void this.store.refresh();
        },
        error: (error: unknown) => {
          this.collectingId = null;
          const code = this.extractErrorCode(error);
          this.alertService.error(
            this.translate.instant(
              mapApiErrorCode(
                code,
                COLLECT_ERROR_KEYS,
                'ADMIN.REPORTS.PARCEL_SHARE_CLAWBACKS.ERROR.COLLECT_FAILED'
              )
            )
          );
          // 409 ALREADY_COLLECTED means someone else already took the money —
          // the list in front of the owner is now a lie, so re-fetch rather
          // than leave a stale OUTSTANDING row inviting a second attempt.
          void this.store.refresh();
        },
      });
  }

  private extractErrorCode(error: unknown): string | null {
    const httpError = error as { error?: { errorCode?: string } };
    return httpError?.error?.errorCode ?? null;
  }
}
