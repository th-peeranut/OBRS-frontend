import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminRoleDto,
  AdminStatusDto,
  AdminTranslationDto,
  AdminUserDto,
  CreateUserPayload,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';

interface UserRow {
  id: number;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  roleSlugs: string[];
  roles: string[];
  status: string;
  statusCode: string;
  lastActive: string;
}

interface RoleOption {
  slug: string;
  label: string;
}

interface StatusOption {
  code: string;
  label: string;
}

@Component({
  selector: 'app-user-management-page',
  templateUrl: './user-management-page.component.html',
  styleUrl: './user-management-page.component.scss',
})
export class UserManagementPageComponent implements OnInit {
  protected users: UserRow[] = [];
  protected filteredUsers: UserRow[] = [];

  protected roleOptions: RoleOption[] = [];
  protected statusOptions: StatusOption[] = [];
  protected selectedRoleFilter = '';
  protected selectedStatusFilter = '';
  protected searchKeyword = '';

  protected isLoading = false;
  protected errorMessage = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected selectedUser: UserRow | null = null;

  protected readonly userForm: FormGroup;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.userForm = this.formBuilder.group({
      title: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      firstName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      middleName: ['', [Validators.minLength(2), Validators.maxLength(50)]],
      lastName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', [Validators.required, Validators.pattern(/^\d{10,15}$/)]],
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(50),
          Validators.pattern(/^[a-zA-Z0-9._-]+$/),
        ],
      ],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(255)]],
      preferredLocale: [
        'th',
        [Validators.required, Validators.pattern(/^[a-z]{2}(-[A-Z]{2})?$/)],
      ],
      status: ['', [Validators.required]],
      roles: [[], [this.roleRequiredValidator]],
      isPhoneNumberVerify: [true, [Validators.required]],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadUsersAndOptions();
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
    this.isEditMode = false;
    this.selectedUser = null;
    this.userForm.reset({
      title: '',
      firstName: '',
      middleName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      username: '',
      password: '',
      preferredLocale: 'th',
      status: this.statusOptions[0]?.code ?? 'active',
      roles: [],
      isPhoneNumberVerify: true,
    });
    this.userForm.get('username')?.enable();
    this.isFormModalOpen = true;
  }

  protected async openEditModal(user: UserRow): Promise<void> {
    let userDetail: AdminUserDto | null = null;
    try {
      const response = await firstValueFrom(this.adminApiService.getUserById(user.id));
      userDetail = response?.data ?? null;
    } catch {
      this.alertService.error(this.translate.instant('ADMIN.MESSAGES.LOAD_USERS_FAILED'));
      return;
    }

    this.isEditMode = true;
    this.selectedUser = user;

    const fullName = userDetail?.fullName ?? user.fullName;
    const nameParts = fullName.split(' ').filter((part) => part.length > 0);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    const roles = this.extractRoleSlugs(userDetail?.roles);
    const status = this.parseStatus(userDetail?.status ?? user.statusCode);

    this.userForm.reset({
      title: 'Mr',
      firstName,
      middleName: '',
      lastName,
      email: userDetail?.email ?? user.email,
      phoneNumber: String(userDetail?.phoneNumber ?? user.phone).replace(/\D/g, ''),
      username: userDetail?.username ?? user.username,
      password: '',
      preferredLocale: userDetail?.preferredLocale ?? 'th',
      status: status.code,
      roles: roles.length > 0 ? roles : [...user.roleSlugs],
      isPhoneNumberVerify: true,
    });

    this.userForm.get('username')?.disable();
    this.isFormModalOpen = true;
  }

  protected closeFormModal(): void {
    if (this.isSubmitting) {
      return;
    }

    this.isFormModalOpen = false;
    this.selectedUser = null;
    this.userForm.reset();
  }

  protected openDeleteModal(user: UserRow): void {
    this.selectedUser = user;
    this.isDeleteModalOpen = true;
  }

  protected closeDeleteModal(): void {
    if (this.isDeleting) {
      return;
    }

    this.isDeleteModalOpen = false;
    this.selectedUser = null;
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.userForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected isRoleChecked(slug: string): boolean {
    const selectedRoles: string[] = this.userForm.value['roles'] ?? [];
    return selectedRoles.includes(slug);
  }

  protected toggleRoleSelection(roleSlug: string, checked: boolean): void {
    const currentRoles = [...(this.userForm.value['roles'] ?? [])];

    if (checked && !currentRoles.includes(roleSlug)) {
      currentRoles.push(roleSlug);
    }

    if (!checked) {
      const index = currentRoles.indexOf(roleSlug);
      if (index > -1) {
        currentRoles.splice(index, 1);
      }
    }

    this.userForm.patchValue({ roles: currentRoles });
    this.userForm.get('roles')?.markAsTouched();
  }

  protected async submitUser(): Promise<void> {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    try {
      const payload = this.toUserPayload();

      if (this.isEditMode && this.selectedUser) {
        await firstValueFrom(this.adminApiService.updateUser(this.selectedUser.id, payload));
        this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createUser(payload));
        this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      this.closeFormModal();
      await this.loadUsersAndOptions();
    } catch {
      this.alertService.error(this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED'));
    } finally {
      this.isSubmitting = false;
    }
  }

  protected async confirmDelete(): Promise<void> {
    if (!this.selectedUser) {
      return;
    }

    this.isDeleting = true;
    try {
      await firstValueFrom(this.adminApiService.deleteUser(this.selectedUser.id));
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      this.closeDeleteModal();
      await this.loadUsersAndOptions();
    } catch {
      this.alertService.error(this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED'));
    } finally {
      this.isDeleting = false;
    }
  }

  private async loadUsersAndOptions(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const [usersResponse, rolesResponse, lookupsResponse] = await Promise.all([
        firstValueFrom(this.adminApiService.getUsers()),
        firstValueFrom(this.adminApiService.getRoles()),
        firstValueFrom(this.adminApiService.getLookups()),
      ]);

      const users = usersResponse?.data ?? [];
      const roles = rolesResponse?.data ?? [];
      const lookups = lookupsResponse?.data ?? [];

      this.roleOptions = roles.map((role) => ({
        slug: role.slug,
        label: role.name ?? this.getTranslationLabel(role.translations, 'en') ?? role.slug,
      }));

      this.statusOptions = lookups
        .filter((lookup) => lookup.category === 'user_status')
        .map((lookup) => ({
          code: lookup.slug,
          label: this.getTranslationLabel(lookup.translations, 'en') ?? lookup.slug,
        }));

      this.users = users.map((user) => this.toUserRow(user));
      this.syncFiltersWithAvailableOptions();
      this.applyFilters();
    } catch {
      this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_USERS_FAILED');
      this.filteredUsers = [];
    } finally {
      this.isLoading = false;
    }
  }

  private toUserPayload(): CreateUserPayload {
    const raw = this.userForm.getRawValue();

    return {
      title: String(raw.title ?? '').trim(),
      firstName: String(raw.firstName ?? '').trim(),
      middleName: String(raw.middleName ?? '').trim() || undefined,
      lastName: String(raw.lastName ?? '').trim(),
      email: String(raw.email ?? '').trim(),
      phoneNumber: String(raw.phoneNumber ?? '').trim(),
      username: String(raw.username ?? '').trim(),
      password: String(raw.password ?? '').trim(),
      isPhoneNumberVerify: Boolean(raw.isPhoneNumberVerify),
      preferredLocale: String(raw.preferredLocale ?? 'th').trim(),
      status: String(raw.status ?? '').trim().toLowerCase(),
      roles: [...(raw.roles ?? [])],
    };
  }

  private toUserRow(user: AdminUserDto): UserRow {
    const roleSlugs = this.extractRoleSlugs(user.roles);
    const roleLabels = this.extractRoleLabels(user.roles);
    const status = this.parseStatus(user.status);

    return {
      id: user.id,
      fullName: user.fullName ?? '-',
      username: user.username ?? '-',
      email: user.email ?? '-',
      phone: user.phoneNumber ?? '-',
      roleSlugs,
      roles: roleLabels.length > 0 ? roleLabels : ['-'],
      status: status.name,
      statusCode: status.code,
      lastActive: this.formatDateTime(user.updatedAt ?? user.createdAt),
    };
  }

  private extractRoleSlugs(roles: Array<string | AdminRoleDto> | null | undefined): string[] {
    if (!roles || roles.length === 0) {
      return [];
    }

    return roles
      .map((role) => {
        if (typeof role === 'string') {
          return role;
        }

        return role.slug ?? '';
      })
      .map((slug) => slug.trim())
      .filter((slug) => slug.length > 0);
  }

  private extractRoleLabels(roles: Array<string | AdminRoleDto> | null | undefined): string[] {
    if (!roles || roles.length === 0) {
      return [];
    }

    return roles
      .map((role) => {
        if (typeof role === 'string') {
          return role;
        }

        return role.name ?? this.getTranslationLabel(role.translations, 'en') ?? role.slug;
      })
      .map((label) => String(label ?? '').trim())
      .filter((label) => label.length > 0);
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
      name: String(value?.name ?? fallbackName),
    };
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

  private roleRequiredValidator(control: AbstractControl): { required: true } | null {
    const value = control.value;
    if (Array.isArray(value) && value.length > 0) {
      return null;
    }

    return { required: true };
  }

  private syncFiltersWithAvailableOptions(): void {
    if (
      this.selectedRoleFilter &&
      !this.roleOptions.some(
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
    const roleFilter = this.selectedRoleFilter;
    const statusFilter = this.selectedStatusFilter;
    const keyword = this.searchKeyword.trim().toLowerCase();

    this.filteredUsers = this.users.filter((user) => {
      const matchRole =
        roleFilter.length === 0 ||
        user.roleSlugs.some((role) => role.trim().toLowerCase() === roleFilter);
      if (!matchRole) {
        return false;
      }

      const matchStatus =
        statusFilter.length === 0 ||
        user.statusCode.trim().toLowerCase() === statusFilter;
      if (!matchStatus) {
        return false;
      }

      if (keyword.length === 0) {
        return true;
      }

      const searchTarget = [
        user.fullName,
        user.username,
        user.email,
        user.phone,
        user.roles.join(' '),
        user.status,
      ]
        .join(' ')
        .toLowerCase();

      return searchTarget.includes(keyword);
    });
  }
}
