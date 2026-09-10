import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  OperationsConfigReqDto,
  OwnerOperationsConfigDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { apiFieldErrors, extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { CanComponentDeactivate } from '../../../../shared/guards/can-deactivate.guard';
import { confirmDiscardUnsavedSettings } from '../system-settings/unsaved-settings-prompt';
import { integerRangeValidator } from '../booking-policy-config/booking-policy-config-page.validators';
import { OperationsConfigStore } from './operations-config.store';

/** The four keys, in the order they are rendered and focused. */
const FIELD_ORDER = [
  'seatReservationMinutes',
  'reschedulePaymentTimeoutMinutes',
  'noShowCutoffMinutes',
  'nearFullAlertThresholdPercent',
] as const;

/**
 * OBRS-703 — `/admin/settings` "operations" tab (owner-only).
 *
 * Copies `CancelReschedulePolicyConfigPageComponent`'s structure (SWR store +
 * `CanComponentDeactivate` + pristine-only patch-on-later-emission +
 * focus-management-on-invalid-submit + page-level reset-to-default) verbatim
 * — see that component's own doc for why each of those exists. This page has
 * no cross-field coherence rule (unlike cancel-reschedule's early/cancel/
 * reschedule window ordering), so it carries no `.validators.ts` of its own;
 * every field validates independently with the shared `integerRangeValidator`.
 *
 * Two things this page adds that cancel-reschedule did not need:
 *
 * 1. A real 403 state (`isForbidden`, OBRS-727's `BookingsPageComponent`
 *    pattern). `requiredRoles: ['owner']` on the tab registry entry does NOT
 *    hide this tab from an admin — `AuthService.ROLE_GRANTS` makes `['admin']`
 *    and `['owner']` one predicate on THIS frontend today — so an admin can
 *    still click in and must see an explicit "this isn't yours" state, never
 *    the generic LOAD_FAILED text or an empty form.
 * 2. Two persistent (not `dirty`/`touched`-gated) warnings under
 *    `noShowCutoffMinutes` and `nearFullAlertThresholdPercent` — they must be
 *    visible BEFORE the owner changes the value, not only after, because both
 *    describe a real consequence (a no-show ticket is never refunded; 100%
 *    means the near-full alert never fires) rather than a validation problem.
 */
@Component({
    selector: 'app-operations-config-page',
    templateUrl: './operations-config-page.component.html',
    styleUrl: './operations-config-page.component.scss',
    standalone: false
})
export class OperationsConfigPageComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  @ViewChild('seatReservationMinutesInput') private readonly seatReservationMinutesInput?: ElementRef<HTMLInputElement>;
  @ViewChild('reschedulePaymentTimeoutMinutesInput') private readonly reschedulePaymentTimeoutMinutesInput?: ElementRef<HTMLInputElement>;
  @ViewChild('noShowCutoffMinutesInput') private readonly noShowCutoffMinutesInput?: ElementRef<HTMLInputElement>;
  @ViewChild('nearFullAlertThresholdPercentInput') private readonly nearFullAlertThresholdPercentInput?: ElementRef<HTMLInputElement>;

  protected config: OwnerOperationsConfigDto | null = null;
  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected isForbidden = false;
  protected isSaving = false;

  /** The 400 the server answered with, kept on screen until the next edit. */
  protected serverErrorMessage = '';

  protected isResetting = false;
  protected resetErrorMessage = '';

  protected readonly form: FormGroup;

  private hasLoadedOnce = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: OperationsConfigStore,
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.form = this.formBuilder.group({
      seatReservationMinutes: [null, [integerRangeValidator(1, 60)]],
      reschedulePaymentTimeoutMinutes: [null, [integerRangeValidator(1, 60)]],
      noShowCutoffMinutes: [null, [integerRangeValidator(1, 240)]],
      nearFullAlertThresholdPercent: [null, [integerRangeValidator(1, 99)]],
    });
  }

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      if (data) {
        this.config = data;
        this.applyFormValues(data, this.hasLoadedOnce);
        this.hasLoadedOnce = true;
      } else {
        this.config = null;
      }
    });

    this.store.refreshing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((refreshing) => (this.isRefreshing = refreshing));

    // OBRS-727 pattern: a denial is never a transient refresh hiccup, so it
    // wins over both the "showing stale data" hint and the generic
    // load-failure text.
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.isForbidden = failed && this.store.errorStatus === 403;
      this.refreshFailed = failed && !this.isForbidden && this.store.hasValue;
      this.errorMessage = this.isForbidden
        ? this.translate.instant('ADMIN.OPERATIONS_CONFIG.FORBIDDEN')
        : failed && !this.store.hasValue
          ? this.translate.instant('ADMIN.OPERATIONS_CONFIG.LOAD_FAILED')
          : '';
    });

    // A rejection that is still on screen next to a value the owner has since
    // changed is a stale accusation, so the banner and the per-field `server`
    // errors both clear on the first edit after one.
    this.form.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.serverErrorMessage) {
        this.serverErrorMessage = '';
      }
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

  /** How many of the four the owner has set themselves. */
  protected get overriddenCount(): number {
    const config = this.config;
    if (!config) {
      return 0;
    }
    return [
      config.seatReservationMinutesOverridden,
      config.reschedulePaymentTimeoutMinutesOverridden,
      config.noShowCutoffMinutesOverridden,
      config.nearFullAlertThresholdPercentOverridden,
    ].filter(Boolean).length;
  }

  /** How many still follow the platform — the number the takeover warning and
   * the save confirm both quote, because those are the ones a save converts. */
  protected get inheritedCount(): number {
    return this.config ? FIELD_ORDER.length - this.overriddenCount : 0;
  }

  protected get stateKey(): string {
    if (this.overriddenCount === 0) {
      return 'ADMIN.OPERATIONS_CONFIG.STATE.ALL_DEFAULT';
    }
    if (this.overriddenCount === FIELD_ORDER.length) {
      return 'ADMIN.OPERATIONS_CONFIG.STATE.ALL_CUSTOM';
    }
    return 'ADMIN.OPERATIONS_CONFIG.STATE.MIXED';
  }

  canDeactivate(): boolean | Promise<boolean> {
    return confirmDiscardUnsavedSettings(this.form, this.alertService, this.translate);
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected errorKey(fieldName: string): string {
    const field = this.form.get(fieldName);
    if (field?.hasError('server')) {
      return 'ADMIN.VALIDATION.SERVER_FIELD_ERROR';
    }
    if (field?.hasError('notInteger')) {
      return 'ADMIN.VALIDATION.WHOLE_NUMBER';
    }
    if (field?.hasError('outOfRange')) {
      return 'ADMIN.VALIDATION.INTEGER_RANGE';
    }
    return 'ADMIN.VALIDATION.REQUIRED';
  }

  protected errorParams(
    fieldName: string
  ): { min: number; max: number } | { reason: string } | undefined {
    const field = this.form.get(fieldName);
    const server = field?.errors?.['server'] as string | undefined;
    if (server) {
      return { reason: server };
    }
    return field?.errors?.['outOfRange'] as { min: number; max: number } | undefined;
  }

  protected describedBy(fieldName: string): string {
    const helperId = `${fieldName}-helper`;
    return this.isFieldInvalid(fieldName) ? `${helperId} ${fieldName}-error` : helperId;
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      this.focusFirstInvalidControl();
      return;
    }

    // Only the save that actually changes the inheritance relationship asks.
    // Once all four are already the owner's, a routine edit gets no dialog.
    const inherited = this.inheritedCount;
    if (inherited > 0) {
      const confirmed = await this.alertService.confirm({
        title: this.translate.instant('ADMIN.OPERATIONS_CONFIG.SAVE_CONFIRM_TITLE'),
        text: this.translate.instant('ADMIN.OPERATIONS_CONFIG.SAVE_CONFIRM_TEXT', {
          count: inherited,
        }),
        confirmButtonText: this.translate.instant('ADMIN.OPERATIONS_CONFIG.SAVE_CONFIRM_BTN'),
        cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
      });
      if (!confirmed) {
        return;
      }
    }

    this.isSaving = true;
    this.serverErrorMessage = '';
    try {
      const response = await firstValueFrom(
        this.adminApiService.updateOperationsOwnerConfig(this.buildPayload())
      );
      this.form.markAsPristine();
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      // The response is the server's re-read, so the badges flip from server
      // truth rather than from an optimistic guess.
      if (response.data) {
        this.store.mutate(() => response.data as OwnerOperationsConfigDto);
      }
      await this.store.refresh();
    } catch (error) {
      this.applyServerFieldErrors(error);
      const message =
        extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      this.alertService.error(message);
      this.serverErrorMessage = message;
    } finally {
      this.isSaving = false;
    }
  }

  protected async resetToPlatformDefault(): Promise<void> {
    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.OPERATIONS_CONFIG.RESET.CONFIRM_TITLE'),
      text: this.translate.instant('ADMIN.OPERATIONS_CONFIG.RESET.CONFIRM_TEXT'),
      confirmButtonText: this.translate.instant('ADMIN.OPERATIONS_CONFIG.RESET.CONFIRM_BTN'),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.isResetting = true;
    this.resetErrorMessage = '';
    try {
      const response = await firstValueFrom(this.adminApiService.resetOperationsOwnerConfig());
      if (response.data) {
        this.store.mutate(() => response.data as OwnerOperationsConfigDto);
        // Full reset (not the pristine-only patch): the values changed under
        // the owner because they asked for it, and the form must end
        // PRISTINE or the unsaved-changes guard fires on the next tab switch
        // about changes the user did not make.
        this.applyFormValues(response.data, false);
      }
      this.serverErrorMessage = '';
      this.alertService.success(this.translate.instant('ADMIN.OPERATIONS_CONFIG.RESET.DONE'));
      await this.store.refresh();
    } catch (error) {
      this.resetErrorMessage =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.OPERATIONS_CONFIG.RESET.FAILED');
    } finally {
      this.isResetting = false;
    }
  }

  /** Marks the exact control the server named, so the owner is not left to
   * guess which of the four numbers a 400 was about.
   *
   * A field name is SERVER-supplied, so it is narrowed to `FIELD_ORDER`
   * before it is trusted (ADR-0028) — this page only ever marks one of the
   * four controls it owns. */
  private applyServerFieldErrors(error: unknown): void {
    for (const [wireField, reason] of Object.entries(apiFieldErrors(error))) {
      if (!(FIELD_ORDER as readonly string[]).includes(wireField)) {
        continue;
      }
      const control = this.form.get(wireField);
      control?.setErrors({ server: reason });
      control?.markAsTouched();
    }
  }

  /** Declared field order, paired with its input ref — a list rather than a
   * keyed map so there is no runtime lookup to guard. */
  private focusFirstInvalidControl(): void {
    const inputs: readonly [string, ElementRef<HTMLInputElement> | undefined][] = [
      ['seatReservationMinutes', this.seatReservationMinutesInput],
      ['reschedulePaymentTimeoutMinutes', this.reschedulePaymentTimeoutMinutesInput],
      ['noShowCutoffMinutes', this.noShowCutoffMinutesInput],
      ['nearFullAlertThresholdPercent', this.nearFullAlertThresholdPercentInput],
    ];
    for (const [name, ref] of inputs) {
      if (this.form.get(name)?.invalid) {
        ref?.nativeElement.focus();
        return;
      }
    }
  }

  private applyFormValues(config: OwnerOperationsConfigDto, onlyPristine: boolean): void {
    const values = {
      seatReservationMinutes: config.seatReservationMinutes,
      reschedulePaymentTimeoutMinutes: config.reschedulePaymentTimeoutMinutes,
      noShowCutoffMinutes: config.noShowCutoffMinutes,
      nearFullAlertThresholdPercent: config.nearFullAlertThresholdPercent,
    };

    if (!onlyPristine) {
      this.form.reset(values);
      return;
    }

    for (const [name, value] of Object.entries(values)) {
      const control = this.form.get(name);
      if (control?.pristine) {
        control.setValue(value);
      }
    }
  }

  private buildPayload(): OperationsConfigReqDto {
    const value = (name: string): number => Number(this.form.get(name)?.value);
    return {
      seatReservationMinutes: value('seatReservationMinutes'),
      reschedulePaymentTimeoutMinutes: value('reschedulePaymentTimeoutMinutes'),
      noShowCutoffMinutes: value('noShowCutoffMinutes'),
      nearFullAlertThresholdPercent: value('nearFullAlertThresholdPercent'),
    };
  }
}
