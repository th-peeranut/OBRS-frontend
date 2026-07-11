import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
  buildUserFormValues,
  filterUsers,
  roleRequiredValidator,
  statusClass as statusClassValue,
  toCreateUserPayload,
  toRoleOptions,
  toStatusOptions,
  toUpdateUserPayload,
  toUserDtoFallback,
  toUserRow,
} from './user-management.mappers';

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

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected errorMessage = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isUnlockModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isUnlocking = false;
  protected isEditMode = false;
  protected isEditDetailLoading = false;
  protected selectedUser: UserRow | null = null;
  protected emailIsExist = false;
  protected phoneNumberIsExist = false;

  protected readonly userForm: FormGroup;
  private emailCheckSubscription?: Subscription;
  private phoneNumberCheckSubscription?: Subscription;
  private readonly subscriptions = new Subscription();

  private rawUsers: AdminUserDto[] = [];
  private rawRoles: AdminRoleDto[] = [];
  private rawLookups: AdminLookupDto[] = [];
  private readonly passwordValidators = [
    Validators.required,
    Validators.minLength(8),
    Validators.maxLength(255),
  ];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: UsersStore,
    private readonly authService: AuthService
  ) {
    this.userForm = this.formBuilder.group({
      title: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      firstName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      middleName: ['', [Validators.minLength(2), Validators.maxLength(50)]],
      lastName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', [Validators.required, Validators.pattern(/^\d{10,15}$/)]],
      password: ['', this.passwordValidators],
      confirmPassword: ['', [Validators.required]],
      preferredLocale: [
        'th',
        [Validators.required, Validators.pattern(/^[a-z]{2}(-[A-Z]{2})?$/)],
      ],
      status: ['', [Validators.required]],
      roles: [[], [roleRequiredValidator]],
      isPhoneNumberVerify: [true, [Validators.required]],
    });

    // Language change only swaps displayed translations; data is already loaded,
    // so re-derive the view locally instead of re-fetching from the backend.
    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.applyLocalization();
      })
    );
  }

  ngOnInit(): void {
    this.setupDuplicateCheckSubscriptions();
    // Render the cached users instantly on re-entry, then revalidate.
    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        if (data) {
          this.rawUsers = data.users;
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
    this.emailCheckSubscription?.unsubscribe();
    this.phoneNumberCheckSubscription?.unsubscribe();
  }

  /** Skeletons only while loading with no cached data yet. */
  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected get activeUsers(): number {
    return this.users.filter((user) => user.statusCode === 'active').length;
  }

  protected statusClass(status: string): string {
    return statusClassValue(status);
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
    // Open the modal immediately with the row data we already hold, so it
    // appears without waiting on the (slow on SIT) detail fetch. The server
    // detail is patched in once it arrives — see the fetch below.
    this.isEditMode = true;
    this.selectedUser = user;
    this.isEditDetailLoading = true;
    this.resetDuplicateFlags();
    this.applyUserFormValues(toUserDtoFallback(user), user);
    this.setCredentialFieldsForEditMode();
    this.isFormModalOpen = true;

    try {
      const response = await firstValueFrom(this.adminApiService.getUserById(user.id));
      const userDetail = response?.data ?? null;
      // Ignore a stale response if the user closed the modal or switched rows.
      if (userDetail && this.isFormModalOpen && this.selectedUser?.id === user.id) {
        this.applyUserFormValues(userDetail, user, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      if (this.isFormModalOpen && this.selectedUser?.id === user.id) {
        this.isEditDetailLoading = false;
      }
    }
  }

  // Populate the user form from a DTO. When `onlyPristine` is set (the late
  // detail patch), only controls the user hasn't started editing are filled,
  // so the arriving server data never clobbers in-progress input.
  private applyUserFormValues(
    userDetail: AdminUserDto,
    user: UserRow,
    onlyPristine = false
  ): void {
    const values = buildUserFormValues(userDetail, user, this.getCurrentLocale());

    if (!onlyPristine) {
      this.userForm.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.userForm.get(name);
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

  protected hasAdminRole(): boolean {
    return this.authService.hasAnyRole(['admin']);
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
        const payload = toUpdateUserPayload(this.userForm.getRawValue());
        await firstValueFrom(this.adminApiService.updateUser(this.selectedUser.id, payload));
        this.isSubmitting = false;
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        const payload = toCreateUserPayload(this.userForm.getRawValue());
        await firstValueFrom(this.adminApiService.createUser(payload));
        this.isSubmitting = false;
        this.closeFormModal(true);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      await this.store.refresh();
    } catch (error) {
      this.isSubmitting = false;
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
      // Overlap the table revalidate with the success dialog (see submitUser).
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
    this.statusOptions = toStatusOptions(this.rawLookups, currentLocale);
    this.users = this.rawUsers.map((user) =>
      toUserRow(user, currentLocale, this.translate.currentLang)
    );
    this.syncFiltersWithAvailableOptions();
    this.applyFilters();
  }

  private getCurrentLocale(): string {
    const rawLocale = String(
      this.translate.currentLang || this.translate.getDefaultLang() || 'th'
    ).toLowerCase();

    return rawLocale.startsWith('en') ? 'en' : 'th';
  }

  private setCredentialFieldsForCreateMode(): void {
    const passwordControl = this.userForm.get('password');
    const confirmPasswordControl = this.userForm.get('confirmPassword');

    passwordControl?.setValidators(this.passwordValidators);
    confirmPasswordControl?.setValidators([Validators.required]);

    passwordControl?.enable();
    confirmPasswordControl?.enable();

    passwordControl?.updateValueAndValidity();
    confirmPasswordControl?.updateValueAndValidity();
  }

  private setCredentialFieldsForEditMode(): void {
    const passwordControl = this.userForm.get('password');
    const confirmPasswordControl = this.userForm.get('confirmPassword');

    passwordControl?.clearValidators();
    confirmPasswordControl?.clearValidators();

    passwordControl?.disable();
    confirmPasswordControl?.disable();

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

  protected shouldShowCredentialValidationError(controlName: 'email' | 'phoneNumber'): boolean {
    if (this.isEditMode) {
      return false;
    }

    const control = this.userForm.get(controlName);
    if (!control || !control.value || (!control.touched && !control.dirty)) {
      return false;
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
    this.filteredUsers = filterUsers(
      this.users,
      this.selectedRoleFilter,
      this.selectedStatusFilter,
      this.searchKeyword
    );
  }

  private resetDuplicateFlags(): void {
    this.emailIsExist = false;
    this.phoneNumberIsExist = false;
  }

  private setupDuplicateCheckSubscriptions(): void {
    const emailControl = this.userForm.get('email');
    const phoneNumberControl = this.userForm.get('phoneNumber');

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
