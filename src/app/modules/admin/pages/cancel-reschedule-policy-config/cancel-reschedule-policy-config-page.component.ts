import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import {
  AdminApiService,
  CancelReschedulePolicyReqDto,
  OwnerCancelReschedulePolicyDto,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { hasOwnKey } from '../../../../shared/lib/own-key';
import { apiFieldErrors, extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { CanComponentDeactivate } from '../../../../shared/guards/can-deactivate.guard';
import { confirmDiscardUnsavedSettings } from '../system-settings/unsaved-settings-prompt';
import { integerRangeValidator } from '../booking-policy-config/booking-policy-config-page.validators';
import { CancelReschedulePolicyConfigStore } from './cancel-reschedule-policy-config.store';
import {
  earlyRateNotBelowLateRate,
  earlyWindowAboveCancelWindow,
  earlyWindowAboveRescheduleWindow,
} from './cancel-reschedule-policy-config-page.validators';

/** The seven keys, in the order they are rendered and focused. */
const FIELD_ORDER = [
  'cancelWindowHours',
  'cancelRefundRateEarlyPct',
  'cancelRefundRateLatePct',
  'rescheduleWindowHours',
  'rescheduleMaxDaysAhead',
  'rescheduleFeeLateThb',
  'earlyWindowHours',
] as const;

/**
 * The backend rejects a field by its WIRE name; two of them are entered as
 * whole percent and so do not share a name with their control (§4.2).
 */
const WIRE_FIELD_TO_CONTROL: Readonly<Record<string, string>> = {
  cancelRefundRateEarly: 'cancelRefundRateEarlyPct',
  cancelRefundRateLate: 'cancelRefundRateLatePct',
};

/**
 * OBRS-699 — `/admin/settings` "cancel-reschedule-policy" tab (owner-only).
 * Copies `ParcelShareConfigPageComponent`'s structure (SWR store +
 * `CanComponentDeactivate` + pristine-only patch + focus-management-on-
 * invalid-submit) and `BookingPolicyConfigPageComponent`'s per-reason error
 * resolution, which is imported rather than re-implemented.
 *
 * What this page adds on top, and why each one is not decoration:
 *
 * 1. A per-field source badge. PUT writes all seven keys as a unit (BR-7), so
 *    an owner who edits ONE number converts the other six from "follows the
 *    platform" to "mine, forever". Without the badge (and the takeover warning
 *    and the confirm below it) nothing on screen says that.
 * 2. A page-level "use the platform default". It is page-level because DELETE
 *    drops all seven override rows as a unit and there is no per-key delete —
 *    a per-field control would have to be faked by PUT-ing the platform value
 *    into that field, which writes an override row holding the default and
 *    permanently detaches it. Do not "improve" it into a per-field control.
 * 3. A PERSISTENT server-rejection banner beside the usual toast. D-2 makes
 *    `cancelRefundRateEarly >= cancelRefundRateLate` a server-enforced 400,
 *    and a toast that has faded leaves the owner with a form that refused to
 *    save and no reason on screen.
 *
 * The two rate fields are entered as whole percent and converted at exactly
 * two boundaries (`applyFormValues`, `buildPayload`). The wire stays the
 * `0.00`–`1.00` rate the spec locks; whole percent 0..100 and a two-decimal
 * rate are a bijection, so nothing the backend accepts is unreachable.
 */
@Component({
    selector: 'app-cancel-reschedule-policy-config-page',
    templateUrl: './cancel-reschedule-policy-config-page.component.html',
    styleUrl: './cancel-reschedule-policy-config-page.component.scss',
    standalone: false
})
export class CancelReschedulePolicyConfigPageComponent
  implements OnInit, OnDestroy, CanComponentDeactivate
{
  @ViewChild('cancelWindowHoursInput') private readonly cancelWindowHoursInput?: ElementRef<HTMLInputElement>;
  @ViewChild('cancelRefundRateEarlyPctInput') private readonly cancelRefundRateEarlyPctInput?: ElementRef<HTMLInputElement>;
  @ViewChild('cancelRefundRateLatePctInput') private readonly cancelRefundRateLatePctInput?: ElementRef<HTMLInputElement>;
  @ViewChild('rescheduleWindowHoursInput') private readonly rescheduleWindowHoursInput?: ElementRef<HTMLInputElement>;
  @ViewChild('rescheduleMaxDaysAheadInput') private readonly rescheduleMaxDaysAheadInput?: ElementRef<HTMLInputElement>;
  @ViewChild('rescheduleFeeLateThbInput') private readonly rescheduleFeeLateThbInput?: ElementRef<HTMLInputElement>;
  @ViewChild('earlyWindowHoursInput') private readonly earlyWindowHoursInput?: ElementRef<HTMLInputElement>;

  protected config: OwnerCancelReschedulePolicyDto | null = null;
  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected isSaving = false;

  /** The 400 the server answered with, kept on screen until the next edit. */
  protected serverErrorMessage = '';

  protected isResetting = false;
  protected resetErrorMessage = '';

  protected readonly form: FormGroup;

  private hasLoadedOnce = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: CancelReschedulePolicyConfigStore,
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.form = this.formBuilder.group(
      {
        cancelWindowHours: [null, [integerRangeValidator(0, 168)]],
        cancelRefundRateEarlyPct: [null, [integerRangeValidator(0, 100)]],
        cancelRefundRateLatePct: [null, [integerRangeValidator(0, 100)]],
        rescheduleWindowHours: [null, [integerRangeValidator(0, 168)]],
        rescheduleMaxDaysAhead: [null, [integerRangeValidator(1, 365)]],
        rescheduleFeeLateThb: [null, [integerRangeValidator(0, 10000)]],
        earlyWindowHours: [null, [integerRangeValidator(1, 720)]],
      },
      {
        validators: [
          earlyWindowAboveCancelWindow(),
          earlyWindowAboveRescheduleWindow(),
          earlyRateNotBelowLateRate(),
        ],
      }
    );
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

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.refreshFailed = failed && this.store.hasValue;
      this.errorMessage =
        failed && !this.store.hasValue
          ? this.translate.instant('ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.LOAD_FAILED')
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

  /** How many of the seven the owner has set themselves. */
  protected get overriddenCount(): number {
    const config = this.config;
    if (!config) {
      return 0;
    }
    return [
      config.cancelWindowHoursOverridden,
      config.cancelRefundRateEarlyOverridden,
      config.cancelRefundRateLateOverridden,
      config.rescheduleWindowHoursOverridden,
      config.rescheduleMaxDaysAheadOverridden,
      config.rescheduleFeeLateThbOverridden,
      config.earlyWindowHoursOverridden,
    ].filter(Boolean).length;
  }

  /** How many still follow the platform — the number the takeover warning and
   * the save confirm both quote, because those are the ones a save converts. */
  protected get inheritedCount(): number {
    return this.config ? FIELD_ORDER.length - this.overriddenCount : 0;
  }

  protected get stateKey(): string {
    if (this.overriddenCount === 0) {
      return 'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.STATE.ALL_DEFAULT';
    }
    if (this.overriddenCount === FIELD_ORDER.length) {
      return 'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.STATE.ALL_CUSTOM';
    }
    return 'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.STATE.MIXED';
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
    // Once all seven are already the owner's, a routine edit gets no dialog —
    // nagging on every save is how a dialog stops being read.
    const inherited = this.inheritedCount;
    if (inherited > 0) {
      const confirmed = await this.alertService.confirm({
        title: this.translate.instant(
          'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.SAVE_CONFIRM_TITLE'
        ),
        text: this.translate.instant(
          'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.SAVE_CONFIRM_TEXT',
          { count: inherited }
        ),
        confirmButtonText: this.translate.instant(
          'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.SAVE_CONFIRM_BTN'
        ),
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
        this.adminApiService.updateCancelReschedulePolicyOwnerConfig(this.buildPayload())
      );
      this.form.markAsPristine();
      this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      // The response is the server's re-read, so the badges flip from server
      // truth rather than from an optimistic guess.
      if (response.data) {
        this.store.mutate(() => response.data as OwnerCancelReschedulePolicyDto);
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
      title: this.translate.instant(
        'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.RESET.CONFIRM_TITLE'
      ),
      text: this.translate.instant('ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.RESET.CONFIRM_TEXT'),
      confirmButtonText: this.translate.instant(
        'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.RESET.CONFIRM_BTN'
      ),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.isResetting = true;
    this.resetErrorMessage = '';
    try {
      const response = await firstValueFrom(
        this.adminApiService.resetCancelReschedulePolicyOwnerConfig()
      );
      if (response.data) {
        this.store.mutate(() => response.data as OwnerCancelReschedulePolicyDto);
        // Full reset (not the pristine-only patch): the values changed under
        // the owner because they asked for it, and the form must end PRISTINE
        // or the unsaved-changes guard fires on the next tab switch about
        // changes the user did not make.
        this.applyFormValues(response.data, false);
      }
      this.serverErrorMessage = '';
      this.alertService.success(
        this.translate.instant('ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.RESET.DONE')
      );
      await this.store.refresh();
    } catch (error) {
      this.resetErrorMessage =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.RESET.FAILED');
    } finally {
      this.isResetting = false;
    }
  }

  /** Marks the exact controls the server named, so the owner is not left to
   * guess which of seven numbers the 400 was about.
   *
   * A field name is SERVER-supplied, so the map lookup is guarded (ADR-0028)
   * and the result is then narrowed to `FIELD_ORDER` — this page only ever
   * marks one of the seven controls it owns. */
  private applyServerFieldErrors(error: unknown): void {
    for (const [wireField, reason] of Object.entries(apiFieldErrors(error))) {
      const controlName = hasOwnKey(WIRE_FIELD_TO_CONTROL, wireField)
        ? WIRE_FIELD_TO_CONTROL[wireField]
        : wireField;
      if (!(FIELD_ORDER as readonly string[]).includes(controlName)) {
        continue;
      }
      const control = this.form.get(controlName);
      control?.setErrors({ server: reason });
      control?.markAsTouched();
    }
  }

  /** Declared field order, paired with its input ref — a list rather than a
   * keyed map so there is no runtime lookup to guard. */
  private focusFirstInvalidControl(): void {
    const inputs: readonly [string, ElementRef<HTMLInputElement> | undefined][] = [
      ['cancelWindowHours', this.cancelWindowHoursInput],
      ['cancelRefundRateEarlyPct', this.cancelRefundRateEarlyPctInput],
      ['cancelRefundRateLatePct', this.cancelRefundRateLatePctInput],
      ['rescheduleWindowHours', this.rescheduleWindowHoursInput],
      ['rescheduleMaxDaysAhead', this.rescheduleMaxDaysAheadInput],
      ['rescheduleFeeLateThb', this.rescheduleFeeLateThbInput],
      ['earlyWindowHours', this.earlyWindowHoursInput],
    ];
    for (const [name, ref] of inputs) {
      if (this.form.get(name)?.invalid) {
        ref?.nativeElement.focus();
        return;
      }
    }
  }

  /** Conversion boundary #1 of two: rate -> whole percent. */
  private applyFormValues(config: OwnerCancelReschedulePolicyDto, onlyPristine: boolean): void {
    const values = {
      cancelWindowHours: config.cancelWindowHours,
      cancelRefundRateEarlyPct: Math.round(config.cancelRefundRateEarly * 100),
      cancelRefundRateLatePct: Math.round(config.cancelRefundRateLate * 100),
      rescheduleWindowHours: config.rescheduleWindowHours,
      rescheduleMaxDaysAhead: config.rescheduleMaxDaysAhead,
      rescheduleFeeLateThb: config.rescheduleFeeLateThb,
      earlyWindowHours: config.earlyWindowHours,
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

  /** Conversion boundary #2 of two: whole percent -> the 0.00–1.00 rate the
   * wire is locked to. `@Digits(1,2)` admits exactly two decimals, and every
   * whole percent divides into one. */
  private buildPayload(): CancelReschedulePolicyReqDto {
    const value = (name: string): number => Number(this.form.get(name)?.value);
    return {
      cancelWindowHours: value('cancelWindowHours'),
      cancelRefundRateEarly: Number((value('cancelRefundRateEarlyPct') / 100).toFixed(2)),
      cancelRefundRateLate: Number((value('cancelRefundRateLatePct') / 100).toFixed(2)),
      rescheduleWindowHours: value('rescheduleWindowHours'),
      rescheduleMaxDaysAhead: value('rescheduleMaxDaysAhead'),
      rescheduleFeeLateThb: value('rescheduleFeeLateThb'),
      earlyWindowHours: value('earlyWindowHours'),
    };
  }
}
