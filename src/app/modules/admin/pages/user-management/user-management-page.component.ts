import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRoleDto,
  AdminUserDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { UsersStore } from './users.store';
import { AuthService } from '../../../../auth/auth.service';
import {
  RoleOption,
  StatusOption,
  UserRow,
  filterUsers,
  toRoleFilterOptions,
  toRoleOptions,
  toStatusOptions,
  toUserRow,
} from './user-management.mappers';

/**
 * User management list + CRUD + lock/unlock (OBRS-133 / OBRS-182 / #57).
 *
 * OBRS-257 (Phase 2 split, mirroring promotions OBRS-251 and routes
 * OBRS-212/213): thinned down to an orchestrator. The list table, the
 * create/edit form modal (credential enable/disable + duplicate-check owned
 * there), the delete-confirm modal, and the unlock-confirm modal are now
 * child components (UserListTableComponent / UserFormModalComponent /
 * UserDeleteModalComponent / UserUnlockModalComponent) — this page owns only
 * the store subscriptions, localization, filters, and the modal open/close +
 * delete/unlock orchestration state.
 */
@Component({
  selector: 'app-user-management-page',
  templateUrl: './user-management-page.component.html',
  styleUrl: './user-management-page.component.scss',
})
export class UserManagementPageComponent implements OnInit, OnDestroy {
  protected users: UserRow[] = [];
  protected filteredUsers: UserRow[] = [];

  // The full role list, as the backend sends it. Feeds the FORM modal, whose
  // question is "which roles may I assign" — see toRoleFilterOptions for why
  // the filter dropdown does NOT reuse it.
  protected roleOptions: RoleOption[] = [];
  protected roleFilterOptions: RoleOption[] = [];
  protected statusOptions: StatusOption[] = [];
  protected selectedRoleFilter = '';
  protected selectedStatusFilter = '';
  protected searchKeyword = '';

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected errorMessage = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isUnlockModalOpen = false;
  protected isDeleting = false;
  protected isUnlocking = false;
  protected mode: 'create' | 'edit' = 'create';
  protected selectedUser: UserRow | null = null;

  // Bound reloader passed to the form modal so it can refresh the list after
  // it closes and shows its own success alert (arrow closes over `this`,
  // mirroring PromotionsPageComponent.reloadStructureBound). Called LAST in
  // the child's submitUser, after close + alert — same order as the
  // pre-split store.refresh() call.
  protected readonly reloadStructureBound = () => this.store.refresh();

  private readonly subscriptions = new Subscription();

