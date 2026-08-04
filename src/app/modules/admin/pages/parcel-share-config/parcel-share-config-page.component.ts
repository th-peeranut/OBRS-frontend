import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  ParcelShareOwnerConfigDto,
  ParcelShareRepairRespDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { CanComponentDeactivate } from '../../../../shared/guards/can-deactivate.guard';
import { confirmDiscardUnsavedSettings } from '../system-settings/unsaved-settings-prompt';
import { ParcelShareConfigAdminStore } from './parcel-share-config.store';

/**
 * OBRS-960 — `/admin/settings` "parcel-share" tab (owner-only). Copies
 * `BookingPolicyConfigPageComponent`'s structure exactly (card): SWR store +
 * `CanComponentDeactivate` + pristine-only patch + focus-management-on-
 * invalid-submit + `admin-form-grid`.
 *
 * Card 2 (repair) is its own thing this page adds on top: a confirm button
 * -> `AlertService.confirm()` stating what will change -> POST repair -> a
 * PERSISTENT inline result card (not just a toast) — same idiom
 * `parcel-consign-page` already uses for its result panel.
 */
@Component({
    selector: 'app-parcel-share-config-page',
    templateUrl: './parcel-share-config-page.component.html',
    styleUrl: './parcel-share-config-page.component.scss',
    standalone: false
})
export class ParcelShareConfigPageComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  @ViewChild('driverPctInput') private readonly driverPctInput?: ElementRef<HTMLInputElement>;
  @ViewChild('salespersonPctInput') private readonly salespersonPctInput?: ElementRef<HTMLInputElement>;

  protected config: ParcelShareOwnerConfigDto | null = null;
  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected isSaving = false;

  protected readonly form: FormGroup;

  protected isRepairing = false;
  protected repairResult: ParcelShareRepairRespDto | null = null;
  protected repairErrorMessage = '';

  private hasLoadedOnce = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: ParcelShareConfigAdminStore,
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.form = this.formBuilder.group({
      driverPct: [null, [Validators.required, Validators.min(0), Validators.max(100)]],
      salespersonPct: [null, [Validators.required, Validators.min(0), Validators.max(100)]],
    });
  }

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      if (data) {
        this.config = data;
        this.applyFormValues(data, this.hasLoadedOnce);
        this.hasLoadedOnce = true;
      } else {
        this.config = null;
      }
    });

    this.store.refreshing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((refreshing) => (this.isRefreshing = refreshing));

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.refreshFailed = failed && this.store.hasValue;
      this.errorMessage =
        failed && !this.store.hasValue
          ? this.translate.instant('ADMIN.PARCEL_SHARE_CONFIG.LOAD_FAILED')
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

  /** Card: "the 'not configured' banner when either *Configured is false." */
  protected get isNotConfigured(): boolean {
    return !!this.config && (!this.config.driverPctConfigured || !this.config.salespersonPctConfigured);
  }

  /** Client-side sum > 100 guard mirroring the server's rule. */
  protected get sumExceeds100(): boolean {
    const driverPct = Number(this.form.get('driverPct')?.value);
    const salespersonPct = Number(this.form.get('salespersonPct')?.value);
    if (!Number.isFinite(driverPct) || !Number.isFinite(salespersonPct)) {
      return false;
    }
    return driverPct + salespersonPct > 100;
  }

  canDeactivate(): boolean | Promise<boolean> {
    return confirmDiscardUnsavedSettings(this.form, this.alertService, this.translate);
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || this.sumExceeds100) {
      this.form.markAllAsTouched();
      this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      this.focusFirstInvalidControl();
      return;
    }

    this.isSaving = true;
    try {
      const response = await firstValueFrom(
        this.adminApiService.updateParcelShareOwnerConfig({
          driverPct: Number(this.form.get('driverPct')?.value),
          salespersonPct: Number(this.form.get('salespersonPct')?.value),
        })
      );
      this.form.markAsPristine();
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      if (response.data) {
        this.store.mutate(() => response.data as ParcelShareOwnerConfigDto);
      }
      await this.store.refresh();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      this.alertService.error(message);
    } finally {
      this.isSaving = false;
    }
  }

  private focusFirstInvalidControl(): void {
    if (this.form.get('driverPct')?.invalid) {
      this.driverPctInput?.nativeElement.focus();
      return;
    }
    if (this.form.get('salespersonPct')?.invalid) {
      this.salespersonPctInput?.nativeElement.focus();
    }
  }

  private applyFormValues(config: ParcelShareOwnerConfigDto, onlyPristine: boolean): void {
    const values = { driverPct: config.driverPct, salespersonPct: config.salespersonPct };
    if (!onlyPristine) {
      this.form.reset(values);
      return;
    }
    for (const [name, value] of Object.entries(values)) {
      const control = this.form.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }
  }

  // ── Card 2: repair ─────────────────────────────────────────────────────

  protected async runRepair(): Promise<void> {
    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.PARCEL_SHARE_CONFIG.REPAIR.CONFIRM_TITLE'),
      text: this.translate.instant('ADMIN.PARCEL_SHARE_CONFIG.REPAIR.CONFIRM_TEXT'),
      confirmButtonText: this.translate.instant('ADMIN.PARCEL_SHARE_CONFIG.REPAIR.CONFIRM_BTN'),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.isRepairing = true;
    this.repairErrorMessage = '';
    try {
      // `source` is a FIXED literal audit note, never user-selectable (card:
      // "not a dispatch key; do not build a picker").
      const response = await firstValueFrom(
        this.adminApiService.repairParcelShare({ source: 'OWNER_SETTINGS_PARCEL_SHARE' })
      );
      this.repairResult = response.data ?? null;
    } catch (error) {
      this.repairErrorMessage =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.PARCEL_SHARE_CONFIG.REPAIR.FAILED');
    } finally {
      this.isRepairing = false;
    }
  }
}
