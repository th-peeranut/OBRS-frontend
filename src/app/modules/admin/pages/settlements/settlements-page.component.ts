import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { SettlementsPendingStore } from './settlements.store';
import {
  AdminApiService,
  AdminUserDto,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { mapApiErrorCode } from '../../../../shared/lib/api-error-code';
import {
  SettlementConfirmPayload,
  SettlementHandoverCandidate,
  SettlementPendingItemDto,
  SettlementScheduleDetailDto,
} from '../../../../shared/interfaces/settlement.interface';
import { SettlementsContentState } from './settlements-list/settlements-list.component';
import { DriverCashDaysStore } from './driver-cash-days.store';
import { DriverCashDaysContentState } from './driver-cash-days-list/driver-cash-days-list.component';
import { DriverCashDayReturnPayload } from './driver-cash-day-return-modal/driver-cash-day-return-modal.component';
import {
  DriverCashDayRespDto,
  DriverCashDaySummaryRespDto,
} from '../../../../shared/interfaces/driver-cash.interface';
import { formatMoney } from '../../../../shared/lib/money-display';

const MAX_RANGE_SPAN_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DRIVER_CASH_RETURN_ERROR_KEYS: Record<string, string> = {
  DRIVER_CASH_DISCREPANCY_REASON_REQUIRED: 'ADMIN.SETTLEMENTS.DRIVER_CASH.ERROR.REASON_REQUIRED',
  DRIVER_CASH_DAY_ALREADY_RETURNED: 'ADMIN.SETTLEMENTS.DRIVER_CASH.ERROR.ALREADY_RETURNED',
};

// OBRS-1579 — the one re-open refusal worth naming: the box is already OPEN,
// so there is nothing to re-open and retrying can never help. Anything else
// falls through to the generic failure line.
const DRIVER_CASH_REOPEN_ERROR_KEYS: Record<string, string> = {
  DRIVER_CASH_DAY_NOT_RETURNED: 'ADMIN.SETTLEMENTS.DRIVER_CASH.ERROR.NOT_RETURNED',
};

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
    standalone: false
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

  // OBRS-671: salespeople selectable as the cash hand-over person. Loaded once
  // on init (the picker is the same for every round) and passed to the modal.
  // Left empty on failure — the modal shows an empty-picker note and blocks
  // confirm rather than the page erroring out.
  protected handoverCandidates: SettlementHandoverCandidate[] = [];

  // In-memory cache of full schedule detail, keyed by scheduleId, so
  // reopening the same round doesn't re-issue the GET (usability-reports
  // pattern). Invalidated on confirm success/ALREADY_SETTLED so the next
  // open reflects the authoritative server state.
  private readonly detailCache = new Map<number, SettlementScheduleDetailDto>();

  // ── OBRS-960: driver cash — daily-return close (own section, own filter) ──
  // A driver-cash "day" is not a settlement "round" — deliberately a SEPARATE
  // date-range filter/store from the block above, per the card.
  protected driverCashDays: DriverCashDaySummaryRespDto[] = [];
  protected isDriverCashRefreshing = false;
  protected driverCashLoadError = '';
  protected driverCashFromDate: Date | null = null;
  protected driverCashToDate: Date | null = null;

  protected openDayId: number | null = null;
  protected dayModalSummary: DriverCashDaySummaryRespDto | null = null;
  protected dayModalDetail: DriverCashDayRespDto | null = null;
  protected isDayDetailFetching = false;
  protected isDayConfirming = false;
  protected isDayReopening = false;
  protected dayDetailFetchError = '';

  private readonly dayDetailCache = new Map<number, DriverCashDayRespDto>();

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: SettlementsPendingStore,
    private readonly driverCashDaysStore: DriverCashDaysStore,
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
    this.loadHandoverCandidates();

    // OBRS-960 — own section, own range.
    const dcRange = this.driverCashDaysStore.range;
    this.driverCashFromDate = this.parseDateInputValue(dcRange.from);
    this.driverCashToDate = this.parseDateInputValue(dcRange.to);

    // ⚠️ CORRECTED — the store's data$ is now a flat array (the real
    // endpoint has no {range, items} wrapper), not `data?.items`.
    this.driverCashDaysStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.driverCashDays = data ?? [];
    });
    this.driverCashDaysStore.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isDriverCashRefreshing = refreshing;
    });
    this.driverCashDaysStore.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.driverCashLoadError =
        failed && !this.driverCashDaysStore.hasValue
          ? this.translate.instant('ADMIN.SETTLEMENTS.DRIVER_CASH.LOAD_FAILED')
          : '';
    });
    void this.driverCashDaysStore.refresh();
  }

  // OBRS-671. The "handed over by" picker lists active salespeople (the staff
  // who close a shift at the counter). The backend only validates that the id
  // EXISTS — this is purely the UX shortlist, so a failure degrades to an empty
  // picker rather than blocking the page.
  private loadHandoverCandidates(): void {
    this.adminApiService
      .getUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const users = response.data ?? [];
          this.handoverCandidates = users
            .filter((user) => SettlementsPageComponent.isSelectableHander(user))
            .map((user) => ({ id: user.id, name: SettlementsPageComponent.handerName(user) }))
            .sort((a, b) => a.name.localeCompare(b.name));
        },
        error: () => {
          this.handoverCandidates = [];
        },
      });
  }

  // A salesperson (the role that mans the counter) who isn't locked/inactive.
  // Roles come back as either a slug string or an AdminRoleDto — read whichever.
  private static isSelectableHander(user: AdminUserDto): boolean {
    const isSalesperson = (user.roles ?? []).some((role) => {
      const slug = typeof role === 'string' ? role : role.slug ?? '';
      return slug.toLowerCase() === 'salesperson';
    });
    if (!isSalesperson) {
      return false;
    }
    // Exclude only explicitly non-active accounts; an absent/unknown status
    // (older list rows) is left selectable rather than silently dropped.
    const status = parseAdminStatus(user.status).code;
    return status !== 'inactive' && status !== 'suspended' && !user.locked;
  }

  private static handerName(user: AdminUserDto): string {
    const full = user.fullName?.trim();
    if (full) {
      return full;
    }
    const assembled = [user.firstName, user.lastName]
      .map((part) => part?.trim())
      .filter((part) => !!part)
      .join(' ')
      .trim();
    return assembled || user.email || `#${user.id}`;
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

  // OBRS-671: the modal emits the counted cash + who handed it over (+ a reason
  // only when the count doesn't reconcile). The final confirm dialog echoes the
  // counted cash before the (irreversible) sign-off is posted.
  protected async requestConfirm(payload: SettlementConfirmPayload): Promise<void> {
    const id = this.openScheduleId;
    const detail = this.modalDetail;
    if (id === null || !detail) {
      return;
    }

    // Echo the exact counted cash through the one formatter — even a zero
    // drawer (e.g. `THB 0` / `0 บาท`), so the sign-off dialog states the amount.
    const countedText = this.formatMoney(payload.countedCashAmount);
    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.SETTLEMENTS.CONFIRM.TITLE'),
      text: this.translate.instant('ADMIN.SETTLEMENTS.CONFIRM.DIALOG_TEXT', { counted: countedText }),
      confirmButtonText: this.translate.instant('ADMIN.SETTLEMENTS.CONFIRM.CONFIRM_BTN'),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.isConfirming = true;
    this.adminApiService
      .confirmSettlement(id, payload)
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

      // OBRS-671: the confirm body is validated server-side. These three keep
      // the modal OPEN on the same round so the owner can fix the form and
      // resubmit — the inline form already guards against them, so reaching one
      // means the client and server briefly disagreed (e.g. a stale hander).
      case 'VALIDATION_FAILED':
        this.alertService.error(this.translate.instant('ADMIN.SETTLEMENTS.ERROR.VALIDATION_FAILED'));
        break;

      case 'SETTLEMENT_DISCREPANCY_REASON_REQUIRED':
        this.alertService.error(
          this.translate.instant('ADMIN.SETTLEMENTS.ERROR.DISCREPANCY_REASON_REQUIRED')
        );
        break;

      case 'SETTLEMENT_HANDER_NOT_FOUND':
        this.alertService.error(this.translate.instant('ADMIN.SETTLEMENTS.ERROR.HANDER_NOT_FOUND'));
        // The shortlist the owner picked from may be stale — refresh it.
        this.loadHandoverCandidates();
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
    }));
  }

  protected formatMoney(value: string): string {
    const amount = Number(value);
    return formatMoney(Number.isFinite(amount) ? amount : 0, this.translate.currentLang);
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

  // ── OBRS-960: driver cash — daily-return close ────────────────────────────

  protected get isDriverCashLoading(): boolean {
    return this.isDriverCashRefreshing && !this.driverCashDaysStore.hasValue;
  }

  protected get driverCashContentState(): DriverCashDaysContentState {
    if (this.isDriverCashLoading) {
      return 'loading';
    }
    if (this.driverCashLoadError) {
      return 'error';
    }
    if (this.driverCashDays.length === 0) {
      return 'empty';
    }
    return 'data';
  }

  protected onDriverCashFromDateChange(value: Date | null): void {
    this.driverCashFromDate = value;
    this.applyDriverCashRange();
  }

  protected onDriverCashToDateChange(value: Date | null): void {
    this.driverCashToDate = value;
    this.applyDriverCashRange();
  }

  private applyDriverCashRange(): void {
    if (!this.driverCashFromDate || !this.driverCashToDate) {
      return;
    }
    const from = this.toDateInputValue(this.driverCashFromDate);
    const to = this.toDateInputValue(this.driverCashToDate);
    if (from > to) {
      return;
    }
    this.driverCashDaysStore.setRange(from, to);
  }

  protected openDayDetail(dayId: number): void {
    this.openDayId = dayId;
    this.dayDetailFetchError = '';
    this.isDayConfirming = false;
    this.isDayReopening = false;

    const cached = this.dayDetailCache.get(dayId);
    if (cached) {
      this.dayModalSummary = this.driverCashDays.find((d) => d.dayId === dayId) ?? null;
      this.dayModalDetail = cached;
      this.isDayDetailFetching = false;
      return;
    }

    // Open optimistically (design-system.md §6) — populate from the row
    // already in hand, never gate the modal on the awaited fetch.
    this.dayModalSummary = this.driverCashDays.find((d) => d.dayId === dayId) ?? null;
    this.dayModalDetail = null;
    this.isDayDetailFetching = true;

    this.adminApiService
      .getDriverCashDayDetail(dayId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const detail = response.data ?? null;
          if (detail) {
            this.dayDetailCache.set(dayId, detail);
          }
          if (this.openDayId !== dayId) {
            return;
          }
          this.isDayDetailFetching = false;
          this.dayModalDetail = detail;
        },
        error: () => {
          if (this.openDayId !== dayId) {
            return;
          }
          this.isDayDetailFetching = false;
          this.dayDetailFetchError = this.translate.instant('ADMIN.SETTLEMENTS.DRIVER_CASH.DETAIL.LOAD_FAILED');
        },
      });
  }

  protected closeDayDetail(): void {
    this.openDayId = null;
    this.dayModalSummary = null;
    this.dayModalDetail = null;
    this.isDayDetailFetching = false;
    this.isDayConfirming = false;
    this.isDayReopening = false;
    this.dayDetailFetchError = '';
  }

  protected retryDayFetch(): void {
    if (this.openDayId !== null) {
      this.openDayDetail(this.openDayId);
    }
  }

  protected async requestDayReturn(payload: DriverCashDayReturnPayload): Promise<void> {
    const id = this.openDayId;
    const detail = this.dayModalDetail;
    if (id === null || !detail) {
      return;
    }

    // ⚠️ CORRECTED — the real DTO carries no `currency` field; echo the raw
    // decimal string (same reasoning as the modal's own template).
    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.SETTLEMENTS.DRIVER_CASH.RETURN.CONFIRM_TITLE'),
      text: this.translate.instant('ADMIN.SETTLEMENTS.DRIVER_CASH.RETURN.CONFIRM_TEXT', {
        amount: payload.returnedAmount,
      }),
      confirmButtonText: this.translate.instant('ADMIN.SETTLEMENTS.DRIVER_CASH.RETURN.CONFIRM_BTN'),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.isDayConfirming = true;
    this.adminApiService
      .returnDriverCashDay(id, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isDayConfirming = false;
          const returned: DriverCashDayRespDto = response.data ?? {
            ...detail,
            status: 'RETURNED',
            returnedAmount: payload.returnedAmount,
          };
          this.dayDetailCache.set(id, returned);
          if (this.openDayId === id) {
            this.dayModalDetail = returned;
          }
          this.alertService.success(this.translate.instant('ADMIN.SETTLEMENTS.DRIVER_CASH.RETURN.SUCCESS'));
          // ⚠️ CORRECTED — the store's cached value is now a flat array.
          this.driverCashDaysStore.mutate((current) => current.filter((i) => i.dayId !== id));
        },
        error: (error: unknown) => {
          this.isDayConfirming = false;
          const code = this.extractErrorCode(error);
          const message = this.translate.instant(
            mapApiErrorCode(code, DRIVER_CASH_RETURN_ERROR_KEYS, 'ADMIN.SETTLEMENTS.DRIVER_CASH.ERROR.RETURN_FAILED')
          );
          this.alertService.error(message);
        },
      });
  }

  /**
   * OBRS-1579 — the owner re-opens a box that was already signed off, so the
   * bill that reached the counter the morning after the round can be keyed
   * against the round that actually incurred it.
   *
   * ⚠️ The re-opened day goes back into the list as OPEN. It was filtered OUT
   * of the cached array by `requestDayReturn` above, so the row is put back
   * from `dayModalSummary` rather than mapped in place - mapping alone would
   * leave the owner's worklist showing nothing where a now-OPEN box belongs.
   */
  protected async requestDayReopen(reason: string): Promise<void> {
    const id = this.openDayId;
    const summary = this.dayModalSummary;
    if (id === null || this.isDayReopening) {
      return;
    }

    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.SETTLEMENTS.DRIVER_CASH.REOPEN.CONFIRM_TITLE'),
      text: this.translate.instant('ADMIN.SETTLEMENTS.DRIVER_CASH.REOPEN.CONFIRM_TEXT'),
      confirmButtonText: this.translate.instant('ADMIN.SETTLEMENTS.DRIVER_CASH.REOPEN.CONFIRM_BTN'),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.isDayReopening = true;
    this.adminApiService
      .reopenDriverCashDay(id, { reason })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isDayReopening = false;
          const reopened = response.data ?? null;
          if (!reopened) {
            // No body to trust. Dropping the cache is not enough on its own:
            // `dayModalDetail` is still bound to the RETURNED snapshot, so the
            // owner would be left staring at a modal that says the box is
            // still signed off while the list behind it has already moved.
            // Re-fetching is what makes the screen say the truth.
            this.dayDetailCache.delete(id);
            void this.driverCashDaysStore.refresh();
            if (this.openDayId === id) {
              this.openDayDetail(id);
            }
            return;
          }
          this.dayDetailCache.set(id, reopened);
          if (this.openDayId === id) {
            this.dayModalDetail = reopened;
          }
          this.alertService.success(this.translate.instant('ADMIN.SETTLEMENTS.DRIVER_CASH.REOPEN.SUCCESS'));
          this.driverCashDaysStore.mutate((current) => {
            const row = current.find((i) => i.dayId === id);
            if (row) {
              return current.map((i) =>
                i.dayId === id
                  ? { ...i, status: reopened.status, returnedAmount: null, discrepancy: null }
                  : i
              );
            }
            return summary
              ? [...current, { ...summary, status: reopened.status, returnedAmount: null, discrepancy: null }]
              : current;
          });
        },
        error: (error: unknown) => {
          this.isDayReopening = false;
          const code = this.extractErrorCode(error);
          const message = this.translate.instant(
            mapApiErrorCode(code, DRIVER_CASH_REOPEN_ERROR_KEYS, 'ADMIN.SETTLEMENTS.DRIVER_CASH.ERROR.REOPEN_FAILED')
          );
          this.alertService.error(message);
        },
      });
  }
}
