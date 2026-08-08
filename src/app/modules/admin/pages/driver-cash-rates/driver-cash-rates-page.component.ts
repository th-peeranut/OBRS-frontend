import { Component, OnDestroy, OnInit } from '@angular/core';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorCode, mapApiErrorCode } from '../../../../shared/lib/api-error-code';
import {
  DRIVER_CASH_RATE_DUPLICATE_ERROR_CODE,
  DriverCashRateRowDto,
} from '../../../../shared/interfaces/driver-cash.interface';
import { DriverCashRatesStore } from './driver-cash-rates.store';

const CREATE_ERROR_KEYS: Record<string, string> = {
  [DRIVER_CASH_RATE_DUPLICATE_ERROR_CODE]: 'ADMIN.DRIVER_CASH_RATES.ERROR.DUPLICATE',
};

/**
 * OBRS-960 — `/admin/settings` "driver-cash-rates" tab (owner-only). Card 1:
 * add-rate form (`app-admin-dropdown` for the SALES POINT + `p-datePicker` +
 * `input.admin-field` + one `admin-btn-primary`). Card 2: view-only history
 * table — the API is GET/POST only, so nothing here is editable in place.
 *
 * OBRS-1073 moved the key from stop to sales point. What that buys the owner
 * is arithmetic, not tidiness: บ้านบึง covers 7 stops and หมอชิต 2, so setting
 * the three real rates used to be 10 hand-keyed rows that all had to agree,
 * and a stop added to บ้านบึง later earned 0 silently. It is 3 rows now, and a
 * new stop inherits its counter's rate.
 */
@Component({
    selector: 'app-driver-cash-rates-page',
    templateUrl: './driver-cash-rates-page.component.html',
    styleUrl: './driver-cash-rates-page.component.scss',
    standalone: false
})
export class DriverCashRatesPageComponent implements OnInit, OnDestroy {
  protected rates: DriverCashRateRowDto[] = [];
  protected salesPointOptions: { value: string; label: string }[] = [];
  private salesPointIdByCode = new Map<string, number>();

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';

  protected selectedSalesPointCode = '';
  protected effectiveFromDate: Date | null = null;
  protected ratePerHeadInput = '';
  protected isSubmitting = false;
  protected submitError = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: DriverCashRatesStore,
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    // OBRS-1073 — the picker lists SALES POINTS from the owner-only endpoint;
    // see `DriverCashRatesStore`'s doc comment for why it no longer borrows the
    // public all-stops list. `name` is the owner's own wording ("บ้านบึง") and
    // is not translated: there are three of them and they are place names.
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.rates = data?.rates ?? [];
      this.salesPointIdByCode = new Map((data?.salesPoints ?? []).map((sp) => [sp.code, sp.id]));
      this.salesPointOptions = (data?.salesPoints ?? []).map((sp) => ({
        value: sp.code,
        label: sp.name,
      }));
    });
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isRefreshing = refreshing;
    });
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.refreshFailed = failed && this.store.hasValue;
      this.errorMessage =
        failed && !this.store.hasValue ? this.translate.instant('ADMIN.DRIVER_CASH_RATES.LOAD_FAILED') : '';
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

  protected onSalesPointChange(value: string): void {
    this.selectedSalesPointCode = value;
  }

  protected get canSubmit(): boolean {
    return (
      !this.isSubmitting &&
      this.selectedSalesPointCode !== '' &&
      this.effectiveFromDate !== null &&
      Number(this.ratePerHeadInput) > 0
    );
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit || !this.effectiveFromDate) return;
    const salesPointId = this.salesPointIdByCode.get(this.selectedSalesPointCode);
    if (!salesPointId) return;

    this.isSubmitting = true;
    this.submitError = '';
    try {
      await firstValueFrom(
        this.adminApiService.createDriverCashRate({
          salesPointId,
          effectiveFrom: this.toDateInputValue(this.effectiveFromDate),
          ratePerHead: this.ratePerHeadInput.trim(),
        })
      );
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      this.selectedSalesPointCode = '';
      this.effectiveFromDate = null;
      this.ratePerHeadInput = '';
      await this.store.refresh();
    } catch (error) {
      const code = extractApiErrorCode(error, null);
      this.submitError = this.translate.instant(
        mapApiErrorCode(code, CREATE_ERROR_KEYS, 'ADMIN.DRIVER_CASH_RATES.ERROR.CREATE_FAILED')
      );
    } finally {
      this.isSubmitting = false;
    }
  }

  /** "current" chip: the LATEST row per SALES POINT with `effectiveFrom <= today`. */
  protected isCurrent(row: DriverCashRateRowDto): boolean {
    const today = this.toDateInputValue(new Date());
    if (row.effectiveFrom > today) {
      return false;
    }
    const latestForSalesPoint = this.rates
      .filter((r) => r.salesPointId === row.salesPointId && r.effectiveFrom <= today)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
    return latestForSalesPoint?.id === row.id;
  }

  protected trackById(_index: number, row: DriverCashRateRowDto): number {
    return row.id;
  }

  private toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
