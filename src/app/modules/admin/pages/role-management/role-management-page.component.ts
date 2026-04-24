import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminRoleDto,
  AdminStatusDto,
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
export class RoleManagementPageComponent implements OnInit {
  protected roles: RoleRow[] = [];
  protected filteredRoles: RoleRow[] = [];
  protected statusOptions: StatusOption[] = [];

  protected lastUpdatedAt = '-';
  protected isLoading = false;
  protected errorMessage = '';
  protected selectedStatusFilter = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected selectedRole: RoleRow | null = null;

  protected readonly roleForm: FormGroup;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.roleForm = this.formBuilder.group({
      slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)]],
      label: ['', [Validators.required, Validators.maxLength(255)]],
      description: ['', [Validators.maxLength(500)]],
      status: ['', [Validators.required]],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadRolesAndStatusOptions();
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
      label: '',
      description: '',
      status: this.statusOptions[0]?.code ?? 'active',
    });
    this.roleForm.get('slug')?.enable();
    this.isFormModalOpen = true;
  }

  protected async openEditModal(role: RoleRow): Promise<void> {
    let roleDetail: AdminRoleDto | null = null;
    try {
      const response = await firstValueFrom(this.adminApiService.getRoleById(role.id));
      roleDetail = response?.data ?? null;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        try {
          const response = await firstValueFrom(this.adminApiService.getRoleBySlug(role.slug));
          roleDetail = response?.data ?? null;
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
    const label = String(safeRoleDetail.name ?? role.label).trim();
    const description = String(safeRoleDetail.description ?? role.description)
      .trim()
      .replace(/^-$/, '');
    const status = this.parseStatus(safeRoleDetail.status ?? role.statusCode);

    this.isEditMode = true;
    this.selectedRole = role;
    this.roleForm.reset({
      slug,
      label,
      description,
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
      const [rolesResponse, lookupsResponse] = await Promise.all([
        firstValueFrom(this.adminApiService.getRoles()),
        firstValueFrom(this.adminApiService.getLookups()),
      ]);

      const roles = rolesResponse?.data ?? [];
      const lookups = lookupsResponse?.data ?? [];

      this.statusOptions = lookups
        .filter((lookup) => lookup.category === 'role_status')
        .map((lookup) => ({
          code: lookup.slug,
          label:
            lookup.translations.find((translation) => translation.locale?.toLowerCase() === 'en')?.label ??
            lookup.translations.find((translation) => translation.label)?.label ??
            lookup.slug,
        }));

      this.roles = roles.map((role) => this.toRoleRow(role));
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

  private toRolePayload(): CreateRolePayload {
    const slug = String(this.roleForm.getRawValue()['slug'] ?? '')
      .trim()
      .toLowerCase();
    const label = String(this.roleForm.value['label'] ?? '').trim();
    const description = String(this.roleForm.value['description'] ?? '').trim();
    const status = String(this.roleForm.value['status'] ?? '').trim().toLowerCase();
    const locale = this.getFormLocale();

    const translations: AdminTranslationReqDto[] = [
      {
        locale,
        label,
        description: description || undefined,
      },
    ];

    return {
      slug,
      status,
      translations,
    };
  }

  private toRoleRow(role: AdminRoleDto): RoleRow {
    const status = this.parseStatus(role.status);

    return {
      id: Number(role.id ?? 0),
      slug: role.slug,
      label: role.name ?? role.slug,
      description: role.description ?? '-',
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

  private getFormLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'en'
    ).toLowerCase();

    const matchedLocale = rawLocale.match(/^[a-z]{2}/);
    return matchedLocale?.[0] ?? 'en';
  }

  private isNotFoundError(error: unknown): boolean {
    const status = (error as { status?: number } | null | undefined)?.status;
    return status === 404;
  }

  private toRoleDetailFallback(role: RoleRow): AdminRoleDto {
    return {
      id: role.id,
      slug: role.slug,
      name: role.label,
      description: role.description === '-' ? '' : role.description,
      status: role.statusCode,
    };
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
