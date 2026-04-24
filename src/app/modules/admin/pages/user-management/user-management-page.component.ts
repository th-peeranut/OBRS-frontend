import { Component, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  map,
  of,
  Subscription,
  switchMap,
} from 'rxjs';
import {
  AdminApiService,
  AdminRoleDto,
  AdminStatusDto,
  AdminTranslationDto,
  AdminUserDto,
  CreateUserPayload,
  UpdateUserPayload,
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
export class UserManagementPageComponent implements OnInit, OnDestroy {
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
  protected usernameIsExist = false;
  protected emailIsExist = false;
  protected phoneNumberIsExist = false;

  protected readonly userForm: FormGroup;
  private usernameCheckSubscription?: Subscription;
  private emailCheckSubscription?: Subscription;
  private phoneNumberCheckSubscription?: Subscription;
  private readonly usernameValidators = [
    Validators.required,
    Validators.minLength(3),
    Validators.maxLength(50),
    Validators.pattern(/^[a-zA-Z0-9._-]+$/),
  ];
  private readonly passwordValidators = [
    Validators.required,
    Validators.minLength(8),
    Validators.maxLength(255),
  ];

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
        this.usernameValidators,
      ],
      password: ['', this.passwordValidators],
      confirmPassword: ['', [Validators.required]],
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
    this.setupDuplicateCheckSubscriptions();
    await this.loadUsersAndOptions();
  }

  ngOnDestroy(): void {
    this.usernameCheckSubscription?.unsubscribe();
    this.emailCheckSubscription?.unsubscribe();
    this.phoneNumberCheckSubscription?.unsubscribe();
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
    this.resetDuplicateFlags();
    this.userForm.reset({
      title: '',
      firstName: '',
      middleName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      username: '',
      password: '',
      confirmPassword: '',
      preferredLocale: 'th',
      status: this.statusOptions[0]?.code ?? 'active',
      roles: [],
      isPhoneNumberVerify: true,
    });
    this.setCredentialFieldsForCreateMode();
    this.isFormModalOpen = true;
  }

  protected async openEditModal(user: UserRow): Promise<void> {
    let userDetail: AdminUserDto | null = null;
    try {
      const response = await firstValueFrom(this.adminApiService.getUserById(user.id));
      userDetail = response?.data ?? null;
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.LOAD_USERS_FAILED'));
      return;
    }

    this.isEditMode = true;
    this.selectedUser = user;
    this.resetDuplicateFlags();

    const parsedName = this.parseNameFromFullName(userDetail?.fullName ?? user.fullName);
    const firstName = String(userDetail?.firstName ?? parsedName.firstName ?? '').trim();
    const middleName = String(userDetail?.middleName ?? parsedName.middleName ?? '').trim();
    const lastName = String(userDetail?.lastName ?? parsedName.lastName ?? '').trim();
    const roles = this.extractRoleSlugs(userDetail?.roles);
    const status = this.parseStatus(userDetail?.status ?? user.statusCode);

    this.userForm.reset({
      title: String((userDetail?.title ?? parsedName.title) || 'Mr').trim(),
      firstName,
      middleName,
      lastName,
      email: userDetail?.email ?? user.email,
      phoneNumber: String(userDetail?.phoneNumber ?? user.phone).replace(/\D/g, ''),
      username: userDetail?.username ?? user.username,
      password: '',
      confirmPassword: '',
      preferredLocale: userDetail?.preferredLocale ?? 'th',
      status: status.code,
      roles: roles.length > 0 ? roles : [...user.roleSlugs],
      isPhoneNumberVerify: true,
    });

    this.setCredentialFieldsForEditMode();
    this.isFormModalOpen = true;
  }

  protected closeFormModal(force = false): void {
    if (this.isSubmitting && !force) {
      return;
    }

    this.isFormModalOpen = false;
    this.selectedUser = null;
    this.userForm.reset();
    this.resetDuplicateFlags();
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

    if (!this.isEditMode) {
      const hasCredentialError =
        !this.checkSamePassword() ||
        this.usernameIsExist ||
        this.emailIsExist ||
        this.phoneNumberIsExist;

      if (hasCredentialError) {
        this.userForm.markAllAsTouched();
        return;
      }
    }

    this.isSubmitting = true;
    try {
      if (this.isEditMode && this.selectedUser) {
        const payload = this.toUpdateUserPayload();
        await firstValueFrom(this.adminApiService.updateUser(this.selectedUser.id, payload));
        this.isSubmitting = false;
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        const payload = this.toCreateUserPayload();
        await firstValueFrom(this.adminApiService.createUser(payload));
        this.isSubmitting = false;
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      await this.loadUsersAndOptions();
    } catch {
      this.isSubmitting = false;
      this.closeFormModal(true);
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED'));
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
      this.closeDeleteModal(true);
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      await this.loadUsersAndOptions();
    } catch {
      this.closeDeleteModal(true);
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED'));
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

  private toCreateUserPayload(): CreateUserPayload {
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

  private toUpdateUserPayload(): UpdateUserPayload {
    const raw = this.userForm.getRawValue();

    return {
      title: String(raw.title ?? '').trim(),
      firstName: String(raw.firstName ?? '').trim(),
      middleName: String(raw.middleName ?? '').trim() || undefined,
      lastName: String(raw.lastName ?? '').trim(),
      email: String(raw.email ?? '').trim(),
      phoneNumber: String(raw.phoneNumber ?? '').trim(),
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

  private parseNameFromFullName(fullName: string | null | undefined): {
    title: string;
    firstName: string;
    middleName: string;
    lastName: string;
  } {
    const parts = String(fullName ?? '')
      .trim()
      .split(/\s+/)
      .filter((part) => part.length > 0);

    if (parts.length === 0) {
      return { title: '', firstName: '', middleName: '', lastName: '' };
    }

    const titleTokens = new Set(['mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss', 'dr', 'dr.']);
    let title = '';
    if (titleTokens.has(parts[0].toLowerCase())) {
      title = parts.shift() ?? '';
    }

    const firstName = parts.shift() ?? '';
    if (parts.length === 0) {
      return { title, firstName, middleName: '', lastName: '' };
    }

    const lastName = parts.pop() ?? '';
    const middleName = parts.join(' ');
    return { title, firstName, middleName, lastName };
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

  private setCredentialFieldsForCreateMode(): void {
    const usernameControl = this.userForm.get('username');
    const passwordControl = this.userForm.get('password');
    const confirmPasswordControl = this.userForm.get('confirmPassword');

    usernameControl?.setValidators(this.usernameValidators);
    passwordControl?.setValidators(this.passwordValidators);
    confirmPasswordControl?.setValidators([Validators.required]);

    usernameControl?.enable();
    passwordControl?.enable();
    confirmPasswordControl?.enable();

    usernameControl?.updateValueAndValidity();
    passwordControl?.updateValueAndValidity();
    confirmPasswordControl?.updateValueAndValidity();
  }

  private setCredentialFieldsForEditMode(): void {
    const usernameControl = this.userForm.get('username');
    const passwordControl = this.userForm.get('password');
    const confirmPasswordControl = this.userForm.get('confirmPassword');

    usernameControl?.clearValidators();
    passwordControl?.clearValidators();
    confirmPasswordControl?.clearValidators();

    usernameControl?.disable();
    passwordControl?.disable();
    confirmPasswordControl?.disable();

    usernameControl?.updateValueAndValidity();
    passwordControl?.updateValueAndValidity();
    confirmPasswordControl?.updateValueAndValidity();
  }

  protected checkSamePassword(): boolean {
    if (this.isEditMode) {
      return true;
    }

    const raw = this.userForm.getRawValue();
    const password = String(raw.password ?? '');
    const confirmPassword = String(raw.confirmPassword ?? '');

    return password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  }

  protected shouldShowCredentialValidationError(controlName: 'username' | 'email' | 'phoneNumber'): boolean {
    if (this.isEditMode) {
      return false;
    }

    const control = this.userForm.get(controlName);
    if (!control || !control.value || (!control.touched && !control.dirty)) {
      return false;
    }

    if (controlName === 'username') {
      return this.usernameIsExist;
    }

    if (controlName === 'email') {
      return this.emailIsExist;
    }

    return this.phoneNumberIsExist;
  }

  protected shouldShowConfirmPasswordMismatch(): boolean {
    if (this.isEditMode || this.checkSamePassword()) {
      return false;
    }

    const confirmPasswordControl = this.userForm.get('confirmPassword');
    const passwordControl = this.userForm.get('password');

    return Boolean(
      (confirmPasswordControl?.touched || confirmPasswordControl?.dirty) ||
      (passwordControl?.touched || passwordControl?.dirty)
    );
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

  private resetDuplicateFlags(): void {
    this.usernameIsExist = false;
    this.emailIsExist = false;
    this.phoneNumberIsExist = false;
  }

  private setupDuplicateCheckSubscriptions(): void {
    const usernameControl = this.userForm.get('username');
    const emailControl = this.userForm.get('email');
    const phoneNumberControl = this.userForm.get('phoneNumber');

    this.usernameCheckSubscription = usernameControl?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap((value) => this.checkDuplicateUsername(value))
      )
      .subscribe((isExist) => {
        this.usernameIsExist = isExist;
      });

    this.emailCheckSubscription = emailControl?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap((value) => this.checkDuplicateEmail(value))
      )
      .subscribe((isExist) => {
        this.emailIsExist = isExist;
      });

    this.phoneNumberCheckSubscription = phoneNumberControl?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap((value) => this.checkDuplicatePhoneNumber(value))
      )
      .subscribe((isExist) => {
        this.phoneNumberIsExist = isExist;
      });
  }

  private checkDuplicateUsername(value: unknown) {
    const username = String(value ?? '').trim();
    if (!this.isCreateModeActive() || username.length === 0 || this.userForm.get('username')?.invalid) {
      return of(false);
    }

    return this.adminApiService.checkUserExistsByUsername(username).pipe(
      map((response) => Boolean(response?.data)),
      catchError(() => of(false))
    );
  }

  private checkDuplicateEmail(value: unknown) {
    const email = String(value ?? '').trim();
    if (!this.isCreateModeActive() || email.length === 0 || this.userForm.get('email')?.invalid) {
      return of(false);
    }

    return this.adminApiService.checkUserExistsByEmail(email).pipe(
      map((response) => Boolean(response?.data)),
      catchError(() => of(false))
    );
  }

  private checkDuplicatePhoneNumber(value: unknown) {
    const phoneNumber = String(value ?? '').trim();
    if (!this.isCreateModeActive() || phoneNumber.length === 0 || this.userForm.get('phoneNumber')?.invalid) {
      return of(false);
    }

    return this.adminApiService.checkUserExistsByPhoneNumber(phoneNumber).pipe(
      map((response) => Boolean(response?.data)),
      catchError(() => of(false))
    );
  }

  private isCreateModeActive(): boolean {
    return this.isFormModalOpen && !this.isEditMode;
  }
}
