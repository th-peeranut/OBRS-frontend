import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService, AdminVehicleTypeDto } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { CargoCapacityStore } from './cargo-capacity.store';
import {
  CargoCapacityRow,
  formatCargoCapacityInputValue,
  toCargoCapacityRows,
  toUpdateVehicleTypePayload,
} from './cargo-capacity-page.mappers';
import {
  CargoCapacityValidationErrorCode,
  cargoCapacityValidationErrorKey,
  validateCargoCapacityKgInput,
} from './cargo-capacity.validators';

/**
 * OBRS-508: narrow, single-purpose admin page — set (or clear) each vehicle
 * type's parcel cargo quota. Deliberately NOT a full vehicle-type CRUD
 * screen (design-system scope note). Each row saves independently via its
 * own PUT (row-level, not a form-wide submit), so per-row state (input text,
 * validation error, in-flight save) is plain component state keyed by
 * vehicle-type id rather than a FormArray — sidesteps the
 * debounced-store-round-trip-orphans-FormArray-controls gotcha entirely,
 * since a background `store.refresh()` never has to reconcile/rebuild
 * per-row controls (see `applyRows()`'s pristine-per-row patch below).
 */
@Component({
  selector: 'app-cargo-capacity-page',
  templateUrl: './cargo-capacity-page.component.html',
  styleUrl: './cargo-capacity-page.component.scss',
})
export class CargoCapacityPageComponent implements OnInit, OnDestroy {
  protected rows: CargoCapacityRow[] = [];
  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 3 });

  // Keyed by vehicle-type id. Plain records (not FormControls) — see class
  // doc above.
  protected inputValues: Record<number, string> = {};
  protected errorCodes: Record<number, CargoCapacityValidationErrorCode | null> = {};
  protected savingIds: Record<number, boolean> = {};

  private rawVehicleTypes: AdminVehicleTypeDto[] = [];
  // Rows the admin has started editing since the last load/save — a
  // background revalidate must not clobber these (same pristine-guard intent
  // as every optimistic-open-modal precedent, applied per-row instead of
  // per-control).
  private readonly touchedIds = new Set<number>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: CargoCapacityStore
  ) {
    // Language change only swaps displayed labels; data is already loaded,
    // so re-derive the view locally instead of re-fetching from the backend.
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.applyLocalization();
    });
  }

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      if (data) {
        this.rawVehicleTypes = data.vehicleTypes;
        this.applyLocalization();
      }
    });

    this.store.refreshing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((refreshing) => (this.isRefreshing = refreshing));

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.refreshFailed = failed && this.store.hasValue;
      this.errorMessage =
        failed && !this.store.hasValue
          ? this.translate.instant('ADMIN.CARGO_CAPACITY.LOAD_FAILED')
          : '';
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

  protected inputValue(row: CargoCapacityRow): string {
    return this.inputValues[row.id] ?? '';
  }

  protected isRowDirty(row: CargoCapacityRow): boolean {
    return this.inputValue(row) !== formatCargoCapacityInputValue(row.cargoCapacityKg);
  }

  protected isRowSaving(row: CargoCapacityRow): boolean {
    return !!this.savingIds[row.id];
  }

  protected rowErrorKey(row: CargoCapacityRow): string | null {
    return cargoCapacityValidationErrorKey(this.errorCodes[row.id] ?? null);
  }

  // "Not configured" is judged off the CURRENT draft input (not just the
  // last-saved value) so the warning updates live as the admin clears/fills
  // the field, matching the card's "make it impossible to fall into
  // unknowingly" intent.
  protected isRowUnconfigured(row: CargoCapacityRow): boolean {
    return this.inputValue(row).trim() === '';
  }

  protected onInputChange(row: CargoCapacityRow, value: string): void {
    this.inputValues[row.id] = value;
    this.touchedIds.add(row.id);
    this.errorCodes[row.id] = null;
  }

  protected async saveRow(row: CargoCapacityRow): Promise<void> {
    const { value, errorCode } = validateCargoCapacityKgInput(this.inputValue(row));
    if (errorCode) {
      this.errorCodes[row.id] = errorCode;
      return;
    }

    this.savingIds = { ...this.savingIds, [row.id]: true };
    try {
      // Full-replace PUT hazard: build the payload from the freshly-fetched
      // DETAIL response, never the list row — see toUpdateVehicleTypePayload.
      const detailResponse = await firstValueFrom(this.adminApiService.getVehicleTypeById(row.id));
      const detail = detailResponse?.data;
      if (!detail) {
        throw new Error('Vehicle type not found');
      }

      const payload = toUpdateVehicleTypePayload(detail, value);
      await firstValueFrom(this.adminApiService.updateVehicleType(row.id, payload));

      this.touchedIds.delete(row.id);
      this.errorCodes[row.id] = null;
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      await this.store.refresh();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.savingIds = { ...this.savingIds, [row.id]: false };
    }
  }

  private applyLocalization(): void {
    const locale = this.getCurrentLocale();
    this.rows = toCargoCapacityRows(this.rawVehicleTypes, locale);

    for (const row of this.rows) {
      if (!this.touchedIds.has(row.id)) {
        this.inputValues[row.id] = formatCargoCapacityInputValue(row.cargoCapacityKg);
      }
    }
  }

  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }
}
