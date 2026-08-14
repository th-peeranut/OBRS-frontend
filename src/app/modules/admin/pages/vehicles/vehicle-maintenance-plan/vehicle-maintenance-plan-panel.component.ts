import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService, AdminVehicleMaintenancePlanDto } from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { VehicleMaintenancePlanStore } from './vehicle-maintenance-plan.store';
import {
  Option,
  PlanRow,
  hasIntervalError as hasIntervalErrorValue,
  toDateControlValue,
  toPlanPayload,
  toPlanRow,
} from './vehicle-maintenance-plan.mappers';

/**
 * OBRS-1333: the vehicles-page "Maintenance Plans" tab panel — a recurring
 * reminder rule (part + interval), distinct from `AppVehicleMaintenancePanelComponent`
 * (a log of past/scheduled maintenance work orders). Structural mirror of
 * that component (OBRS-209): self-sufficient, owns its own
 * `VehicleMaintenancePlanStore` instance (component-scoped, see `providers`
 * below), calls `AdminApiService` directly.
 *
 * **Single-owner re-bind contract**: only `ngOnChanges` calls
 * `store.setVehicleId()` + `refresh()`. The host must NOT call
 * `store.setVehicleId()` itself.
 */
@Component({
    selector: 'app-vehicle-maintenance-plan-panel',
    templateUrl: './vehicle-maintenance-plan-panel.component.html',
    styleUrl: './vehicle-maintenance-plan-panel.component.scss',
    providers: [VehicleMaintenancePlanStore],
    standalone: false
})
export class AppVehicleMaintenancePlanPanelComponent implements OnChanges, OnInit, OnDestroy {
  @Input() vehicleId!: number;
  @Input() vehicleLabel = '';
  /** Write affordances (Add + modal Save + Retire/Restore) are owner/admin
   * only — computed by the host (VehiclesPageComponent) via
   * authService.hasAnyRole(['owner']) and passed down, per the
   * design-system single-source-of-truth rule. Identical gate to
   * AppVehicleMaintenancePanelComponent.canWrite. */
  @Input() canWrite = false;
  /** Pre-localized (`translate.instant()`-ed by the host) part options — the
   * `part` code set is a static enum (`MAINTENANCE_PART_CODES`), not a
   * fetched Lookup list, so unlike `AppVehicleMaintenancePanelComponent.statusOptions`
   * there is nothing here for this panel to re-derive on its own. */
  @Input() partOptions: Option[] = [];

