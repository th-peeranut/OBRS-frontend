import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminRoleDto,
  AdminTranslationDto,
  AdminTranslationReqDto,
  CreateRolePayload,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';

interface RoleRow {
  slug: string;
  enLabel: string;
  enDescription: string;
  thLabel: string;
  thDescription: string;
  updatedAt: string;
}

@Component({
  selector: 'app-role-management-page',
  templateUrl: './role-management-page.component.html',
  styleUrl: './role-management-page.component.scss',
})
export class RoleManagementPageComponent implements OnInit {
  protected roles: RoleRow[] = [];

  protected lastUpdatedAt = '-';
  protected isLoading = false;
  protected errorMessage = '';

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
      enLabel: ['', [Validators.required, Validators.maxLength(255)]],
      enDescription: ['', [Validators.maxLength(500)]],
      thLabel: ['', [Validators.maxLength(255)]],
      thDescription: ['', [Validators.maxLength(500)]],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadRoles();
  }

  get activeRoles(): number {
    return this.roles.length;
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
    });
    this.roleForm.get('slug')?.enable();
    this.isFormModalOpen = true;
  }

  protected openEditModal(role: RoleRow): void {
    this.isEditMode = true;
    this.selectedRole = role;
    this.roleForm.reset({
      slug: role.slug,
      enLabel: role.enLabel,
      enDescription: role.enDescription === '-' ? '' : role.enDescription,
      thLabel: role.thLabel === '-' ? '' : role.thLabel,
      thDescription: role.thDescription === '-' ? '' : role.thDescription,
    });
    this.roleForm.get('slug')?.disable();
    this.isFormModalOpen = true;
  }

  protected closeFormModal(): void {
    if (this.isSubmitting) {
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

  protected closeDeleteModal(): void {
    if (this.isDeleting) {
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
        this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createRole(payload));
        this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      this.closeFormModal();
      await this.loadRoles();
    } catch {
      this.alertService.error(this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED'));
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
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      this.closeDeleteModal();
      await this.loadRoles();
    } catch {
      this.alertService.error(this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED'));
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
      this.lastUpdatedAt = this.toLatestTimestamp(roles);
    } catch {
      this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_ROLES_FAILED');
    } finally {
      this.isLoading = false;
    }
  }

  private toRolePayload(): CreateRolePayload {
    const slug = String(this.roleForm.getRawValue()['slug'] ?? '')
      .trim()
      .toLowerCase();
    const enLabel = String(this.roleForm.value['enLabel'] ?? '').trim();
    const enDescription = String(this.roleForm.value['enDescription'] ?? '').trim();
    const thLabel = String(this.roleForm.value['thLabel'] ?? '').trim();
    const thDescription = String(this.roleForm.value['thDescription'] ?? '').trim();

    const translations: AdminTranslationReqDto[] = [
      {
        locale: 'en',
        label: enLabel,
        description: enDescription || undefined,
      },
    ];

    if (thLabel) {
      translations.push({
        locale: 'th',
        label: thLabel,
        description: thDescription || undefined,
      });
    }

    return {
      slug,
      translations,
    };
  }

  private toRoleRow(role: AdminRoleDto): RoleRow {
    const localizedName =
      role.name ??
      this.getTranslationLabel(role.translations, 'en') ??
      role.slug;
    const localizedDescription =
      role.description ??
      this.getTranslationDescription(role.translations, 'en') ??
      '-';

    return {
      slug: role.slug,
      enLabel: localizedName,
      enDescription: localizedDescription,
      thLabel: this.getTranslationLabel(role.translations, 'th') ?? '-',
      thDescription: this.getTranslationDescription(role.translations, 'th') ?? '-',
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

    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
      .format(date)
      .replace(',', ' -');
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
}
