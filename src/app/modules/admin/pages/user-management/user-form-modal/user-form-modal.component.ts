import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
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
import { AdminApiService, AdminUserDto } from '../../../../../services/admin/admin-api.service';
import { SalesPointOptionDto } from '../../../../../shared/interfaces/driver-cash.interface';
import { AlertService } from '../../../../../shared/services/alert.service';
import { apiFieldErrors, extractApiErrorMessage } from '../../../../../shared/lib/api-error';
import { TranslateService } from '@ngx-translate/core';
import {
  RoleOption,
  SALES_POINT_ACTIVE_NONE,
  StatusOption,
  UserRow,
  buildUserFormValues,
  roleRequiredValidator,
  toCreateUserPayload,
  toSalesPointsPayload,
  toUpdateUserPayload,
  toUserDtoFallback,
} from '../user-management.mappers';
import {
  formatThaiMobile,
  separatorTolerantPattern,
  stripPhoneSeparators,
  THAI_MOBILE_PATTERN,
} from '../../../../../shared/constants/thai-msisdn';

// Smart create/edit form modal, extracted from UserManagementPageComponent
// (OBRS-257, mirroring OBRS-251's PromotionFormModalComponent /
// OBRS-212's RouteFormModalComponent pattern). Owns its FormGroup, the modal
// template, the credential enable/disable toggle, the duplicate email/phone
// checks, and its own create/update/detail-fetch API calls.
//
// Driven by @Input (isOpen/mode/selectedUser) rather than ViewChild, same as
// PromotionFormModalComponent — ngOnChanges reacts only to `isOpen`
// transitions so a re-render with the same open modal never clobbers
// in-progress input (see AppVehicleMaintenancePanelComponent's single-owner
// ngOnChanges idiom).
//
// `reloadStructure` is a callback @Input (not an @Output) so the parent's
// store refresh can still be triggered from here without a round-trip
// through an @Output subscriber. Ordering is byte-for-byte parity with the
// pre-split UserManagementPageComponent.submitUser on dev: API call -> emit
// closed (== the old closeFormModal(true)) -> await the success alert ->
// THEN reloadStructure() LAST. The modal does not stay open during the
// refresh — do not reorder this to await reloadStructure before the
// close/alert. Note: unlike PromotionFormModalComponent.submitPromotion, the
// pre-split submitUser's invalid-form branch does NOT show an
// alert.warning() — it only marks the form touched and returns. Preserved
// verbatim (not "fixed" to match the promotions pattern).
@Component({
    selector: 'app-user-form-modal',
    templateUrl: './user-form-modal.component.html',
    styleUrl: './user-form-modal.component.scss',
    standalone: false
})
export class UserFormModalComponent implements OnInit, OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() selectedUser: UserRow | null = null;
  @Input() roleOptions: RoleOption[] = [];
  @Input() statusOptions: StatusOption[] = [];
  @Input() reloadStructure!: () => Promise<void>;
  @Output() closed = new EventEmitter<void>();

  protected isSubmitting = false;
  protected isEditDetailLoading = false;
  protected emailIsExist = false;
  protected phoneNumberIsExist = false;
  // OBRS-1255 AC3: field name -> the backend's own reason, from ApiErrorRespDto.errors[]. Rendered
  // under the control the server named instead of collapsing into one modal-wide message.
  protected serverFieldErrors: Record<string, string> = {};

  // OBRS-1258: options for the edit-mode-only Sales Points section. Populated once per
  // edit-modal open (initEditForm), independent of which user is being edited — the roster
  // itself is global, so no staleness guard is needed here the way the user-detail patch has one.
  protected salesPointOptions: SalesPointOptionDto[] = [];
  protected salesPointsLoadState: 'loading' | 'loaded' | 'error' = 'loading';

  protected readonly userForm: FormGroup;
  private emailCheckSubscription?: Subscription;
  private phoneNumberCheckSubscription?: Subscription;

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
      title: ['', [Validators.minLength(2), Validators.maxLength(50)]],
      firstName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      middleName: ['', [Validators.minLength(2), Validators.maxLength(50)]],
      lastName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      email: ['', [Validators.required, Validators.email]],
      // OBRS-455 AC#2: this writes users.phone_number, the same column signup and /account write —
      // and the one OTP login matches on and the driver reminder texts. It was the last surface
      // still accepting the old \d{10,15}, so an admin could create an account the owner of it
      // could never log into by OTP.
      phoneNumber: ['', [Validators.required, separatorTolerantPattern(THAI_MOBILE_PATTERN)]],
      password: ['', this.passwordValidators],
      confirmPassword: ['', [Validators.required]],
      preferredLocale: [
        'th',
        [Validators.required, Validators.pattern(/^[a-z]{2}(-[A-Z]{2})?$/)],
      ],
      status: ['', [Validators.required]],
      roles: [[], [roleRequiredValidator]],
      isPhoneNumberVerify: [true, [Validators.required]],
      // OBRS-1258: no validators on either — an empty allowed set is a valid, meaningful
      // value (AC3), and the sentinel is always pre-seeded so `required` would be dead
      // ceremony in edit mode while permanently invalidating create mode (see initCreateForm).
      allowedSalesPointCodes: [[]],
      activeSalesPointCode: [SALES_POINT_ACTIVE_NONE],
    });
  }

  ngOnInit(): void {
    this.setupDuplicateCheckSubscriptions();
  }

  // Only `isOpen` transitions drive the form: the parent always sets
  // mode/selectedUser together with isOpen in the same synchronous call
  // (openCreateModal/openEditModal), so gating on isOpen alone mirrors that
  // call boundary without re-initializing the form on an unrelated parent
  // re-render (e.g. a background store refresh) while the modal stays open.
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen']) {
      return;
    }

    if (this.isOpen) {
      if (this.mode === 'edit' && this.selectedUser) {
        void this.initEditForm(this.selectedUser);
      } else {
        this.initCreateForm();
      }
    } else {
      this.isEditDetailLoading = false;
      this.userForm.reset();
      this.resetFieldErrorState();
    }
  }

  ngOnDestroy(): void {
    this.emailCheckSubscription?.unsubscribe();
    this.phoneNumberCheckSubscription?.unsubscribe();
  }

  /**
   * OBRS-1255 / AC2: this row is a guest shadow user (ADR-0123) being edited.
   *
   * Read off `selectedUser.guest`, which the LIST endpoint derives from `auth_provider = 'GUEST'`
   * on the stored row. Not off the detail DTO — `UserDetailResponse` has no such field, so
   * `userDetail.guest` is always undefined and every guest row would revert to looking normal the
   * moment the late detail patch arrived. Not off "the row has no roles" either: that is the
   * SYMPTOM this card is about, and a real account can be mid-edit with none.
   */
  protected get isGuestRowEdit(): boolean {
    return this.mode === 'edit' && Boolean(this.selectedUser?.guest);
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

  // OBRS-1258 AC1: live off `userForm.value['roles']`, same source of truth
  // `isRoleChecked` above already reads — roles are edited in this same modal, so ticking
  // 'salesperson' reveals the section immediately without a separate flag to keep in sync.
  protected get isSalespersonSelected(): boolean {
    const roles: string[] = this.userForm.value['roles'] ?? [];
    return roles.includes('salesperson');
  }

  // OBRS-1258 AC1: mirrors app-admin-dropdown's own `options` shape ({value,label}), built via
  // AdminDropdownComponent.selectedLabel's getter idiom. The sentinel is always first and
  // always present, and only currently-ALLOWED codes are offered — the dropdown can never
  // offer a code the allowed multi-select doesn't (also) hold.
  protected get activeSalesPointOptions(): { value: string; label: string }[] {
    const allowed: string[] = this.userForm.value['allowedSalesPointCodes'] ?? [];

    return [
      {
        value: SALES_POINT_ACTIVE_NONE,
        label: this.translate.instant('ADMIN.USERS.ACTIVE_SALES_POINT_NONE'),
      },
      ...this.salesPointOptions
        .filter((option) => allowed.includes(option.code))
        .map((option) => ({ value: option.code, label: option.name })),
    ];
  }

  protected isSalesPointChecked(code: string): boolean {
    const allowed: string[] = this.userForm.value['allowedSalesPointCodes'] ?? [];
    return allowed.includes(code);
  }

  // OBRS-1258 AC2: same direct-patchValue shape as toggleRoleSelection above (not a
  // valueChanges subscription). Removing the currently-active point from the allowed set
  // clears the active field immediately, before submit.
  protected toggleSalesPointSelection(code: string, checked: boolean): void {
    const current = [...(this.userForm.value['allowedSalesPointCodes'] ?? [])];

    if (checked && !current.includes(code)) {
      current.push(code);
    }

    if (!checked) {
      const index = current.indexOf(code);
      if (index > -1) {
        current.splice(index, 1);
      }
    }

    this.userForm.patchValue({ allowedSalesPointCodes: current });

    if (!checked && this.userForm.value['activeSalesPointCode'] === code) {
      this.userForm.patchValue({ activeSalesPointCode: SALES_POINT_ACTIVE_NONE });
    }
  }

  // OBRS-691: same focus/blur regrouping idiom as account-page.component.ts —
  // peel dashes off for typing, regroup on blur. Validators and the
  // create/update payload builders (user-management.mappers.ts) always read
  // the stripped digits.
  protected onPhoneFocus(): void {
    const control = this.userForm.get('phoneNumber');
    control?.setValue(stripPhoneSeparators(control.value));
  }

  protected onPhoneBlur(): void {
    const control = this.userForm.get('phoneNumber');
    control?.setValue(formatThaiMobile(control.value));
  }

  protected requestClose(): void {
    if (this.isSubmitting) {
      return;
    }
    this.closed.emit();
  }

  protected checkSamePassword(): boolean {
    if (this.mode === 'edit') {
      return true;
    }

    const raw = this.userForm.getRawValue();
    const password = String(raw.password ?? '');
    const confirmPassword = String(raw.confirmPassword ?? '');

    return password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  }

  protected shouldShowCredentialValidationError(controlName: 'email' | 'phoneNumber'): boolean {
    if (this.mode === 'edit') {
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
    if (this.mode === 'edit' || this.checkSamePassword()) {
      return false;
    }

    const confirmPasswordControl = this.userForm.get('confirmPassword');
    const passwordControl = this.userForm.get('password');

    return Boolean(
      (confirmPasswordControl?.touched || confirmPasswordControl?.dirty) ||
      (passwordControl?.touched || passwordControl?.dirty)
    );
  }

  protected async submitUser(): Promise<void> {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    if (this.mode === 'create') {
      const hasCredentialError =
        !this.checkSamePassword() || this.emailIsExist || this.phoneNumberIsExist;

      if (hasCredentialError) {
        this.userForm.markAllAsTouched();
        return;
      }
    }

    this.isSubmitting = true;
    this.serverFieldErrors = {};
    try {
      if (this.mode === 'edit' && this.selectedUser) {
        const payload = toUpdateUserPayload(this.userForm.getRawValue(), this.isGuestRowEdit);
        await firstValueFrom(this.adminApiService.updateUser(this.selectedUser.id, payload));

        // OBRS-1258 AC5 accepted trade-off (owner decision): un-ticking 'salesperson' in the
        // same Save means this branch is skipped, so the DB keeps that user's prior
        // salesPointCodes/activeSalesPointCode even though they're no longer a salesperson.
        // Left as-is deliberately — that state is functionally inert (defaultPickupStopSlug
        // only matters on the salesperson-gated sell page; EOD rows only exist for
        // salesperson walk-in sales), and clearing-on-removal would be a scope expansion the
        // owner has not asked for. Do not "fix" this without re-confirming with the owner.
        if (this.isSalespersonSelected) {
          const salesPointsPayload = toSalesPointsPayload(this.userForm.getRawValue());
          await firstValueFrom(
            this.adminApiService.updateUserSalesPoints(this.selectedUser.id, salesPointsPayload)
          );
        }

        this.isSubmitting = false;
        this.closed.emit();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        const payload = toCreateUserPayload(this.userForm.getRawValue());
        await firstValueFrom(this.adminApiService.createUser(payload));
        this.isSubmitting = false;
        this.closed.emit();
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      await this.reloadStructure();
    } catch (error) {
      this.isSubmitting = false;

      // OBRS-1255 AC3: a 400 that names fields stays IN the modal, pinned to those fields. The
      // old branch closed the modal first and then showed one generic alert, so the operator lost
      // both the form and any way to tell which value was refused - and for `email`, which is
      // disabled in edit mode, they could not even see the value on the way past.
      const fieldErrors = apiFieldErrors(error);
      if (Object.keys(fieldErrors).length > 0) {
        this.serverFieldErrors = fieldErrors;
        this.userForm.markAllAsTouched();
        return;
      }

      this.closed.emit();
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  // design-system.md §3.1 note: unlike PromotionFormModalComponent's
  // initCreateForm, this pre-seeds `status` with the first status option on
  // create. That is pre-existing behavior carried over verbatim from
  // UserManagementPageComponent.openCreateModal (not introduced by this
  // split; not "fixed" per the no-behavior-change invariant).
  private initCreateForm(): void {
    this.isEditDetailLoading = false;
    this.resetFieldErrorState();
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
      // OBRS-1258 SEV1: must be seeded here like every other control in this reset object —
      // FormGroup.reset(value) resets any ABSENT key to null, and a null activeSalesPointCode
      // would break the options getter's `?? []`-free assumption (dead ceremony aside, the
      // field is hidden in create mode anyway, but the form value must stay well-formed).
      allowedSalesPointCodes: [],
      activeSalesPointCode: SALES_POINT_ACTIVE_NONE,
    });
    this.setCredentialFieldsForCreateMode();
  }

  // Open immediately with the row data already in hand, then patch in the
  // server detail once it arrives (pristine controls only) — same pattern as
  // PromotionFormModalComponent.initEditForm / the pre-split openEditModal.
  private async initEditForm(user: UserRow): Promise<void> {
    this.isEditDetailLoading = true;
    this.resetFieldErrorState();
    this.applyUserFormValues(toUserDtoFallback(user), user);
    this.setCredentialFieldsForEditMode();

    // OBRS-1258: fired once here, in parallel with the getUserById fetch below — NOT gated on
    // isSalespersonSelected, since the role can be toggled live inside this same open modal.
    // Not awaited: the options list is user-independent (same global roster for every edit),
    // so there is no staleness/ordering dependency with the detail fetch below.
    void this.loadSalesPointOptions();

    try {
      const response = await firstValueFrom(this.adminApiService.getUserById(user.id));
      const userDetail = response?.data ?? null;
      // Ignore a stale response if the modal has since closed or moved on to
      // editing a different user.
      if (userDetail && this.isOpen && this.selectedUser?.id === user.id) {
        this.applyUserFormValues(userDetail, user, true);
      }
    } catch {
      // Keep the fallback values already shown in the open modal.
    } finally {
      if (this.isOpen && this.selectedUser?.id === user.id) {
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

  // OBRS-1258: reuses AdminApiService.getDriverCashSalesPoints() — the same
  // GET /private/owner/driver-cash/sales-points call driver-cash-rates already makes — rather
  // than adding a second method for the same endpoint.
  private async loadSalesPointOptions(): Promise<void> {
    this.salesPointsLoadState = 'loading';
    try {
      const response = await firstValueFrom(this.adminApiService.getDriverCashSalesPoints());
      this.salesPointOptions = response?.data ?? [];
      this.salesPointsLoadState = 'loaded';
    } catch {
      this.salesPointOptions = [];
      this.salesPointsLoadState = 'error';
    }
  }

  private setCredentialFieldsForCreateMode(): void {
    const passwordControl = this.userForm.get('password');
    const confirmPasswordControl = this.userForm.get('confirmPassword');

    passwordControl?.setValidators(this.passwordValidators);
    confirmPasswordControl?.setValidators([Validators.required]);

    passwordControl?.enable();
    confirmPasswordControl?.enable();
    // OBRS-725: the address IS chosen here — creating an account is the one moment
    // this form legitimately decides what the login email will be.
    this.userForm.get('email')?.enable();

    passwordControl?.updateValueAndValidity();
    confirmPasswordControl?.updateValueAndValidity();

    // OBRS-1255: re-enables anything a previous GUEST edit switched off. Create mode is never a
    // guest row, so this is always the "enable everything" branch - spelled as the same call
    // rather than three enable()s so the two paths cannot drift on which controls are involved.
    this.applyGuestRowRestrictions();
  }

  private setCredentialFieldsForEditMode(): void {
    const passwordControl = this.userForm.get('password');
    const confirmPasswordControl = this.userForm.get('confirmPassword');

    passwordControl?.clearValidators();
    confirmPasswordControl?.clearValidators();

    passwordControl?.disable();
    confirmPasswordControl?.disable();
    // OBRS-725: the login email joins the password as a credential this form shows but
    // cannot rewrite. `PUT /api/private/users/{id}` now rejects a changed address
    // outright (UserDtoService.applyUpdates -> user.error.email.immutable), so leaving the
    // input editable would only offer staff a change the server refuses. Disabling — not
    // removing — keeps the address visible, and submitUser reads getRawValue(), which
    // includes disabled controls, so the stored value still round-trips and satisfies the
    // DTO's @NotBlank. The account holder moves their own address through the verified
    // OBRS-84 / ADR-0033 flow.
    this.userForm.get('email')?.disable();

    passwordControl?.updateValueAndValidity();
    confirmPasswordControl?.updateValueAndValidity();

    this.applyGuestRowRestrictions();
  }

  /**
   * OBRS-1255 / AC2 (owner's option C): on a guest shadow row the form offers the NAME fields and
   * the status, and nothing else.
   *
   * `disable()`, not a template-only hide, and that is the load-bearing half. Angular excludes a
   * disabled control from the group's validity, which is what makes the row submittable at all: a
   * guest holds zero roles, `roleRequiredValidator` therefore reported the form invalid, and
   * `submitUser` returned before reaching the API. The reporter of this card only got as far as a
   * 400 because they ticked a role first — which is precisely the action AC2 forbids.
   *
   * `phoneNumber` and `preferredLocale` are disabled rather than hidden: they carry real values a
   * reader needs (the phone is the ONLY thing identifying a guest), they are still sent because
   * `getRawValue()` reads disabled controls, and the number in particular is the key
   * `GuestUserService#claimByRegistration` later matches on — editing it here would silently
   * re-point a future registration at someone else's record.
   *
   * Idempotent and always applied on an edit open, so re-opening the modal on a NORMAL row after a
   * guest one re-enables what the guest row switched off.
   */
  private applyGuestRowRestrictions(): void {
    const isGuest = this.isGuestRowEdit;

    // `email` is absent from this list on purpose: setCredentialFieldsForEditMode already disables
    // it for EVERY edit (OBRS-725), and re-enabling it here on a normal row would undo that.
    for (const name of ['phoneNumber', 'preferredLocale', 'roles']) {
      const control = this.userForm.get(name);
      if (isGuest) {
        control?.disable();
      } else {
        control?.enable();
      }
    }
  }

  // Everything on the form that is an ERROR rather than a value, cleared together: the two
  // duplicate-credential flags and (OBRS-1255) the server's per-field rejections. They share every
  // call site — open, re-open, close — because a stale one of either is the same bug: a message
  // about a value that is no longer on screen.
  private resetFieldErrorState(): void {
    this.emailIsExist = false;
    this.phoneNumberIsExist = false;
    this.serverFieldErrors = {};
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
    // OBRS-691: the control may carry display dashes (regrouped on blur) —
    // the dup-check must see the same bare digits the backend stores.
    const phoneNumber = stripPhoneSeparators(String(value ?? ''));
    if (
      !this.isCreateModeActive() ||
      phoneNumber.length === 0 ||
      this.userForm.get('phoneNumber')?.invalid
    ) {
      return of(false);
    }

    return this.adminApiService.checkUserExistsByPhoneNumber(phoneNumber).pipe(
      map((response) => Boolean(response?.data)),
      catchError(() => of(false))
    );
  }

  private isCreateModeActive(): boolean {
    return this.isOpen && this.mode === 'create';
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
}
