import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { AdminApiService, AdminLookupDto, AdminRoleDto } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { RolesStore } from './roles.store';
import {
  RoleRow,
  StatusOption,
  filterRolesByStatus,
  isFilterStatusStale,
  sortRolesByLatestUpdated,
  toLatestTimestamp,
  toRoleRow,
  toStatusOptions,
} from './role-management.mappers';

/**
 * Role management list + CRUD (OBRS-45 area, mappers extracted OBRS-237).
 *
 * OBRS-263 (Phase 2 split, mirroring promotions OBRS-251, user-management
 * OBRS-257 and vehicles OBRS-261): thinned down to an orchestrator. The list
 * table, the create/edit form modal, and the delete-confirm modal are now
 * child components (RoleListTableComponent / RoleFormModalComponent /
 * RoleDeleteModalComponent) — this page owns only the store subscriptions,
 * localization, the status filter, the modal open/close orchestration state,
 * and confirmDelete (API call + optimistic store update + refresh).
 */
@Component({
  selector: 'app-role-management-page',
  templateUrl: './role-management-page.component.html',
  styleUrl: './role-management-page.component.scss',
})
export class RoleManagementPageComponent implements OnInit, OnDestroy {
  protected roles: RoleRow[] = [];
  protected filteredRoles: RoleRow[] = [];
  protected statusOptions: StatusOption[] = [];

  protected lastUpdatedAt = '-';
  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected selectedStatusFilter = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isDeleting = false;
  protected mode: 'create' | 'edit' = 'create';
  protected selectedRole: RoleRow | null = null;

  // Placeholder rows rendered while the (occasionally cold-starting) backend
  // responds, so the table shows its shape instead of a blank body.
  protected readonly skeletonRows = Array.from({ length: 5 });

  // Bound reloader passed to the form modal so it can refresh the list after
  // it closes and shows its own success alert (arrow closes over `this`,
  // mirroring VehiclesPageComponent.reloadStructureBound /
  // PromotionsPageComponent.reloadStructureBound /
  // UserManagementPageComponent.reloadStructureBound).
  protected readonly reloadStructureBound = () => this.store.refresh();

  private readonly subscriptions = new Subscription();

  private rawRoles: AdminRoleDto[] = [];
  private rawLookups: AdminLookupDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: RolesStore
  ) {
    // Switching language only changes which translation we display; the data is
    // already in memory, so re-derive the view locally instead of re-fetching.
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.applyLocalization();
      })
    );
  }

  ngOnInit(): void {
    // Render the cached roles instantly on re-entry, then revalidate.
    this.subscriptions.add(
      // OBRS-506: honor a null emission (OBRS-467 shape) — clear() (e.g.
      // logout) DISCARDS the cached value; the old `if (data)` guard kept the
      // previous session's rows on screen. applyLocalization() is safe over
      // empty arrays (map/filter of []).
      this.store.data$.subscribe((data) => {
        this.rawRoles = data?.roles ?? [];
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
          this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_ROLES_FAILED');
          this.filteredRoles = [];
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

  get activeRoles(): number {
    return this.roles.filter((role) => role.statusCode === 'active').length;
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatusFilter = String(value ?? '').trim().toLowerCase();
    this.applyRoleFilter();
  }

  protected openCreateModal(): void {
    this.mode = 'create';
    this.selectedRole = null;
    this.isFormModalOpen = true;
  }

  protected openEditModal(role: RoleRow): void {
    this.mode = 'edit';
    this.selectedRole = role;
    this.isFormModalOpen = true;
  }

  protected onFormModalClosed(): void {
    this.isFormModalOpen = false;
    this.selectedRole = null;
  }

  protected openDeleteModal(role: RoleRow): void {
    this.selectedRole = role;
    this.isDeleteModalOpen = true;
  }

  protected closeDeleteModal(force = false): void {
    if (this.isDeleting && !force) {
      return;
    }

    this.isDeleteModalOpen = false;
    this.selectedRole = null;
  }

  protected async confirmDelete(): Promise<void> {
    if (!this.selectedRole) {
      return;
    }

    this.isDeleting = true;
    try {
      await this.deleteRole(this.selectedRole);
      // Capture id before closeDeleteModal clears selectedRole.
      const id = this.selectedRole.id;
      // Optimistically remove the deleted row so the table updates synchronously,
      // without waiting for the background re-fetch to land (~2s on SIT).
      this.store.mutate((d) => ({ ...d, roles: d.roles.filter((r) => Number(r.id) !== Number(id)) }));
      this.closeDeleteModal(true);
      // Overlap the table revalidate with the success dialog (see the form
      // modal's submitRole for the same concurrency).
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
    const dateLang = this.translate.currentLang;

    this.statusOptions = toStatusOptions(this.rawLookups, this.rawRoles, currentLocale);
    this.roles = sortRolesByLatestUpdated(this.rawRoles).map((role) =>
      toRoleRow(role, currentLocale, dateLang)
    );
    this.syncStatusFilterWithAvailableOptions();
    this.applyRoleFilter();
    this.lastUpdatedAt = toLatestTimestamp(this.rawRoles, dateLang);
  }

  private applyRoleFilter(): void {
    this.filteredRoles = filterRolesByStatus(this.roles, this.selectedStatusFilter);
  }

  private syncStatusFilterWithAvailableOptions(): void {
    if (isFilterStatusStale(this.selectedStatusFilter, this.statusOptions)) {
      this.selectedStatusFilter = '';
    }
  }

  // NOTE: `||` short-circuit is deliberate — translate.getDefaultLang() must
  // only be called when currentLang is falsy (some TranslateService stubs
  // don't implement it).
  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }

  private async deleteRole(role: RoleRow): Promise<void> {
    await firstValueFrom(this.adminApiService.deleteRoleById(role.id));
  }
}