  private rawUsers: AdminUserDto[] = [];
  private rawRoles: AdminRoleDto[] = [];
  private rawLookups: AdminLookupDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: UsersStore,
    private readonly authService: AuthService
  ) {
    // Language change only swaps displayed translations; data is already loaded,
    // so re-derive the view locally instead of re-fetching from the backend.
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.applyLocalization();
      })
    );
  }

  ngOnInit(): void {
    // Render the cached users instantly on re-entry, then revalidate.
    this.subscriptions.add(
      // OBRS-506: honor a null emission (OBRS-467 shape) — clear() (e.g.
      // logout) DISCARDS the cached value; the old `if (data)` guard kept the
      // previous session's rows on screen. applyLocalization() is safe over
      // empty arrays (map/filter of []).
      this.store.data$.subscribe((data) => {
        this.rawUsers = data?.users ?? [];
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
          this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_USERS_FAILED');
          this.filteredUsers = [];
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

  protected get activeUsers(): number {
    return this.users.filter((user) => user.statusCode === 'active').length;
  }

  protected onRoleFilterChange(value: string): void {
    this.selectedRoleFilter = String(value ?? '').trim().toLowerCase();
    this.applyFilters();
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatusFilter = String(value ?? '').trim().toLowerCase();
    this.applyFilters();
  }

  protected onSearchKeywordChange(value: string): void {
    this.searchKeyword = String(value ?? '');
    this.applyFilters();
  }

  protected openCreateModal(): void {
    this.mode = 'create';
    this.selectedUser = null;
    this.isFormModalOpen = true;
  }

  protected openEditModal(user: UserRow): void {
    this.mode = 'edit';
    this.selectedUser = user;
    this.isFormModalOpen = true;
  }

  protected onFormModalClosed(): void {
    this.isFormModalOpen = false;
    this.selectedUser = null;
  }

  protected openDeleteModal(user: UserRow): void {
    this.selectedUser = user;
    this.isDeleteModalOpen = true;
  }

  protected closeDeleteModal(force = false): void {
    if (this.isDeleting && !force) {
      return;
    }

    this.isDeleteModalOpen = false;
    this.selectedUser = null;
  }

  // A GRANT check ("may act as admin"), which is NOT the question
  // isPlatformAdmin() below answers ("holds the admin role"). An OWNER passes
  // this one, because ROLE_GRANTS lists 'admin' among owner's grants.
  //
  // Left as-is on purpose (OBRS-847). The unlock endpoint it gates is
  // @PreAuthorize("hasRole('ADMIN')") and the backend hierarchy does not run
  // downward, so an OWNER is shown a button that answers 403 — a real defect,
  // but hiding the button and widening the endpoint are two different product
  // decisions, so it is carded (OBRS-869) rather than guessed at here.
  protected hasAdminRole(): boolean {
    return this.authService.hasAnyRole(['admin']);
  }

  // RAW held role, never hasAnyRole(['admin']) — see above. Same precedent as
  // AdminLayoutComponent.badgeStatus and ExpensesPageComponent.isAdmin.
  private isPlatformAdmin(): boolean {
    return this.authService.getRoles().includes('admin');
  }

  protected openUnlockModal(user: UserRow): void {
    this.selectedUser = user;
    this.isUnlockModalOpen = true;
  }

  protected closeUnlockModal(force = false): void {
    if (this.isUnlocking && !force) {
      return;
    }

    this.isUnlockModalOpen = false;
    if (!this.isDeleteModalOpen) {
      this.selectedUser = null;
    }
  }

  protected async confirmUnlock(): Promise<void> {
    if (!this.selectedUser) {
      return;
    }

    const id = this.selectedUser.id;
    this.isUnlocking = true;
    try {
      await firstValueFrom(this.adminApiService.unlockUser(id));
      this.store.mutate((data) => ({
        ...data,
        users: data.users.map((u) =>
          u.id === id ? { ...u, locked: false, accountLockedUntil: null } : u
        ),
      }));
      this.closeUnlockModal(true);
      const refreshPromise = this.store.refresh();
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UNLOCK_SUCCESS'));
      await refreshPromise;
    } catch {
      // Controlled i18n key (not extractApiErrorMessage) per AC7. The spec
      // defines a single failure key, so there is nothing to branch on.
      this.closeUnlockModal(true);
      this.alertService.error(this.translate.instant('ADMIN.MESSAGES.UNLOCK_FAILED'));
    } finally {
      this.isUnlocking = false;
    }
  }

  protected async confirmDelete(): Promise<void> {
    if (!this.selectedUser) {
      return;
    }

    this.isDeleting = true;
    try {
      await firstValueFrom(this.adminApiService.deleteUser(this.selectedUser.id));
      // Capture id before closeDeleteModal clears selectedUser.
      const id = this.selectedUser.id;
      // Optimistically remove the deleted row so the table updates synchronously,
      // without waiting for the background re-fetch to land (~2s on SIT).
      this.store.mutate((d) => ({ ...d, users: d.users.filter((u) => u.id !== id) }));
      this.closeDeleteModal(true);
      // Overlap the table revalidate with the success dialog (see the form
      // modal's submitUser).
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

    this.roleOptions = toRoleOptions(this.rawRoles, currentLocale);
    this.roleFilterOptions = toRoleFilterOptions(this.roleOptions, this.isPlatformAdmin());
    this.statusOptions = toStatusOptions(this.rawLookups, currentLocale);
    this.users = this.rawUsers.map((user) =>
      toUserRow(user, currentLocale, this.translate.currentLang, (key) =>
        this.translate.instant(key)
      )
    );
    this.syncFiltersWithAvailableOptions();
    this.applyFilters();
  }

  // NOTE: `||` short-circuit is deliberate — translate.getDefaultLang() must
  // only be called when currentLang is falsy (some TranslateService stubs
  // don't implement it). Kept un-extracted for the same reason
  // RoleManagementPageComponent / PromotionsPageComponent keep their
  // getCurrentLocale private rather than moving it to the mappers file.
  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }

  private syncFiltersWithAvailableOptions(): void {
    if (
      this.selectedRoleFilter &&
      // roleFilterOptions, not roleOptions: a selection that is no longer
      // offered must be cleared, and after OBRS-847 the two lists differ.
      !this.roleFilterOptions.some(
        (option) => option.slug.trim().toLowerCase() === this.selectedRoleFilter
      )
    ) {
      this.selectedRoleFilter = '';
    }

    if (
      this.selectedStatusFilter &&
      !this.statusOptions.some(
        (option) => option.code.trim().toLowerCase() === this.selectedStatusFilter
      )
    ) {
      this.selectedStatusFilter = '';
    }
  }

  private applyFilters(): void {
    this.filteredUsers = filterUsers(
      this.users,
      this.selectedRoleFilter,
      this.selectedStatusFilter,
      this.searchKeyword
    );
  }
}