  protected rows: PlanRow[] = [];
  protected isRefreshing = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });

  protected isFormModalOpen = false;
  protected isSubmitting = false;
  protected isEditMode = false;
  protected selectedRecord: PlanRow | null = null;
  protected savingIds: Record<number, boolean> = {};

  protected readonly planForm: FormGroup;
  private readonly subscriptions = new Subscription();
  private rawRecords: AdminVehicleMaintenancePlanDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    protected readonly store: VehicleMaintenancePlanStore
  ) {
    this.planForm = this.formBuilder.group({
      // design-system §3.1: required, placeholder-start, no pre-seeded default.
      part: ['', [Validators.required]],
      intervalKm: [null, [Validators.min(1)]],
      intervalDays: [null, [Validators.min(1)]],
      lastDoneKm: [null, [Validators.min(0)]],
      lastDoneDate: [null],
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
    if (changes['partOptions']) {
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
            ? this.translate.instant('ADMIN.MESSAGES.LOAD_MAINTENANCE_PLANS_FAILED')
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

  protected trackById(_index: number, item: PlanRow): number {
    return item.id;
  }

  protected isRowSaving(row: PlanRow): boolean {
    return !!this.savingIds[row.id];
  }

  protected openCreateModal(): void {
    if (!this.canWrite) {
      return;
    }

    this.isEditMode = false;
    this.selectedRecord = null;
    this.planForm.reset({
      part: '', // design-system §3.1: start on placeholder
      intervalKm: null,
      intervalDays: null,
      lastDoneKm: null,
      lastDoneDate: null,
    });
    this.isFormModalOpen = true;
  }

  // Opens synchronously from the row already held in the list — the list
  // endpoint already returns the full record, so there is no second detail
  // fetch to gate on or patch in later.
  protected openEditModal(record: PlanRow): void {
    if (!this.canWrite) {
      return;
    }

    this.isEditMode = true;
    this.selectedRecord = record;
    this.planForm.reset({
      part: record.part,
      intervalKm: record.intervalKm,
      intervalDays: record.intervalDays,
      lastDoneKm: record.lastDoneKm,
      lastDoneDate: record.lastDoneDate ? toDateControlValue(record.lastDoneDate) : null,
    });
    this.isFormModalOpen = true;
  }

  protected closeFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isFormModalOpen = false;
    this.selectedRecord = null;
    this.planForm.reset();
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.planForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected hasIntervalError(): boolean {
    return hasIntervalErrorValue(this.planForm.getRawValue());
  }

  /** Shared by the table's NEXT_DUE column and the edit-modal header —
   * AC: the FE never recomputes next-due, it only formats whatever the
   * backend sent. */
  protected formatNextDue(nextDueKm: number | null, nextDueDateDisplay: string): string {
    const hasKm = nextDueKm !== null;
    const hasDate = !!nextDueDateDisplay;

    if (hasKm && hasDate) {
      return this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.NEXT_DUE_BOTH', {
        km: nextDueKm,
        date: nextDueDateDisplay,
      });
    }
    if (hasKm) {
      return this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.NEXT_DUE_KM', { km: nextDueKm });
    }
    if (hasDate) {
      return this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.NEXT_DUE_DATE', {
        date: nextDueDateDisplay,
      });
    }
    return this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.NEXT_DUE_NONE');
  }

  protected async submitPlan(): Promise<void> {
    if (this.planForm.invalid || this.hasIntervalError()) {
      this.planForm.markAllAsTouched();
      // AC: an invalid submit must surface a warning, not silently no-op —
      // precedent: vehicle-maintenance-panel.component.ts submitMaintenance().
      await this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = toPlanPayload(this.planForm.getRawValue());

      if (this.isEditMode && this.selectedRecord) {
        await firstValueFrom(
          this.adminApiService.updateVehicleMaintenancePlan(this.vehicleId, this.selectedRecord.id, payload)
        );
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createVehicleMaintenancePlan(this.vehicleId, payload));
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      // The server assigns id/nextDue/audit fields — revalidate rather than
      // optimistic-splice. Also the defense-in-depth path for a backend
      // `validation.maintenance-plan.interval.at-least-one` rejection: falls
      // straight into the catch block below and surfaces via
      // extractApiErrorMessage(), same as every other field rejection.
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

  // ── Deactivate / restore (AC — the only "off" mechanism, never a delete,
  // mirroring OBRS-509's inspection-items toggleActive()) ──
  protected async toggleActive(row: PlanRow): Promise<void> {
    if (!this.canWrite) {
      return;
    }

    if (row.active) {
      const confirmed = await this.alertService.confirm({
        title: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.DEACTIVATE_CONFIRM_TITLE'),
        text: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.DEACTIVATE_CONFIRM_TEXT'),
        confirmButtonText: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.DEACTIVATE_CONFIRM_BUTTON'),
        cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
      });
      if (!confirmed) {
        return;
      }
    }

    this.savingIds = { ...this.savingIds, [row.id]: true };
    try {
      await firstValueFrom(
        this.adminApiService.setVehicleMaintenancePlanActive(this.vehicleId, row.id, !row.active)
      );
      await this.store.refresh();
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
    } catch (error) {
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.savingIds = { ...this.savingIds, [row.id]: false };
    }
  }

  // Re-derive every locale-dependent view field from the DTOs/options already
  // in memory. Runs on data arrival, partOptions changes, and language change.
  private applyLocalization(): void {
    const dateLang = this.translate.currentLang;
    this.rows = this.rawRecords.map((record) => toPlanRow(record, this.partOptions, dateLang));
  }
}
