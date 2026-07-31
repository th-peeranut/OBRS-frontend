import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService, JumpSeatConfigDto } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { CanComponentDeactivate } from '../../../../shared/guards/can-deactivate.guard';
import { confirmDiscardUnsavedSettings } from '../system-settings/unsaved-settings-prompt';
import { JumpSeatConfigStore } from './jump-seat-config.store';

// OBRS-358: admin toggle for the jump-seat (walk-in-only seat channel) —
// mirrors ReminderConfigPageComponent (reminder-config-page.component.ts)
// as closely as possible: same SWR store base, same pristine-only
// patch-on-later-emission contract, same save() shape. The only difference
// is a single boolean field (`enabled`) rendered as a `p-toggleSwitch`
// (reused from notification-preference-row.component.html) instead of the
// numeric inputs there.
@Component({
    selector: 'app-jump-seat-config-page',
    templateUrl: './jump-seat-config-page.component.html',
    styleUrl: './jump-seat-config-page.component.scss',
    standalone: false
})
export class JumpSeatConfigPageComponent
  implements OnInit, OnDestroy, CanComponentDeactivate
{
  protected config: JumpSeatConfigDto | null = null;
  protected isRefreshing = false;
  protected errorMessage = '';
  protected isSaving = false;

  protected readonly jumpSeatConfigForm: FormGroup;

  // First store emission gets a full form reset; later emissions (a
  // background revalidate while the admin may be mid-edit) only patch
  // pristine controls — same contract as ReminderConfigPageComponent
  // (design-system.md §6).
  private hasLoadedOnce = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: JumpSeatConfigStore,
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.jumpSeatConfigForm = this.formBuilder.group({
      enabled: [false],
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

    // AdminCollectionStore.error$ only carries a boolean (the raw error is
    // swallowed inside the store's fetch cycle — see admin-collection-store.ts
    // `run()`), so there is no caught error object to pass through
    // extractApiErrorMessage here; same ternary-on-boolean shape as
    // ReminderConfigPageComponent (the mirrored precedent).
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.errorMessage =
        failed && !this.store.hasValue
          ? this.translate.instant('ADMIN.JUMP_SEAT_CONFIG.LOAD_FAILED')
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
   * this component is DESTROYED when another tab is opened, so an untoggled-but
   * -unsaved switch is gone — ask first rather than losing it silently.
   * `save()` marks the form pristine, so a saved change never prompts.
   */
  canDeactivate(): boolean | Promise<boolean> {
    return confirmDiscardUnsavedSettings(
      this.jumpSeatConfigForm,
      this.alertService,
      this.translate
    );
  }

  protected async save(): Promise<void> {
    this.isSaving = true;
    try {
      await firstValueFrom(
        this.adminApiService.updateJumpSeatConfig(
          this.jumpSeatConfigForm.value as JumpSeatConfigDto
        )
      );
      // Value now matches what was just saved — clear dirty so the next
      // background refresh patches this control again without a visual jump.
      this.jumpSeatConfigForm.markAsPristine();
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

  private applyFormValues(config: JumpSeatConfigDto, onlyPristine: boolean): void {
    const values = { enabled: config.enabled };

    if (!onlyPristine) {
      this.jumpSeatConfigForm.reset(values);
      return;
    }

    const control = this.jumpSeatConfigForm.get('enabled');
    if (control?.pristine) {
      control.setValue(values.enabled);
    }
  }
}
