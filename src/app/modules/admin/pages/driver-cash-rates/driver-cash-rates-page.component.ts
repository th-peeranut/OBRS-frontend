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
import { getStationFallbackLabel } from '../../../../shared/interfaces/station.interface';
import { DriverCashRatesStore } from './driver-cash-rates.store';

const CREATE_ERROR_KEYS: Record<string, string> = {
  [DRIVER_CASH_RATE_DUPLICATE_ERROR_CODE]: 'ADMIN.DRIVER_CASH_RATES.ERROR.DUPLICATE',
};

/**
 * OBRS-960 — `/admin/settings` "driver-cash-rates" tab (owner-only). Card 1:
 * add-rate form (`app-admin-dropdown` for stop + `p-datePicker` +
 * `input.admin-field` + one `admin-btn-primary`). Card 2: view-only history
 * table — the API is GET/POST only, so nothing here is editable in place.
 */
@Component({
    selector: 'app-driver-cash-rates-page',
    templateUrl: './driver-cash-rates-page.component.html',
    styleUrl: './driver-cash-rates-page.component.scss',
    standalone: false
})
export class DriverCashRatesPageComponent implements OnInit, OnDestroy {
  protected rates: DriverCashRateRowDto[] = [];
  protected stopOptions: { value: string; label: string }[] = [];
  private stopIdBySlug = new Map<string, number>();

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';

  protected selectedStopSlug = '';
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
    // ⚠️ CORRECTED (2026-08-02, backend reconciliation) — stops now come
    // from `StationService.getAll()` (see `DriverCashRatesStore`'s doc
    // comment for why), not the broken `category === 'stop'` lookup filter.
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.rates = data?.rates ?? [];
      this.stopIdBySlug = new Map((data?.stops ?? []).map((s) => [s.slug, s.id]));
      this.stopOptions = (data?.stops ?? []).map((s) => ({
        value: s.slug,
        label: getStationFallbackLabel(s, this.translate.currentLang),
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

  protected onStopChange(value: string): void {
    this.selectedStopSlug = value;
  }

  protected get canSubmit(): boolean {
    return (
      !this.isSubmitting &&
      this.selectedStopSlug !== '' &&
      this.effectiveFromDate !== null &&
      Number(this.ratePerHeadInput) > 0
    );
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit || !this.effectiveFromDate) return;
    const stopId = this.stopIdBySlug.get(this.selectedStopSlug);
    if (!stopId) return;

    this.isSubmitting = true;
    this.submitError = '';
    try {
      await firstValueFrom(
        this.adminApiService.createDriverCashRate({
          stopId,
          effectiveFrom: this.toDateInputValue(this.effectiveFromDate),
          ratePerHead: this.ratePerHeadInput.trim(),
        })
      );
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      this.selectedStopSlug = '';
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

  /** "current" chip: the LATEST row per stop with `effectiveFrom <= today`. */
  protected isCurrent(row: DriverCashRateRowDto): boolean {
    const today = this.toDateInputValue(new Date());
    if (row.effectiveFrom > today) {
      return false;
    }
    const latestForStop = this.rates
      .filter((r) => r.stopId === row.stopId && r.effectiveFrom <= today)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
    return latestForStop?.id === row.id;
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
