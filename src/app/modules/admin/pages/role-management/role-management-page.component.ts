import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminRoleDto,
  AdminStatusDto,
  AdminTranslationDto,
  AdminTranslationReqDto,
  CreateRolePayload,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';

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
  protected isLoading = false;
  protected isLanguageChanging = false;
  protected errorMessage = '';
  protected selectedStatusFilter = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected selectedRole: RoleRow | null = null;

  protected readonly roleForm: FormGroup;
  private readonly languageSubscription: Subscription;
  private readonly languageLoadingMinimumMs = 1000;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.roleForm = this.formBuilder.group({
      slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)]],
      enLabel: ['', [Validators.required, Validators.maxLength(255)]],
      enDescription: ['', [Validators.maxLength(500)]],
      thLabel: ['', [Validators.required, Validators.maxLength(255)]],
      thDescription: ['', [Validators.maxLength(500)]],
      status: ['', [Validators.required]],
    });

    this.languageSubscription = this.translate.onLangChange.subscribe(() => {
      void this.reloadForLanguageChange();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadRolesAndStatusOptions();
  }

  ngOnDestroy(): void {
    this.languageSubscription.unsubscribe();
  }

  get activeRoles(): number {
    return this.roles.filter((role) => role.statusCode === 'active').length;
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatusFilter = String(value ?? '').trim().toLowerCase();
    this.applyRoleFilter();
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
    let roleDetail: AdminRoleDto | null = null;
    try {
      const response = await firstValueFrom(this.adminApiService.getRoleById(role.id));
      roleDetail = this.extractResponseData<AdminRoleDto>(response) ?? null;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        try {
          const response = await firstValueFrom(this.adminApiService.getRoleBySlug(role.slug));
          roleDetail = this.extractResponseData<AdminRoleDto>(response) ?? null;
        } catch {
          roleDetail = null;
        }
      } else {
        await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.LOAD_ROLES_FAILED'));
        return;
      }
    }

    const safeRoleDetail = roleDetail ?? this.toRoleDetailFallback(role);

    const slug = String(safeRoleDetail.slug ?? role.slug).trim();
    const enLabel =
      this.getTranslationLabel(safeRoleDetail.translations, 'en') ??
      safeRoleDetail.name ??
      role.enLabel;
    const thLabel = this.getTranslationLabel(safeRoleDetail.translations, 'th') ?? role.thLabel;
    const enDescription =
      this.getTranslationDescription(safeRoleDetail.translations, 'en') ??
      safeRoleDetail.description ??
      role.enDescription;
    const thDescription =
      this.getTranslationDescription(safeRoleDetail.translations, 'th') ?? role.thDescription;
    const status = this.parseStatus(safeRoleDetail.status ?? role.statusCode);

    this.isEditMode = true;
    this.selectedRole = role;
    this.roleForm.reset({
      slug,
      enLabel: String(enLabel ?? '').trim().replace(/^-$/, ''),
      enDescription: String(enDescription ?? '').trim().replace(/^-$/, ''),
      thLabel: String(thLabel ?? '').trim().replace(/^-$/, ''),
      thDescription: String(thDescription ?? '').trim().replace(/^-$/, ''),
      status: status.code,
    });
    this.roleForm.get('slug')?.disable();
    this.isFormModalOpen = true;
  }

  protected closeFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isFormModalOpen = false;
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
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = this.toRolePayload();

      if (this.isEditMode && this.selectedRole) {
        await this.updateRole(this.selectedRole, payload);
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createRole(payload));
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      await this.loadRolesAndStatusOptions();
    } catch {
      this.closeFormModal(true);
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED'));
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
      this.closeDeleteModal(true);
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      await this.loadRolesAndStatusOptions();
    } catch {
      this.closeDeleteModal(true);
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED'));
    } finally {
      this.isDeleting = false;
    }
  }

  private async loadRolesAndStatusOptions(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [rolesResult, lookupsResult] = await Promise.allSettled([
        firstValueFrom(this.adminApiService.getRoles()),
        firstValueFrom(this.adminApiService.getLookups()),
      ]);

      if (rolesResult.status === 'rejected') {
        throw rolesResult.reason;
      }

      const roles = this.extractResponseArray<AdminRoleDto>(rolesResult.value);
      const lookups =
        lookupsResult.status === 'fulfilled'
          ? this.extractResponseArray<AdminLookupDto>(lookupsResult.value)
          : [];

      this.statusOptions = this.toStatusOptions(lookups, roles);

      this.roles = this.sortRolesByLatestUpdated(roles).map((role) => this.toRoleRow(role));
      this.syncStatusFilterWithAvailableOptions();
      this.applyRoleFilter();
      this.lastUpdatedAt = this.toLatestTimestamp(roles);
    } catch {
      this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_ROLES_FAILED');
      this.filteredRoles = [];
    } finally {
      this.isLoading = false;
    }
  }

  private async reloadForLanguageChange(): Promise<void> {
    this.isLanguageChanging = true;

    try {
      await Promise.all([
        this.loadRolesAndStatusOptions(),
        this.waitForLanguageLoadingMinimum(),
      ]);
    } finally {
      this.isLanguageChanging = false;
    }
  }

  private waitForLanguageLoadingMinimum(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, this.languageLoadingMinimumMs);
    });
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
          lookup.translations?.find((translation) => translation.label)?.label ??
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
    if (typeof value === 'string') {
      const code = value.toLowerCase();
      return {
        code,
        name: value.replace(/_/g, ' ').toUpperCase(),
      };
    }

    const code = String(value?.code ?? 'unknown').toLowerCase();
    const fallbackName = code.replace(/_/g, ' ').toUpperCase();

    return {
      code,
      name: String(value?.name ?? value?.label ?? fallbackName),
    };
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

  private isNotFoundError(error: unknown): boolean {
    const status = (error as { status?: number } | null | undefined)?.status;
    return status === 404;
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
    translations: AdminTranslationDto[] | null | undefined,
    locale?: string
  ): string | null {
    if (!translations || translations.length === 0) {
      return null;
    }

    if (locale) {
      const translation = translations.find(
        (item) => item.locale?.toLowerCase() === locale.toLowerCase()
      );

      if (translation?.label) {
        return translation.label;
      }
    }

    return translations.find((item) => item.label)?.label ?? null;
  }

  private getTranslationDescription(
    translations: AdminTranslationDto[] | null | undefined,
    locale?: string
  ): string | null {
    if (!translations || translations.length === 0) {
      return null;
    }

    if (locale) {
      const translation = translations.find(
        (item) => item.locale?.toLowerCase() === locale.toLowerCase()
      );

      if (translation?.description) {
        return translation.description;
      }
    }

    return translations.find((item) => item.description)?.description ?? null;
  }

  private async updateRole(role: RoleRow, payload: CreateRolePayload): Promise<void> {
    try {
      await firstValueFrom(this.adminApiService.updateRoleById(role.id, payload));
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }

      await firstValueFrom(this.adminApiService.updateRoleBySlug(role.slug, payload));
    }
  }

  private async deleteRole(role: RoleRow): Promise<void> {
    try {
      await firstValueFrom(this.adminApiService.deleteRoleById(role.id));
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }

      await firstValueFrom(this.adminApiService.deleteRoleBySlug(role.slug));
    }
  }
}
