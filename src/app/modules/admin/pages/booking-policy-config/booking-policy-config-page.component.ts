import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  BookingPolicyConfigDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { CanComponentDeactivate } from '../../../../shared/guards/can-deactivate.guard';
import { confirmDiscardUnsavedSettings } from '../system-settings/unsaved-settings-prompt';
import { BookingPolicyConfigStore } from './booking-policy-config.store';
import { integerRangeValidator } from './booking-policy-config-page.validators';

const MAX_ADVANCE_DAYS_MIN = 1;
const MAX_ADVANCE_DAYS_MAX = 365;
const CUTOFF_MINUTES_MIN = 1;
const CUTOFF_MINUTES_MAX = 1440;

// OBRS-564: admin config for the two real booking-policy numbers (advance
// -booking cap, minutes-before-departure cutoff) shown on /business-policy
// and enforced by the backend on submit — mirrors ReminderConfigPageComponent
// (reminder-config-page.component.ts) as closely as possible: same SWR store
// base, same pristine-only patch-on-later-emission contract, same save()
// shape. `maxAdvanceDays` is listed FIRST (both in the form group and the
// template) because it matches the reading order of the public policy copy
// ("regular sale" / "advance sale, up to N days"), so an owner can map
// form -> page at a glance.
//
// Two deliberate differences from ReminderConfigPageComponent:
// 1. Each field has a closed range (not just "positive"), via
//    integerRangeValidator(min, max) — reminder-config's fields are
//    unbounded-above.
// 2. Focus management on a failed submit (markAllAsTouched() then move focus
//    to the first invalid control) — reminder-config doesn't do this; adding
//    it here is deliberate (UX spec).
@Component({
  selector: 'app-booking-policy-config-page',
  templateUrl: './booking-policy-config-page.component.html',
  styleUrl: './booking-policy-config-page.component.scss',
})
export class BookingPolicyConfigPageComponent
  implements OnInit, OnDestroy, CanComponentDeactivate
{
  @ViewChild('maxAdvanceDaysInput') private readonly maxAdvanceDaysInput?: ElementRef<HTMLInputElement>;
  @ViewChild('cutoffMinutesInput') private readonly cutoffMinutesInput?: ElementRef<HTMLInputElement>;

  protected config: BookingPolicyConfigDto | null = null;
  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected isSaving = false;

  protected readonly bookingPolicyConfigForm: FormGroup;

  // First store emission gets a full form reset; later emissions (a
  // background revalidate while the admin may be mid-edit) only patch
  // pristine controls — same contract as ReminderConfigPageComponent
  // (design-system.md §6).
  private hasLoadedOnce = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: BookingPolicyConfigStore,
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.bookingPolicyConfigForm = this.formBuilder.group({
      maxAdvanceDays: [
        null,
        [integerRangeValidator(MAX_ADVANCE_DAYS_MIN, MAX_ADVANCE_DAYS_MAX)],
      ],
      cutoffMinutes: [
        null,
        [integerRangeValidator(CUTOFF_MINUTES_MIN, CUTOFF_MINUTES_MAX)],
      ],
    });
  }

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      if (data) {
        this.config = data;
        this.applyFormValues(data, this.hasLoadedOnce);
        this.hasLoadedOnce = true;
      } else {
        // OBRS-506: honor a null emission (OBRS-467 shape) — clear() (e.g.
        // logout) DISCARDS the cached value, so drop the cached reference.
        // Deliberately does NOT call applyFormValues(null, ...) or touch
        // hasLoadedOnce. Note this is NOT about preserving an in-progress edit:
        // the template gates the whole form on `*ngIf="!isLoading && config"`,
        // so once config is null the form is unmounted and anything typed into
        // it is unreachable either way. The reason to leave them alone is the
        // sweep's invariant — hasLoadedOnce must keep its value so the NEXT
        // non-null emission takes the same applyFormValues(data, true) branch it
        // takes today, leaving the success path byte-identical.
        this.config = null;
      }
    });

    this.store.refreshing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((refreshing) => (this.isRefreshing = refreshing));

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.refreshFailed = failed && this.store.hasValue;
      this.errorMessage =
        failed && !this.store.hasValue
          ? this.translate.instant('ADMIN.BOOKING_POLICY_CONFIG.LOAD_FAILED')
          : '';
    });

    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  /**
   * OBRS-702: implements `CanComponentDeactivate`. As a tab of /admin/settings
   * this component is DESTROYED when another tab is opened, so an unsaved edit
   * is gone — ask first rather than losing it silently. `save()` marks the form
   * pristine, so a saved edit never prompts.
   */
  canDeactivate(): boolean | Promise<boolean> {
    return confirmDiscardUnsavedSettings(
      this.bookingPolicyConfigForm,
      this.alertService,
      this.translate
    );
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.bookingPolicyConfigForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  // Distinct message per failure reason: `required` (blank), `notInteger`
  // (e.g. 1.5), `outOfRange` (a whole number outside the field's bounds) each
  // need a different, accurate message.
  protected errorKey(fieldName: string): string {
    const field = this.bookingPolicyConfigForm.get(fieldName);
    if (field?.hasError('notInteger')) {
      return 'ADMIN.VALIDATION.WHOLE_NUMBER';
    }
    if (field?.hasError('outOfRange')) {
      return 'ADMIN.VALIDATION.INTEGER_RANGE';
    }
    return 'ADMIN.VALIDATION.REQUIRED';
  }

  // {min, max} for the INTEGER_RANGE message's interpolation; undefined for
  // every other error key (the translate pipe simply ignores unused params).
  protected errorParams(fieldName: string): { min: number; max: number } | undefined {
    const field = this.bookingPolicyConfigForm.get(fieldName);
    const outOfRange = field?.errors?.['outOfRange'] as { min: number; max: number } | undefined;
    return outOfRange;
  }

  // aria-describedby MUST always bind the helper text id, plus the error id
  // only while the field is invalid (a11y requirement — the error element
  // must not be announced before it exists / while it's hidden).
  protected describedBy(fieldName: string): string {
    const helperId = `${fieldName}-helper`;
    return this.isFieldInvalid(fieldName) ? `${helperId} ${fieldName}-error` : helperId;
  }

  protected async save(): Promise<void> {
    if (this.bookingPolicyConfigForm.invalid) {
      this.bookingPolicyConfigForm.markAllAsTouched();
      this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      this.focusFirstInvalidControl();
      return;
    }

    this.isSaving = true;
    try {
      await firstValueFrom(
        this.adminApiService.updateBookingPolicyConfig(
          this.bookingPolicyConfigForm.value as BookingPolicyConfigDto
        )
      );
      // Values now match what was just saved — clear dirty so the next
      // background refresh patches these controls again without a visual jump.
      this.bookingPolicyConfigForm.markAsPristine();
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      await this.store.refresh();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      this.alertService.error(message);
    } finally {
      this.isSaving = false;
    }
  }

  private focusFirstInvalidControl(): void {
    if (this.bookingPolicyConfigForm.get('maxAdvanceDays')?.invalid) {
      this.maxAdvanceDaysInput?.nativeElement.focus();
      return;
    }
    if (this.bookingPolicyConfigForm.get('cutoffMinutes')?.invalid) {
      this.cutoffMinutesInput?.nativeElement.focus();
    }
  }

  private applyFormValues(config: BookingPolicyConfigDto, onlyPristine: boolean): void {
    const values = {
      maxAdvanceDays: config.maxAdvanceDays,
      cutoffMinutes: config.cutoffMinutes,
    };

    if (!onlyPristine) {
      this.bookingPolicyConfigForm.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.bookingPolicyConfigForm.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }
  }
}
