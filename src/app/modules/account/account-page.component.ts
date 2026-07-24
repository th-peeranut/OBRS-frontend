import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import { MyAccountService } from '../../services/user/my-account.service';
import { AlertService } from '../../shared/services/alert.service';
import { MyAccountProfile } from '../../shared/interfaces/my-account.interface';
import { PRIVACY_POLICY_VERSION } from '../privacy-policy/privacy-policy.version';
import { trimmedRequiredValidator } from '../../shared/validators/trimmed-required.validator';
import { THAI_MOBILE_PATTERN } from '../../shared/constants/thai-msisdn';

/**
 * Minimal customer identity-settings page (OBRS-84). Guard/route shape is
 * copied from `/my-bookings` (AuthGuard, `customerArea: true, requireAuth:
 * true`); the shell is `<app-navbar>` + a header + a single card, modeled on
 * `my-bookings.component.html`. The current login email is read from
 * `AuthService.getUsername()` — the username IS the login email in this app,
 * already cached in localStorage from login, so no new GET is needed just to
 * render this page. See docs/adr/0014-account-identity-settings-page.md.
 *
 * <p>OBRS-632 added the three things PDPA ม.19 / ม.33 / ม.35-36 require a customer to be able to
 * DO, each of which already had a backend endpoint and no button anywhere in the site:
 *
 * <ul>
 *   <li>correct their own name and phone (`PUT /users/me`, which nothing had ever called);</li>
 *   <li>re-consent when the privacy notice is republished under a new version;</li>
 *   <li>close the account (`DELETE /users/me`, likewise never called — and, before this card, a
 *       hard delete that would have 409'd for anyone who had ever booked).</li>
 * </ul>
 *
 * <p>Those need the profile from the server, so the page issues a GET on init. The login email
 * still renders from the cached username, so that card is not gated on the request.
 */
@Component({
  selector: 'app-account-page',
  templateUrl: './account-page.component.html',
  styleUrl: './account-page.component.scss',
})
export class AccountPageComponent implements OnInit {
  currentEmail: string | null = null;
  isChangeEmailDialogOpen = false;
  isCloseAccountDialogOpen = false;

  profile: MyAccountProfile | null = null;
  isProfileLoading = true;
  isProfileLoadFailed = false;
  isProfileEditing = false;
  isProfileSaving = false;

  isConsentSubmitting = false;
  readonly currentPolicyVersion = PRIVACY_POLICY_VERSION;

  profileForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly myAccountService: MyAccountService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    // Name fields mirror the backend `UserProfileUpdateReqDto` (2-50 chars). Phone uses
    // THAI_MOBILE_PATTERN - the SAME rule the signup form enforces - NOT the backend DTO's looser
    // `\d{10,15}`: OBRS-646 AC-7 requires profile validation to be no weaker than signup, and
    // signup only accepts a real Thai mobile (0[689]XXXXXXXX). The canonical stored form is exactly
    // this shape (OBRS-409) and is a strict subset of what the server accepts, so nothing the server
    // would have taken is rejected here.
    this.profileForm = this.fb.group({
      title: ['', [trimmedRequiredValidator, Validators.minLength(2), Validators.maxLength(50)]],
      firstName: ['', [trimmedRequiredValidator, Validators.minLength(2), Validators.maxLength(50)]],
      middleName: ['', [Validators.maxLength(50)]],
      lastName: ['', [trimmedRequiredValidator, Validators.minLength(2), Validators.maxLength(50)]],
      phoneNumber: ['', [Validators.required, Validators.pattern(THAI_MOBILE_PATTERN)]],
    });
  }

  ngOnInit(): void {
    this.currentEmail = this.authService.getUsername();
    this.loadProfile();
  }

  get needsReConsent(): boolean {
    return !this.isProfileLoading && this.myAccountService.needsReConsent(this.profile);
  }

  getForm(controlName: string) {
    return this.profileForm.get(controlName);
  }

  openChangeEmailDialog(): void {
    this.isChangeEmailDialogOpen = true;
  }

  closeChangeEmailDialog(): void {
    this.isChangeEmailDialogOpen = false;
  }

  openCloseAccountDialog(): void {
    this.isCloseAccountDialogOpen = true;
  }

  closeCloseAccountDialog(): void {
    this.isCloseAccountDialogOpen = false;
  }

  startEditingProfile(): void {
    this.isProfileEditing = true;
  }

  cancelEditingProfile(): void {
    this.isProfileEditing = false;
    this.patchFormFromProfile();
  }

  loadProfile(): void {
    this.isProfileLoading = true;
    this.isProfileLoadFailed = false;

    this.myAccountService.getProfile().subscribe({
      next: (res) => {
        this.isProfileLoading = false;
        this.profile = res?.data ?? null;
        this.patchFormFromProfile();
      },
      error: () => {
        this.isProfileLoading = false;
        this.isProfileLoadFailed = true;
      },
    });
  }

  saveProfile(): void {
    this.profileForm.markAllAsTouched();

    if (this.profileForm.invalid || this.isProfileSaving || !this.profile) {
      return;
    }

    this.isProfileSaving = true;
    const value = this.profileForm.value;
    const middleName = ((value.middleName as string) ?? '').trim();

    this.myAccountService
      .updateProfile({
        title: (value.title as string).trim(),
        firstName: (value.firstName as string).trim(),
        // The backend rejects a 1-character middleName but accepts its absence, so an emptied
        // field has to travel as null rather than "".
        middleName: middleName === '' ? null : middleName,
        lastName: (value.lastName as string).trim(),
        phoneNumber: (value.phoneNumber as string).trim(),
        // Not editable on this form: the locale belongs to the language switcher, and sending
        // anything else here would silently override the choice made there.
        preferredLocale: this.profile.preferredLocale,
      })
      .subscribe({
        next: () => {
          this.isProfileSaving = false;
          this.isProfileEditing = false;
          this.alertService.success(this.translate.instant('ACCOUNT.PROFILE_SAVE_SUCCESS'));
          this.loadProfile();
        },
        error: (err: unknown) => {
          this.isProfileSaving = false;
          const errorCode = (err as { error?: { errorCode?: string } })?.error?.errorCode;
          this.alertService.error(
            this.translate.instant(
              errorCode === 'USER_UPDATE_ERROR_PHONE_CONFLICT'
                ? 'ACCOUNT.PROFILE_SAVE_ERROR_PHONE_CONFLICT'
                : 'ACCOUNT.PROFILE_SAVE_ERROR_GENERIC'
            )
          );
        },
      });
  }

  acceptCurrentPolicy(): void {
    if (this.isConsentSubmitting) {
      return;
    }

    this.isConsentSubmitting = true;

    this.myAccountService.acceptCurrentPrivacyPolicy().subscribe({
      next: () => {
        this.isConsentSubmitting = false;
        this.alertService.success(this.translate.instant('ACCOUNT.CONSENT_ACCEPT_SUCCESS'));
        this.loadProfile();
      },
      error: () => {
        this.isConsentSubmitting = false;
        this.alertService.error(this.translate.instant('ACCOUNT.CONSENT_ACCEPT_ERROR'));
      },
    });
  }

  private patchFormFromProfile(): void {
    if (!this.profile) {
      return;
    }

    this.profileForm.patchValue({
      title: this.profile.title ?? '',
      firstName: this.profile.firstName ?? '',
      middleName: this.profile.middleName ?? '',
      lastName: this.profile.lastName ?? '',
      phoneNumber: this.profile.phoneNumber ?? '',
    });
  }
}
