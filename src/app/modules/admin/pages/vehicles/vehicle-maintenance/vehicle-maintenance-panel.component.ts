import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  AdminLookupDto,
  AdminVehicleMaintenanceDto,
} from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { trimmedRequiredValidator } from '../../../../../shared/validators/trimmed-required.validator';
import { VehicleMaintenanceStore } from './vehicle-maintenance.store';
import {
  MaintenanceRow,
  MaintenanceStatusOption,
  hasMaintenanceDateRangeError,
  toDateControlValue,
  toMaintenancePayload,
  toMaintenanceRow,
  toMaintenanceStatusOptions,
} from './vehicle-maintenance.mappers';

/**
 * OBRS-209: the vehicles-page "Maintenance" tab panel. Self-sufficient —
 * owns its own `VehicleMaintenanceStore` instance (component-scoped, see
 * `providers` below, mirroring `BoardingListComponent`) and calls
 * `AdminApiService` directly, so `VehiclesPageComponent` only needs to pass
 * inputs.
 *
 * **Single-owner re-bind contract**: only `ngOnChanges` calls
 * `store.setVehicleId()` + `refresh()`. The host must NOT call
 * `store.setVehicleId()` itself.
 */
@Component({
  selector: 'app-vehicle-maintenance-panel',
  templateUrl: './vehicle-maintenance-panel.component.html',
  styleUrl: './vehicle-maintenance-panel.component.scss',
  providers: [VehicleMaintenanceStore],
})
export class AppVehicleMaintenancePanelComponent implements OnChanges, OnInit, OnDestroy {
  @Input() vehicleId!: number;
  @Input() vehicleLabel = '';
  /** Write affordances (Add + modal Save) are owner/admin only — computed by
   * the host (VehiclesPageComponent) via authService.hasAnyRole(['owner'])
   * and passed down, per the design-system single-source-of-truth rule. */
  @Input() canWrite = false;
  /** The pre-filtered (category === 'maintenance_status') raw Lookup rows —
   * localized here so relabeling on language change doesn't need a re-fetch. */
  @Input() statusOptions: AdminLookupDto[] = [];

  protected rows: MaintenanceRow[] = [];
  protected statusDropdownOptions: MaintenanceStatusOption[] = [];
  protected isRefreshing = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });

  protected isFormModalOpen = false;
  protected isSubmitting = false;
  protected isEditMode = false;
  protected selectedRecord: MaintenanceRow | null = null;

  protected readonly maintenanceForm: FormGroup;
  private readonly subscriptions = new Subscription();
  private rawRecords: AdminVehicleMaintenanceDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    protected readonly store: VehicleMaintenanceStore
  ) {
    this.maintenanceForm = this.formBuilder.group({
      reason: ['', [trimmedRequiredValidator, Validators.maxLength(255)]],
      startDate: [null, [Validators.required]],
      endDate: [null],
      nextDueDate: [null],
      // design-system §3.1: required, placeholder-start, no pre-seeded default.
      maintenanceStatusId: ['', [Validators.required]],
      notes: [''],
    });

    // Language change only swaps displayed translations; data is already
    // loaded, so re-derive the view locally instead of re-fetching.
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => this.applyLocalization())
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['vehicleId']) {
      this.store.setVehicleId(this.vehicleId);
      void this.store.refresh();
    }
    if (changes['statusOptions']) {
      this.applyLocalization();
    }
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        this.rawRecords = data ?? [];
        this.applyLocalization();
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        this.errorMessage =
          failed && !this.store.hasValue
            ? this.translate.instant('ADMIN.MESSAGES.LOAD_MAINTENANCE_FAILED')
            : '';
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Skeletons only while loading with no cached data yet. */
  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  /** 200 + [] — an empty state that replaces the whole table section, not a
   * zero-row table under a banner. */
  protected get isEmpty(): boolean {
    return !this.isLoading && !this.errorMessage && this.rows.length === 0;
  }

  protected trackById(_index: number, item: MaintenanceRow): number {
    return item.id;
  }

  protected openCreateModal(): void {
    if (!this.canWrite) {
      return;
    }

    this.isEditMode = false;
    this.selectedRecord = null;
    this.maintenanceForm.reset({
      reason: '',
      startDate: null,
      endDate: null,
      nextDueDate: null,
      maintenanceStatusId: '', // design-system §3.1: start on placeholder
      notes: '',
    });
    this.isFormModalOpen = true;
  }

  // Opens synchronously from the row already held in the list — the list
  // endpoint already returns the full record (reason/dates/status/notes), so
  // unlike vehicles-page/schedules-page there is no second detail fetch to
  // gate on or patch in later.
  protected openEditModal(record: MaintenanceRow): void {
    if (!this.canWrite) {
      return;
    }

    this.isEditMode = true;
    this.selectedRecord = record;
    this.maintenanceForm.reset({
      reason: record.reason,
      startDate: toDateControlValue(record.startDate),
      endDate: record.endDate ? toDateControlValue(record.endDate) : null,
      nextDueDate: record.nextDueDate ? toDateControlValue(record.nextDueDate) : null,
      maintenanceStatusId: record.statusId ? String(record.statusId) : '',
      notes: record.notes,
    });
    this.isFormModalOpen = true;
  }

  protected closeFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isFormModalOpen = false;
    this.selectedRecord = null;
    this.maintenanceForm.reset();
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.maintenanceForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected hasDateRangeError(): boolean {
    return hasMaintenanceDateRangeError(this.maintenanceForm.getRawValue());
  }

  protected async submitMaintenance(): Promise<void> {
    if (this.maintenanceForm.invalid || this.hasDateRangeError()) {
      this.maintenanceForm.markAllAsTouched();
      // AC8: an invalid submit must surface a warning, not silently no-op —
      // precedent: role-management-page.component.ts submitRole().
      await this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = toMaintenancePayload(this.maintenanceForm.getRawValue());

      if (this.isEditMode && this.selectedRecord) {
        await firstValueFrom(
          this.adminApiService.updateVehicleMaintenance(this.vehicleId, this.selectedRecord.id, payload)
        );
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createVehicleMaintenance(this.vehicleId, payload));
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      // The server assigns id/timestamps — revalidate rather than
      // optimistic-splice.
      await this.store.refresh();
    } catch (error) {
      this.closeFormModal(true);
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  // Re-derive every locale-dependent view field from the DTOs/lookups already
  // in memory. Runs on data arrival, statusOptions changes, and language change.
  private applyLocalization(): void {
    const locale = this.getCurrentLocale();
    this.statusDropdownOptions = toMaintenanceStatusOptions(this.statusOptions, locale);
    this.rows = this.rawRecords.map((record) =>
      toMaintenanceRow(record, locale, this.translate.currentLang)
    );
  }

  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }
}
