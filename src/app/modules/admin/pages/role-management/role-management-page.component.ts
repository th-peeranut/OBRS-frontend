import { Component, HostListener, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminRoleDto,
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
  updatedAt: string;
}

interface RoleFilterOption {
  value: 'all';
  labelKey: string;
}

@Component({
  selector: 'app-role-management-page',
  templateUrl: './role-management-page.component.html',
  styleUrl: './role-management-page.component.scss',
})
export class RoleManagementPageComponent implements OnInit {
  protected roles: RoleRow[] = [];
  protected filteredRoles: RoleRow[] = [];

  protected lastUpdatedAt = '-';
  protected isLoading = false;
  protected errorMessage = '';
  protected selectedRoleFilter: RoleFilterOption['value'] = 'all';
  protected isRoleFilterDropdownOpen = false;
  protected readonly roleFilterOptions: RoleFilterOption[] = [
    { value: 'all', labelKey: 'ADMIN.ROLES.FILTER_ALL' },
  ];

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
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadRoles();
  }

  get activeRoles(): number {
    return this.roles.length;
  }

  get selectedRoleFilterLabelKey(): string {
    return (
      this.roleFilterOptions.find((option) => option.value === this.selectedRoleFilter)?.labelKey ??
      'ADMIN.ROLES.FILTER_ALL'
    );
  }

  protected toggleRoleFilterDropdown(event: Event): void {
    event.stopPropagation();
    this.isRoleFilterDropdownOpen = !this.isRoleFilterDropdownOpen;
  }

  protected selectRoleFilter(value: RoleFilterOption['value']): void {
    this.selectedRoleFilter = value;
    this.isRoleFilterDropdownOpen = false;
    this.applyRoleFilter();
  }

  @HostListener('document:click')
  protected closeRoleFilterDropdownOnOutsideClick(): void {
    if (this.isRoleFilterDropdownOpen) {
      this.isRoleFilterDropdownOpen = false;
    }
  }

  protected openCreateModal(): void {
    this.isEditMode = false;
    this.selectedRole = null;
    this.roleForm.reset({
      slug: '',
      label: '',
      description: '',
    });
    this.roleForm.get('slug')?.enable();
    this.isFormModalOpen = true;
  }

  protected async openEditModal(role: RoleRow): Promise<void> {
    let roleDetail: AdminRoleDto | null = null;
    try {
      const response =
        role.id > 0
          ? await firstValueFrom(this.adminApiService.getRoleById(role.id))
          : await firstValueFrom(this.adminApiService.getRoleBySlug(role.slug));
      roleDetail = response?.data ?? null;
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.LOAD_ROLES_FAILED'));
      return;
    }

    const slug = String(roleDetail?.slug ?? role.slug).trim();
    const label = String(roleDetail?.name ?? role.label).trim();
    const description = String(roleDetail?.description ?? role.description)
      .trim()
      .replace(/^-$/, '');

    this.isEditMode = true;
    this.selectedRole = {
      ...role,
      slug,
    };
    this.roleForm.reset({
      slug,
      label,
      description,
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
        await firstValueFrom(
          this.adminApiService.updateRole(this.selectedRole.slug, payload)
        );
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createRole(payload));
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      await this.loadRoles();
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
      await firstValueFrom(this.adminApiService.deleteRole(this.selectedRole.slug));
      this.closeDeleteModal(true);
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      await this.loadRoles();
    } catch {
      this.closeDeleteModal(true);
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED'));
    } finally {
      this.isDeleting = false;
    }
  }

  private async loadRoles(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const response = await firstValueFrom(this.adminApiService.getRoles());
      const roles = response?.data ?? [];

      this.roles = roles.map((role) => this.toRoleRow(role));
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
      translations,
    };
  }

  private toRoleRow(role: AdminRoleDto): RoleRow {
    return {
      id: Number(role.id ?? 0),
      slug: role.slug,
      label: role.name ?? role.slug,
      description: role.description ?? '-',
      updatedAt: this.formatDateTime(role.updatedAt ?? role.createdAt),
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
    this.filteredRoles = [...this.roles];
  }

  private getFormLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'en'
    ).toLowerCase();

    const matchedLocale = rawLocale.match(/^[a-z]{2}/);
    return matchedLocale?.[0] ?? 'en';
  }
}
