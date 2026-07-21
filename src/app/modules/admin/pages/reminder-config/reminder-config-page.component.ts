import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService, ReminderConfigDto } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { ReminderConfigStore } from './reminder-config.store';
import { positiveIntegerValidator } from './reminder-config-page.validators';

// OBRS-223: admin reminder-timing config (FE-only; the GET/PUT endpoints were
// shipped backend-only by OBRS-139). Structure/flow is copied as closely as
// possible from RoundTripPromotionCardComponent (round-trip-promotion-card.component.ts)
// — same SWR store base, same pristine-only patch-on-later-emission contract,
// same save() shape — except the wire payload here is a full replace (both
// fields are always required), not a partial PATCH.
@Component({
  selector: 'app-reminder-config-page',
  templateUrl: './reminder-config-page.component.html',
  styleUrl: './reminder-config-page.component.scss',
})
export class ReminderConfigPageComponent implements OnInit, OnDestroy {
  protected config: ReminderConfigDto | null = null;
  protected isRefreshing = false;
  protected errorMessage = '';
  protected isSaving = false;

  protected readonly reminderConfigForm: FormGroup;

  // First store emission gets a full form reset; later emissions (a
  // background revalidate while the admin may be mid-edit) only patch
  // pristine controls — same contract as RoundTripPromotionCardComponent
  // (design-system.md §6).
  private hasLoadedOnce = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: ReminderConfigStore,
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.reminderConfigForm = this.formBuilder.group({
      reminderHoursBeforeDeparture: [null, [Validators.required, Validators.min(1), positiveIntegerValidator]],
      boardingReminderMinutesBeforeDeparture: [
        null,
        [Validators.required, Validators.min(1), positiveIntegerValidator],
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
        // logout) DISCARDS the cached config. Drop only the cached reference;
        // deliberately does NOT call applyFormValues(null, ...) or touch
        // hasLoadedOnce — resetting the live reactive form on a logout emit
        // is out of scope for this defensive sweep and would be a behavior
        // change (the admin's in-progress edit would be wiped), not a
        // null-handling fix.
        this.config = null;
      }
    });

    this.store.refreshing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((refreshing) => (this.isRefreshing = refreshing));

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.errorMessage =
        failed && !this.store.hasValue
          ? this.translate.instant('ADMIN.REMINDER_CONFIG.LOAD_FAILED')
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

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.reminderConfigForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  // Distinct message per failure reason (bug fix): `notInteger` (e.g. 1.5) is
  // NOT the same problem as `positiveNumber`/`required`/`min` (e.g. 0, -5,
  // empty) — showing "must be > 0" for a decimal input like 1.5 is wrong
  // since 1.5 IS > 0; the real problem is it isn't a whole number.
  protected errorKey(fieldName: string): string {
    const field = this.reminderConfigForm.get(fieldName);
    if (field?.hasError('notInteger')) {
      return 'ADMIN.VALIDATION.WHOLE_NUMBER';
    }
    return 'ADMIN.VALIDATION.POSITIVE_NUMBER';
  }

  protected async save(): Promise<void> {
    if (this.reminderConfigForm.invalid) {
      this.reminderConfigForm.markAllAsTouched();
      this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSaving = true;
    try {
      await firstValueFrom(
        this.adminApiService.updateReminderConfig(
          this.reminderConfigForm.value as ReminderConfigDto
        )
      );
      // Values now match what was just saved — clear dirty so the next
      // background refresh patches these controls again without a visual jump.
      this.reminderConfigForm.markAsPristine();
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

  private applyFormValues(config: ReminderConfigDto, onlyPristine: boolean): void {
    const values = {
      reminderHoursBeforeDeparture: config.reminderHoursBeforeDeparture,
      boardingReminderMinutesBeforeDeparture: config.boardingReminderMinutesBeforeDeparture,
    };

    if (!onlyPristine) {
      this.reminderConfigForm.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.reminderConfigForm.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }
  }
}
