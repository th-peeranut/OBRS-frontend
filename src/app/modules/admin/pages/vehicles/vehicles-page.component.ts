import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../auth/auth.service';
import { VehiclesStore } from './vehicles.store';
import {
  Option,
  VehicleRow,
  filterMaintenanceStatusLookups,
  filterVehiclesByStatus,
  isVehicleStatusFilterStale,
  statusClass,
  toVehicleRow,
  toVehicleStatusOptions,
  toVehicleTypeOptions,
} from './vehicles-page.mappers';
import {
  MaintenancePartLabels,
  toPartOptions,
} from './vehicle-maintenance-plan/vehicle-maintenance-plan.mappers';
import { MaintenanceCreateDraft } from './vehicle-maintenance/vehicle-maintenance.mappers';

/**
 * Vehicle management list + CRUD + maintenance focus (OBRS-91 / OBRS-209).
 *
 * OBRS-261 (Phase 2 split, mirroring promotions OBRS-251 and user-management
 * OBRS-257): thinned down to an orchestrator. The list table, the
 * create/edit form modal, and the delete-confirm modal are now child
 * components (VehicleListTableComponent / VehicleFormModalComponent /
 * VehicleDeleteModalComponent) — this page owns only the store
 * subscriptions, localization, option lists, the status filter, the
 * maintenance-tab focus state, and the modal open/close + delete
 * orchestration state. `<app-vehicle-maintenance-panel>` is unrelated to
 * this split and is untouched.
 */
@Component({
    selector: 'app-vehicles-page',
    templateUrl: './vehicles-page.component.html',
    styleUrl: './vehicles-page.component.scss',
    standalone: false
})
export class VehiclesPageComponent implements OnInit, OnDestroy {
  protected vehicles: VehicleRow[] = [];
  protected filteredVehicles: VehicleRow[] = [];
  protected vehicleTypeOptions: Option[] = [];
  protected statusOptions: Option[] = [];
  protected selectedStatusFilter = '';

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected errorMessage = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isDeleting = false;
  protected mode: 'create' | 'edit' = 'create';
  protected selectedVehicle: VehicleRow | null = null;

  // OBRS-209: Maintenance tab — the tab bar mirrors SchedulesPageComponent's
  // pattern (set/schedule tabs). "Maintenance" starts disabled until a
  // vehicle row's "Manage maintenance" action focuses one.
  // OBRS-312: "Inspections" is a third tab reusing the SAME focusedVehicle
  // mechanic — both non-'list' tabs stay disabled until a vehicle is focused.
  // OBRS-1333: "Plans" (maintenance PLANS — recurring reminder rules, distinct
  // from the "Maintenance" tab's work-order log) is a fourth tab, same mechanic.
  protected activeTab: 'list' | 'maintenance' | 'inspections' | 'plans' = 'list';
  protected focusedVehicle: VehicleRow | null = null;
  // OBRS-357: set only when this page was entered from an inspection-defect
  // notification deep-link (?fromInspection=<id>), and passed straight down to
  // the maintenance panel, which opens its create modal pre-filled.
  protected maintenanceDraft: MaintenanceCreateDraft | null = null;
  protected maintenanceStatusOptions: AdminLookupDto[] = [];
  // OBRS-1333: unlike maintenanceStatusOptions above (a fetched Lookup
  // category), `part` is a static backend enum (`MAINTENANCE_PART_CODES`) —
  // there is nothing to fetch, so this page resolves the localized labels
  // itself via translate.instant() and passes the finished Option[] down,
  // mirroring expenses-page.component.ts's categoryOptions.
  protected partOptions: Option[] = [];
  // Write affordances on the maintenance panel (Add + modal Save) are
  // owner/admin only; the per-row "Manage maintenance" action itself is
  // available to every reader. Computed once — single source of truth
  // passed down to the panel as an @Input(). Reused verbatim (identical
  // hasAnyRole(['owner']) gate) as the maintenance-plans panel's canWrite.
  protected readonly canWriteMaintenance: boolean;

  // Bound reloader passed to the form modal so it can refresh the list after
  // it closes and shows its own success alert (arrow closes over `this`,
  // mirroring PromotionsPageComponent.reloadStructureBound /
  // UserManagementPageComponent.reloadStructureBound). Called LAST in the
  // child's submitVehicle, after close + alert — same order as the
  // pre-split store.refresh() call.
  protected readonly reloadStructureBound = () => this.store.refresh();

  private readonly subscriptions = new Subscription();

  // OBRS-357: the resolved draft, held until the vehicle rows it must focus
  // have arrived. The deep-link's fetch and the vehicles list race, and either
  // can land first, so neither one alone may do the focusing.
  private pendingMaintenanceDraft: MaintenanceCreateDraft & { vehicleId: number } | null = null;

