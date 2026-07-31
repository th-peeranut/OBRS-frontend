import { Component, OnDestroy, OnInit } from '@angular/core';
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
  protected activeTab: 'list' | 'maintenance' | 'inspections' = 'list';
  protected focusedVehicle: VehicleRow | null = null;
  protected maintenanceStatusOptions: AdminLookupDto[] = [];
  // Write affordances on the maintenance panel (Add + modal Save) are
  // owner/admin only; the per-row "Manage maintenance" action itself is
  // available to every reader. Computed once — single source of truth
  // passed down to the panel as an @Input().
  protected readonly canWriteMaintenance: boolean;

  // Bound reloader passed to the form modal so it can refresh the list after
  // it closes and shows its own success alert (arrow closes over `this`,
  // mirroring PromotionsPageComponent.reloadStructureBound /
  // UserManagementPageComponent.reloadStructureBound). Called LAST in the
  // child's submitVehicle, after close + alert — same order as the
  // pre-split store.refresh() call.
  protected readonly reloadStructureBound = () => this.store.refresh();

  private readonly subscriptions = new Subscription();

  private rawVehicles: AdminVehicleDto[] = [];
  private rawVehicleTypes: AdminVehicleTypeDto[] = [];
  private rawLookups: AdminLookupDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: VehiclesStore,
    private readonly authService: AuthService
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

  protected setActiveTab(tab: 'list' | 'maintenance' | 'inspections'): void {
    // Maintenance/Inspections are disabled (visible, not hidden) until a
    // vehicle is focused via a per-row action.
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

  protected clearFocusedVehicle(): void {
    this.focusedVehicle = null;
    this.activeTab = 'list';
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

    this.vehicles = this.rawVehicles.map((vehicle) => toVehicleRow(vehicle, currentLocale));
    this.syncStatusFilterWithAvailableOptions();
    this.applyVehicleFilter();
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

  private applyVehicleFilter(): void {
    this.filteredVehicles = filterVehiclesByStatus(this.vehicles, this.selectedStatusFilter);
  }

  private syncStatusFilterWithAvailableOptions(): void {
    if (isVehicleStatusFilterStale(this.selectedStatusFilter, this.statusOptions)) {
      this.selectedStatusFilter = '';
    }
  }
}
