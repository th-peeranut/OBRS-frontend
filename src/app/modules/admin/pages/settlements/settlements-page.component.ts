import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { SettlementsPendingStore } from './settlements.store';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  SettlementPendingItemDto,
  SettlementScheduleDetailDto,
} from '../../../../shared/interfaces/settlement.interface';
import { SettlementsContentState } from './settlements-list/settlements-list.component';

const MAX_RANGE_SPAN_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * OBRS-196 — per-round revenue settlement + owner cash-handover sign-off.
 *
 * Smart page: owns the pending-store subscription, the date-range filter
 * (mirrors `ReportsPageComponent`), the detail cache (mirrors
 * `UsabilityReportsPageComponent`'s `detailCache`/optimistic-open pattern),
 * and all confirm orchestration + error-code branching. The list and detail
 * modal are both dumb — inputs/outputs only.
 */
@Component({
  selector: 'app-settlements-page',
  templateUrl: './settlements-page.component.html',
  styleUrl: './settlements-page.component.scss',
})
export class SettlementsPageComponent implements OnInit, OnDestroy {
  protected items: SettlementPendingItemDto[] = [];
  protected isRefreshing = false;
  protected loadError = '';
  protected rangeError = '';

  protected fromDate: Date | null = null;
  protected toDate: Date | null = null;

  // Detail modal state
  protected openScheduleId: number | null = null;
  protected modalSummary: SettlementPendingItemDto | null = null;
  protected modalDetail: SettlementScheduleDetailDto | null = null;
  protected isDetailFetching = false;
  protected isConfirming = false;
  protected detailFetchError = '';

  // In-memory cache of full schedule detail, keyed by scheduleId, so
  // reopening the same round doesn't re-issue the GET (usability-reports
  // pattern). Invalidated on confirm success/ALREADY_SETTLED so the next
  // open reflects the authoritative server state.
  private readonly detailCache = new Map<number, SettlementScheduleDetailDto>();

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: SettlementsPendingStore,
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    const range = this.store.range;
    this.fromDate = this.parseDateInputValue(range.from);
    this.toDate = this.parseDateInputValue(range.to);

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.items = data?.items ?? [];
    });

    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isRefreshing = refreshing;
    });

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.loadError = this.resolveLoadError(failed);
    });

    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected get isEmpty(): boolean {
    return this.items.length === 0;
  }

  // Single source of truth for what the list renders — an invalid range or a
  // fetch error REPLACES the table; an empty (but valid) range shows the
  // "no rounds" note instead of a zero-row table (design-system.md §6).
  protected get contentState(): SettlementsContentState {
    if (this.rangeError) {
      return 'invalid';
    }
    if (this.isLoading) {
      return 'loading';
    }
    if (this.loadError) {
      return 'error';
    }
    if (this.isEmpty) {
      return 'empty';
    }
    return 'data';
  }

  protected get stateMessage(): string {
    return this.rangeError || this.loadError;
  }

  protected onFromDateChange(value: Date | null): void {
    this.fromDate = value;
    this.applyRange();
  }

  protected onToDateChange(value: Date | null): void {
    this.toDate = value;
    this.applyRange();
  }

  // ── Detail modal ──────────────────────────────────────────────────────────

  protected openDetail(scheduleId: number): void {
    this.openScheduleId = scheduleId;
    this.detailFetchError = '';
    this.isConfirming = false;

    const cached = this.detailCache.get(scheduleId);
    if (cached) {
      // Cache hit — render the full detail immediately, no spinner, no refetch.
      this.modalSummary = this.items.find((i) => i.scheduleId === scheduleId) ?? null;
      this.modalDetail = cached;
      this.isDetailFetching = false;
      return;
    }

    // Open optimistically: populate from the row already in hand instead of
    // gating the modal on the awaited fetch (design-system.md §6).
    this.modalSummary = this.items.find((i) => i.scheduleId === scheduleId) ?? null;
    this.modalDetail = null;
    this.isDetailFetching = true;

    this.adminApiService
      .getSettlementSchedule(scheduleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const detail = response.data ?? null;
          if (detail) {
            this.detailCache.set(scheduleId, detail);
          }
          // Ignore a stale response if the admin already moved on.
          if (this.openScheduleId !== scheduleId) {
            return;
          }
          this.isDetailFetching = false;
          this.modalDetail = detail;
        },
        error: () => {
          if (this.openScheduleId !== scheduleId) {
            return;
          }
          this.isDetailFetching = false;
          this.detailFetchError = this.translate.instant('ADMIN.SETTLEMENTS.DETAIL.LOAD_FAILED');
        },
      });
  }

  protected closeDetail(): void {
    this.openScheduleId = null;
    this.modalSummary = null;
    this.modalDetail = null;
    this.isDetailFetching = false;
    this.isConfirming = false;
    this.detailFetchError = '';
  }

  protected retryFetch(): void {
    if (this.openScheduleId !== null) {
      this.openDetail(this.openScheduleId);
    }
  }

  // ── Confirm orchestration ────────────────────────────────────────────────

  protected async requestConfirm(): Promise<void> {
    const id = this.openScheduleId;
    const detail = this.modalDetail;
    if (id === null || !detail) {
      return;
    }

    // Must show the exact amount, including "THB 0.00" for a zero round.
    const amountText = this.formatMoney(detail.live.totalAmount, detail.currency);
    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.SETTLEMENTS.CONFIRM.TITLE'),
      text: this.translate.instant('ADMIN.SETTLEMENTS.CONFIRM.TEXT', { amount: amountText }),
      confirmButtonText: this.translate.instant('ADMIN.SETTLEMENTS.CONFIRM.CONFIRM_BTN'),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.isConfirming = true;
    this.adminApiService
      .confirmSettlement(id, detail.live.totalAmount)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isConfirming = false;
          const settled: SettlementScheduleDetailDto =
            response.data ?? { ...detail, status: 'SETTLED' };
          this.detailCache.set(id, settled);
          if (this.openScheduleId === id) {
            this.modalDetail = settled;
          }
          this.alertService.success(this.translate.instant('ADMIN.SETTLEMENTS.CONFIRM.SUCCESS'));
          // SETTLED is excluded server-side, so the row won't reappear on refresh.
          this.removeRow(id);
        },
        error: (error) => {
          this.isConfirming = false;
          this.handleConfirmError(error, id);
        },
      });
  }

  private handleConfirmError(error: unknown, id: number): void {
    const code = this.extractErrorCode(error);

    switch (code) {
      case 'SETTLEMENT_ALREADY_SETTLED':
        // Not a failure toast — someone else already settled it. Refetch,
        // swap the modal to the settled view, and drop the row.
        this.detailCache.delete(id);
        this.adminApiService
          .getSettlementSchedule(id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (response) => {
              const detail = response.data ?? null;
              if (detail) {
                this.detailCache.set(id, detail);
              }
              if (this.openScheduleId === id) {
                this.modalDetail = detail;
              }
            },
          });
        this.alertService.info(this.translate.instant('ADMIN.SETTLEMENTS.ERROR.ALREADY_SETTLED'));
        this.removeRow(id);
        break;

      case 'SETTLEMENT_AMOUNT_MISMATCH':
        this.alertService.error(this.translate.instant('ADMIN.SETTLEMENTS.ERROR.AMOUNT_MISMATCH'));
        // Never auto-resubmit the stale amount — force a fresh GET.
        this.detailCache.delete(id);
        this.openDetail(id);
        break;

      case 'SETTLEMENT_SCOPE_FORBIDDEN':
        this.alertService.error(this.translate.instant('ADMIN.SETTLEMENTS.ERROR.SCOPE_FORBIDDEN'));
        this.closeDetail();
        void this.store.refresh();
        break;

      case 'SETTLEMENT_ROUND_NOT_DEPARTED':
        this.alertService.error(this.translate.instant('ADMIN.SETTLEMENTS.ERROR.ROUND_NOT_DEPARTED'));
        this.closeDetail();
        void this.store.refresh();
        break;

      case 'SETTLEMENT_SCHEDULE_NOT_FOUND':
        this.alertService.error(this.translate.instant('ADMIN.SETTLEMENTS.ERROR.SCHEDULE_NOT_FOUND'));
        this.closeDetail();
        this.removeRow(id);
        void this.store.refresh();
        break;

      default:
        this.alertService.error(this.translate.instant('ADMIN.SETTLEMENTS.ERROR.CONFIRM_FAILED'));
        this.closeDetail();
        void this.store.refresh();
    }
  }

  private removeRow(id: number): void {
    this.store.mutate((current) => ({
      ...current,
      items: current.items.filter((i) => i.scheduleId !== id),
      totalElements: Math.max(0, current.totalElements - 1),
    }));
  }

  protected formatMoney(value: string, currency: string): string {
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  // Client guard first (design-system §9-adjacent: never trust raw input into
  // a service call). Only a range that passes both checks is dispatched to
  // the store; an invalid one shows an inline warning and does NOT dispatch.
  private applyRange(): void {
    this.rangeError = '';

    if (!this.fromDate || !this.toDate) {
      return;
    }

    const from = this.toDateInputValue(this.fromDate);
    const to = this.toDateInputValue(this.toDate);

    if (from > to) {
      this.rangeError = this.translate.instant('ADMIN.SETTLEMENTS.ERROR.RANGE_INVALID');
      return;
    }

    const spanDays = Math.round((this.toDate.getTime() - this.fromDate.getTime()) / MS_PER_DAY);
    if (spanDays > MAX_RANGE_SPAN_DAYS) {
      this.rangeError = this.translate.instant('ADMIN.SETTLEMENTS.ERROR.RANGE_TOO_LARGE');
      return;
    }

    this.store.setRange(from, to);
  }

  // Server 400 backstop — branches on the stable errorCode, never the
  // localized message. Only meaningful when there is no cached value to fall
  // back on; a background revalidate failure keeps showing cached data.
  private resolveLoadError(failed: boolean): string {
    if (!failed || this.store.hasValue) {
      return '';
    }

    const code = this.store.lastErrorCode;
    if (code === 'SETTLEMENT_RANGE_INVALID') {
      return this.translate.instant('ADMIN.SETTLEMENTS.ERROR.RANGE_INVALID');
    }
    if (code === 'SETTLEMENT_RANGE_TOO_LARGE') {
      return this.translate.instant('ADMIN.SETTLEMENTS.ERROR.RANGE_TOO_LARGE');
    }
    return this.translate.instant('ADMIN.SETTLEMENTS.LOAD_FAILED');
  }

  private extractErrorCode(error: unknown): string | null {
    const httpError = error as { error?: { errorCode?: string } };
    return httpError?.error?.errorCode ?? null;
  }

  private toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDateInputValue(value: string): Date | null {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
      return null;
    }
    return new Date(year, month - 1, day);
  }
}
