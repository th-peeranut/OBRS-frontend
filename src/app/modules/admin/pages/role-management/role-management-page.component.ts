import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRoleDto,
  AdminStatusDto,
  AdminTranslationCollection,
  AdminTranslationReqDto,
  CreateRolePayload,
  getAdminTranslationDescription,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import { RolesStore } from './roles.store';

interface RoleRow {
  id: number;
  slug: string;
  label: string;
  description: string;
  enLabel: string;
  enDescription: string;
  thLabel: string;
  thDescription: string;
  status: string;
  statusCode: string;
  updatedAt: string;
}

interface StatusOption {
  code: string;
  label: string;
}

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
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected isEditDetailLoading = false;
  protected selectedRole: RoleRow | null = null;

  protected readonly roleForm: FormGroup;
  // Placeholder rows rendered while the (occasionally cold-starting) backend
  // responds, so the table shows its shape instead of a blank body.
  protected readonly skeletonRows = Array.from({ length: 5 });
  private readonly subscriptions = new Subscription();

  private rawRoles: AdminRoleDto[] = [];
  private rawLookups: AdminLookupDto[] = [];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: RolesStore
  ) {
    this.roleForm = this.formBuilder.group({
      slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9_-]+$/)]],
      enLabel: ['', [Validators.required, Validators.maxLength(255)]],
      enDescription: ['', [Validators.maxLength(500)]],
      thLabel: ['', [Validators.required, Validators.maxLength(255)]],
      thDescription: ['', [Validators.maxLength(500)]],
      status: ['', [Validators.required]],
    });

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
      this.store.data$.subscribe((data) => {
        if (data) {
          this.rawRoles = data.roles;
          this.rawLookups = data.lookups;
          this.applyLocalization();
        }
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

  protected trackById(_index: number, item: RoleRow): number {
    return item.id;
  }

  protected statusClass(status: string): string {
    const normalizedStatus = status.toUpperCase();

    if (normalizedStatus === 'ACTIVE') {
      return 'is-success';
    }

    if (normalizedStatus.includes('PENDING')) {
      return 'is-warning';
    }

    return 'is-danger';
  }

  protected openCreateModal(): void {
    this.isEditMode = false;
    this.selectedRole = null;
    this.roleForm.reset({
      slug: '',
      enLabel: '',
      enDescription: '',
      thLabel: '',
      thDescription: '',
      status: this.statusOptions[0]?.code ?? 'active',
    });
    this.roleForm.get('slug')?.enable();
    this.isFormModalOpen = true;
  }

  protected async openEditModal(role: RoleRow): Promise<void> {
    // Open the modal immediately with the row data we already hold, so it
    // appears without waiting on the (consistently ~2s+ on SIT) detail fetch.
    // The server detail (full translations/description) is patched in once it
    // arrives — see the fetch below.
    this.isEditMode = true;
    this.selectedRole = role;
    this.isEditDetailLoading = true;
    this.applyRoleFormValues(this.toRoleDetailFallback(role), role);
    this.roleForm.get('slug')?.disable();
    this.isFormModalOpen = true;

    try {
      const response = await firstValueFrom(this.adminApiService.getRoleById(role.id));
      const roleDetail = this.extractResponseData<AdminRoleDto>(response);
      // Ignore a stale response if the user closed the modal or switched roles.
      if (roleDetail && this.isFormModalOpen && this.selectedRole?.id === role.id) {
        this.applyRoleFormValues(roleDetail, role, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      if (this.isFormModalOpen && this.selectedRole?.id === role.id) {
        this.isEditDetailLoading = false;
      }
    }
  }

  // Populate the role form from a DTO. When `onlyPristine` is set (the late
  // detail patch), only controls the user hasn't started editing are filled,
  // so the arriving server data never clobbers in-progress input.
  private applyRoleFormValues(
    roleDetail: AdminRoleDto,
    role: RoleRow,
    onlyPristine = false
  ): void {
    const enLabel =
      this.getTranslationLabel(roleDetail.translations, 'en') ??
      roleDetail.name ??
      role.enLabel;
    const thLabel = this.getTranslationLabel(roleDetail.translations, 'th') ?? role.thLabel;
    const enDescription =
      this.getTranslationDescription(roleDetail.translations, 'en') ??
      roleDetail.description ??
      role.enDescription;
    const thDescription =
      this.getTranslationDescription(roleDetail.translations, 'th') ?? role.thDescription;
    const status = this.parseStatus(roleDetail.status ?? role.statusCode);

    const values = {
      slug: String(roleDetail.slug ?? role.slug).trim(),
      enLabel: String(enLabel ?? '').trim().replace(/^-$/, ''),
      enDescription: String(enDescription ?? '').trim().replace(/^-$/, ''),
      thLabel: String(thLabel ?? '').trim().replace(/^-$/, ''),
      thDescription: String(thDescription ?? '').trim().replace(/^-$/, ''),
      status: status.code,
    };

    if (!onlyPristine) {
      this.roleForm.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.roleForm.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }
  }

  protected closeFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isFormModalOpen = false;
    this.isEditDetailLoading = false;
    this.selectedRole = null;
    this.roleForm.reset();
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

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.roleForm.get(fieldName);
    return !!field && field.invalid && (field.touched || field.dirty);
  }

  protected async submitRole(): Promise<void> {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      // Without this the click looks like a no-op when a field is invalid
      // (e.g. a slug the pattern rejects) — surface why nothing was saved.
      await this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = this.toRolePayload();

      // Start revalidating the table the moment the write succeeds, so it runs
      // concurrently with the success dialog (a SweetAlert the user dismisses by
      // hand) instead of only starting after — on SIT each request is ~2s, so
      // serialising refresh behind the popup is what made "add role" feel ~8s.
      // store.refresh() never rejects (errors surface via error$), so holding
      // the promise and awaiting it after the alert is safe.
      let refresh: Promise<void>;
      if (this.isEditMode && this.selectedRole) {
        await this.updateRole(this.selectedRole, payload);
        this.closeFormModal(true);
        refresh = this.store.refresh();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createRole(payload));
        this.closeFormModal(true);
        refresh = this.store.refresh();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      await refresh;
    } catch (error) {
      this.closeFormModal(true);
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
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
      // Overlap the table revalidate with the success dialog (see submitRole).
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
    this.statusOptions = this.toStatusOptions(this.rawLookups, this.rawRoles);
    this.roles = this.sortRolesByLatestUpdated(this.rawRoles).map((role) => this.toRoleRow(role));
    this.syncStatusFilterWithAvailableOptions();
    this.applyRoleFilter();
    this.lastUpdatedAt = this.toLatestTimestamp(this.rawRoles);
  }

  private toRolePayload(): CreateRolePayload {
    const slug = String(this.roleForm.getRawValue()['slug'] ?? '')
      .trim()
      .toLowerCase();
    const enLabel = String(this.roleForm.value['enLabel'] ?? '').trim();
    const enDescription = String(this.roleForm.value['enDescription'] ?? '').trim();
    const thLabel = String(this.roleForm.value['thLabel'] ?? '').trim();
    const thDescription = String(this.roleForm.value['thDescription'] ?? '').trim();
    const status = String(this.roleForm.value['status'] ?? '').trim().toLowerCase();

    const translations: AdminTranslationReqDto[] = [
      {
        locale: 'en',
        label: enLabel,
        description: enDescription || undefined,
      },
    ];

    translations.push({
      locale: 'th',
      label: thLabel,
      description: thDescription || undefined,
    });

    return {
      slug,
      status,
      translations,
    };
  }

  private extractResponseData<T>(response: unknown): T | null {
    if (response === null || response === undefined) {
      return null;
    }

    if (typeof response === 'object' && 'data' in response) {
      return ((response as { data?: T }).data ?? null);
    }

    return response as T;
  }

  private extractResponseArray<T>(response: unknown): T[] {
    const data = this.extractResponseData<unknown>(response);
    return Array.isArray(data) ? data as T[] : [];
  }

  private toStatusOptions(lookups: AdminLookupDto[], roles: AdminRoleDto[]): StatusOption[] {
    const lookupOptions = lookups
      .filter((lookup) => lookup.category === 'role_status')
      .map((lookup) => ({
        code: String(lookup.slug ?? '').trim().toLowerCase(),
        label:
          this.getTranslationLabel(lookup.translations, this.getCurrentLocale()) ??
          this.getTranslationLabel(lookup.translations, 'en') ??
          lookup.slug,
      }))
      .filter((option) => option.code.length > 0);

    if (lookupOptions.length > 0) {
      return lookupOptions;
    }

    const statusByCode = new Map<string, string>();
    roles.forEach((role) => {
      const status = this.parseStatus(role.status);
      if (status.code && status.code !== 'unknown') {
        statusByCode.set(status.code, status.name);
      }
    });

    return [...statusByCode.entries()].map(([code, label]) => ({ code, label }));
  }

  private toRoleRow(role: AdminRoleDto): RoleRow {
    const status = this.parseStatus(role.status);
    const currentLocale = this.getCurrentLocale();
    const enLabel = this.getTranslationLabel(role.translations, 'en') ?? role.name ?? role.slug;
    const enDescription =
      this.getTranslationDescription(role.translations, 'en') ??
      role.description ??
      '-';
    const thLabel = this.getTranslationLabel(role.translations, 'th') ?? '-';
    const thDescription = this.getTranslationDescription(role.translations, 'th') ?? '-';
    const localizedLabel =
      role.name ??
      this.getTranslationLabel(role.translations, currentLocale) ??
      enLabel;
    const localizedDescription =
      role.description ??
      this.getTranslationDescription(role.translations, currentLocale) ??
      enDescription;

    return {
      id: Number(role.id ?? 0),
      slug: role.slug,
      label: localizedLabel,
      description: localizedDescription,
      enLabel,
      enDescription,
      thLabel,
      thDescription,
      status: status.name,
      statusCode: status.code,
      updatedAt: this.formatDateTime(role.updatedAt ?? role.createdAt),
    };
  }

  private parseStatus(value: string | AdminStatusDto | null | undefined): {
    code: string;
    name: string;
  } {
    return parseAdminStatus(value, this.getCurrentLocale());
  }

  private toLatestTimestamp(roles: AdminRoleDto[]): string {
    const values = roles
      .map((role) => role.updatedAt ?? role.createdAt)
      .filter((item): item is string => !!item)
      .map((item) => new Date(item).getTime())
      .filter((item) => Number.isFinite(item));

    if (values.length === 0) {
      return '-';
    }

    return this.formatDateTime(new Date(Math.max(...values)).toISOString());
  }

  private sortRolesByLatestUpdated(roles: AdminRoleDto[]): AdminRoleDto[] {
    return [...roles].sort(
      (first, second) =>
        this.toTimestamp(second.updatedAt ?? second.createdAt) -
        this.toTimestamp(first.updatedAt ?? first.createdAt)
    );
  }

  private toTimestamp(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return value;
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  private applyRoleFilter(): void {
    const statusFilter = this.selectedStatusFilter;

    this.filteredRoles = this.roles.filter((role) => {
      if (statusFilter.length === 0) {
        return true;
      }

      return role.statusCode.trim().toLowerCase() === statusFilter;
    });
  }

  private syncStatusFilterWithAvailableOptions(): void {
    if (
      this.selectedStatusFilter &&
      !this.statusOptions.some(
        (option) => option.code.trim().toLowerCase() === this.selectedStatusFilter
      )
    ) {
      this.selectedStatusFilter = '';
    }
  }

  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }

  private toRoleDetailFallback(role: RoleRow): AdminRoleDto {
    return {
      id: role.id,
      slug: role.slug,
      name: role.label,
      description: role.description === '-' ? '' : role.description,
      status: role.statusCode,
      translations: [
        {
          locale: 'en',
          label: role.enLabel,
          description: role.enDescription === '-' ? undefined : role.enDescription,
        },
        {
          locale: 'th',
          label: role.thLabel === '-' ? undefined : role.thLabel,
          description: role.thDescription === '-' ? undefined : role.thDescription,
        },
      ],
    };
  }

  private getTranslationLabel(
    translations: AdminTranslationCollection | null | undefined,
    locale?: string
  ): string | null {
    return getAdminTranslationLabel(translations, locale);
  }

  private getTranslationDescription(
    translations: AdminTranslationCollection | null | undefined,
    locale?: string
  ): string | null {
    return getAdminTranslationDescription(translations, locale);
  }

  private async updateRole(role: RoleRow, payload: CreateRolePayload): Promise<void> {
    await firstValueFrom(this.adminApiService.updateRoleById(role.id, payload));
  }

  private async deleteRole(role: RoleRow): Promise<void> {
    await firstValueFrom(this.adminApiService.deleteRoleById(role.id));
  }
}