  private rawVehicles: AdminVehicleDto[] = [];
  private rawVehicleTypes: AdminVehicleTypeDto[] = [];
  private rawLookups: AdminLookupDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: VehiclesStore,
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute
  ) {
    this.canWriteMaintenance = this.authService.hasAnyRole(['owner']);

    // Language change only swaps displayed translations; data is already loaded,
    // so re-derive the view locally instead of re-fetching from the backend.
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.applyLocalization();
      })
    );
  }

  ngOnInit(): void {
    // Render the cached list instantly on re-entry, then revalidate.
    this.subscriptions.add(
      // OBRS-506: honor a null emission (OBRS-467 shape) — clear() (e.g.
      // logout) DISCARDS the cached value; the old `if (data)` guard kept the
      // previous session's rows on screen. applyLocalization() is safe over
      // empty arrays (map/filter of []).
      this.store.data$.subscribe((data) => {
        this.rawVehicles = data?.vehicles ?? [];
        this.rawVehicleTypes = data?.vehicleTypes ?? [];
        this.rawLookups = data?.lookups ?? [];
        this.applyLocalization();
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        this.refreshFailed = failed && this.store.hasValue;
        if (failed && !this.store.hasValue) {
          this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_VEHICLES_FAILED');
          this.filteredVehicles = [];
        } else {
          this.errorMessage = '';
        }
      })
    );
    void this.store.refresh();

    // OBRS-357: the OBSERVABLE, not the snapshot. The owner who clicks an
    // inspection-defect notification while already ON this page gets a
    // query-param-only navigation, which Angular serves by REUSING this
    // component - ngOnInit does not run again and a snapshot read would sit
    // there doing nothing. That is the likeliest case, not an edge one: the
    // bell lives in the admin topbar of every admin page, this one included.
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        const fromInspection = Number(params.get('fromInspection'));
        if (Number.isInteger(fromInspection) && fromInspection > 0) {
          void this.resolveInspectionDraft(fromInspection);
        }
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

  protected get totalVehicles(): number {
    return this.vehicles.length;
  }

  protected get activeVehicles(): number {
    return this.vehicles.filter((vehicle) => this.statusClass(vehicle.statusCode) === 'is-success').length;
  }

  protected get pendingVehicles(): number {
    return this.vehicles.filter((vehicle) => this.statusClass(vehicle.statusCode) === 'is-warning').length;
  }

  protected statusClass(status: string): string {
    return statusClass(status);
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatusFilter = String(value ?? '').trim().toLowerCase();
    this.applyVehicleFilter();
  }

  protected setActiveTab(tab: 'list' | 'maintenance' | 'inspections' | 'plans'): void {
    // Maintenance/Inspections/Plans are disabled (visible, not hidden) until
    // a vehicle is focused via a per-row action.
    if (tab !== 'list' && !this.focusedVehicle) {
      return;
    }
    this.activeTab = tab;
  }

  // Per-row "Manage maintenance" action — copies
  // SchedulesPageComponent.viewSchedulesForSet()'s focus pattern.
  protected viewMaintenanceForVehicle(vehicle: VehicleRow): void {
    this.focusedVehicle = vehicle;
    this.activeTab = 'maintenance';
  }

  // OBRS-312: per-row "View inspections" action, reusing the same
  // focusedVehicle mechanic as viewMaintenanceForVehicle above.
  protected viewInspectionsForVehicle(vehicle: VehicleRow): void {
    this.focusedVehicle = vehicle;
    this.activeTab = 'inspections';
  }

  // OBRS-1333: per-row "Manage maintenance plans" action, reusing the same
  // focusedVehicle mechanic as viewMaintenanceForVehicle above.
  protected viewPlansForVehicle(vehicle: VehicleRow): void {
    this.focusedVehicle = vehicle;
    this.activeTab = 'plans';
  }

  protected clearFocusedVehicle(): void {
    this.focusedVehicle = null;
    this.activeTab = 'list';
    // OBRS-357: leaving the focused vehicle ends the deep-link's visit; a
    // later re-focus by hand must not re-open a pre-filled modal.
    this.maintenanceDraft = null;
  }

  protected openCreateModal(): void {
    this.mode = 'create';
    this.selectedVehicle = null;
    this.isFormModalOpen = true;
  }

  protected openEditModal(vehicle: VehicleRow): void {
    this.mode = 'edit';
    this.selectedVehicle = vehicle;
    this.isFormModalOpen = true;
  }

  protected onFormModalClosed(): void {
    this.isFormModalOpen = false;
    this.selectedVehicle = null;
  }

  protected openDeleteModal(vehicle: VehicleRow): void {
    this.selectedVehicle = vehicle;
    this.isDeleteModalOpen = true;
  }

  protected closeDeleteModal(force = false): void {
    if (this.isDeleting && !force) {
      return;
    }

    this.isDeleteModalOpen = false;
    this.selectedVehicle = null;
  }

  protected async confirmDelete(): Promise<void> {
    if (!this.selectedVehicle) {
      return;
    }

    this.isDeleting = true;
    try {
      await firstValueFrom(this.adminApiService.deleteVehicle(this.selectedVehicle.id));
      // Capture id before closeDeleteModal clears selectedVehicle.
      const id = this.selectedVehicle.id;
      // Optimistically remove the deleted row so the table updates synchronously,
      // without waiting for the background re-fetch to land (~2s on SIT).
      this.store.mutate((d) => ({ ...d, vehicles: d.vehicles.filter((v) => v.id !== id) }));
      this.closeDeleteModal(true);
      // Overlap the table revalidate with the success dialog.
      const refresh = this.store.refresh();
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      await refresh;
    } catch (error) {
      this.closeDeleteModal(true);
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isDeleting = false;
    }
  }

  // Re-derive every locale-dependent view field from the DTOs already in memory.
  // Runs on initial load and on each language change — no backend round-trip.
  private applyLocalization(): void {
    const currentLocale = this.getCurrentLocale();

    this.vehicleTypeOptions = toVehicleTypeOptions(this.rawVehicleTypes, currentLocale);
    this.statusOptions = toVehicleStatusOptions(this.rawLookups, currentLocale);

    // OBRS-209: raw Lookup rows (not pre-mapped to Option[]) — the
    // maintenance panel derives its own localized labels, mirroring how this
    // page derives statusOptions above.
    this.maintenanceStatusOptions = filterMaintenanceStatusLookups(this.rawLookups);

    // OBRS-1333: unlike maintenanceStatusOptions above, `part` has no Lookup
    // fetch to filter — build the finished Option[] here (mirrors
    // expenses-page.component.ts calling toExpenseCategoryOptions(labels)).
    this.partOptions = toPartOptions(this.buildPartLabels());

    this.vehicles = this.rawVehicles.map((vehicle) => toVehicleRow(vehicle, currentLocale));
    this.syncStatusFilterWithAvailableOptions();
    this.applyVehicleFilter();
    // OBRS-357: runs on every data arrival, so a draft that resolved before
    // the rows did still finds its vehicle.
    this.focusPendingMaintenanceDraft();
  }

  /**
   * OBRS-357: the INSPECTION_DEFECT_REPORTED deep-link's landing. The link
   * carries an inspection id; this page is keyed by vehicle, so the server
   * resolves one into the other (and composes the draft text - see
   * `InspectionMaintenanceDraftRespDto`).
   */
  private async resolveInspectionDraft(inspectionId: number): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.adminApiService.getInspectionMaintenanceDraft(inspectionId)
      );
      const draft = response.data;
      if (!draft) {
        return;
      }

      this.pendingMaintenanceDraft = {
        vehicleId: draft.vehicleId,
        reason: draft.suggestedReason,
        notes: draft.suggestedNotes,
        sourceInspectionId: draft.inspectionId,
      };
      this.focusPendingMaintenanceDraft();
    } catch (error) {
      // The list itself is fine - only the deep-link failed. Say so instead of
      // leaving the owner on a page that silently ignored the link they clicked.
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.LOAD_VEHICLES_FAILED');
      await this.alertService.error(message);
    }
  }

  private focusPendingMaintenanceDraft(): void {
    const pending = this.pendingMaintenanceDraft;
    if (!pending) {
      return;
    }

    const vehicle = this.vehicles.find((row) => row.id === pending.vehicleId);
    if (!vehicle) {
      // Rows not in yet (or the vehicle is gone) - stay put and let the next
      // data arrival try again.
      return;
    }

    this.pendingMaintenanceDraft = null;
    this.focusedVehicle = vehicle;
    this.activeTab = 'maintenance';
    this.maintenanceDraft = {
      reason: pending.reason,
      notes: pending.notes,
      sourceInspectionId: pending.sourceInspectionId,
    };
  }

  // NOTE: `||` short-circuit is deliberate — translate.getDefaultLang() must
  // only be called when currentLang is falsy (some TranslateService stubs
  // don't implement it). Kept un-extracted for the same reason the other
  // admin pages (promotions/role/user/schedules/routes) keep their
  // getCurrentLocale private rather than moving it to the mappers file.
  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }

  // OBRS-1333: resolves the 12 fixed part codes' labels via translate.instant() —
  // kept as a plain object builder, mirroring expenses-page.component.ts's
  // own (unextracted, page-local) categoryOptions labels construction.
  private buildPartLabels(): MaintenancePartLabels {
    return {
      engineOil: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.ENGINE_OIL'),
      oilFilter: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.OIL_FILTER'),
      airFilter: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.AIR_FILTER'),
      cabinAirFilter: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.CABIN_AIR_FILTER'),
      fuelFilter: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.FUEL_FILTER'),
      sparkPlugs: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.SPARK_PLUGS'),
      brakePads: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.BRAKE_PADS'),
      brakeFluid: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.BRAKE_FLUID'),
      tires: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.TIRES'),
      battery: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.BATTERY'),
      coolant: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.COOLANT'),
      transmissionFluid: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.TRANSMISSION_FLUID'),
      timingBelt: this.translate.instant('ADMIN.VEHICLES.MAINTENANCE_PLAN.PARTS.TIMING_BELT'),
    };
  }

  private applyVehicleFilter(): void {
    this.filteredVehicles = filterVehiclesByStatus(this.vehicles, this.selectedStatusFilter);
  }

  private syncStatusFilterWithAvailableOptions(): void {
    if (isVehicleStatusFilterStale(this.selectedStatusFilter, this.statusOptions)) {
      this.selectedStatusFilter = '';
    }
  }
}
