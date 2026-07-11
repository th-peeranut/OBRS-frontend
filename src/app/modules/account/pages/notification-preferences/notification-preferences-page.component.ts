import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../../../shared/services/alert.service';
import { NotificationPreferencesService } from '../../../../services/notification-preferences/notification-preferences.service';
import {
  NotificationPreferenceRow,
  UpdateNotificationPreferenceItem,
} from '../../../../shared/interfaces/notification-preference.interface';
import { ApiErrorResponse } from '../../../../shared/interfaces/response.interface';
import { CanComponentDeactivate } from '../../../../shared/guards/can-deactivate.guard';
import { NotificationPreferenceRowChange } from '../../components/notification-preference-row/notification-preference-row.component';

const CRITICAL_CHANNEL_ERROR_CODE = 'NOTIFICATION_PREFERENCE_CRITICAL_CHANNEL_REQUIRED';

/**
 * OBRS-141 customer notification-channel-preferences page. Component-local
 * state only (no NgRx) — matches `AccountPageComponent`'s pattern, per the
 * task spec: this is page-local settings-form state, not cross-page state.
 *
 * The ≥1-channel rule is enforced twice: live, per-toggle, in `onRowChange`
 * (vetoes + reverts before the edit ever reaches `rows`) and defensively on
 * the server's 400 fallback in `save()` (branches on `err.error.errorCode`,
 * never the localized message — design-system §9).
 */
@Component({
  selector: 'app-notification-preferences-page',
  templateUrl: './notification-preferences-page.component.html',
  styleUrl: './notification-preferences-page.component.scss',
})
export class NotificationPreferencesPageComponent
  implements OnInit, OnDestroy, CanComponentDeactivate
{
  rows: NotificationPreferenceRow[] = [];
  isLoading = false;
  isSaving = false;
  isDirty = false;
  loadFailed = false;
  /** Type whose row currently shows the inline ≥1-channel warning, or null. */
  criticalWarningType: string | null = null;

  private pristineRows: NotificationPreferenceRow[] = [];
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly notificationPreferencesService: NotificationPreferencesService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Implements `CanComponentDeactivate` for `CanDeactivateGuard` on this route. */
  canDeactivate(): boolean | Promise<boolean> {
    if (!this.isDirty) {
      return true;
    }

    return this.alertService.confirm({
      title: this.translate.instant('NOTIFICATION_PREFS.UNSAVED_CHANGES_TITLE'),
      text: this.translate.instant('NOTIFICATION_PREFS.UNSAVED_CHANGES_TEXT'),
      confirmButtonText: this.translate.instant('NOTIFICATION_PREFS.UNSAVED_CHANGES_CONFIRM'),
      cancelButtonText: this.translate.instant('NOTIFICATION_PREFS.UNSAVED_CHANGES_CANCEL'),
    });
  }

  load(): void {
    this.isLoading = true;
    this.loadFailed = false;

    this.notificationPreferencesService
      .getPreferences()
      .pipe(
        catchError(() => {
          this.loadFailed = true;
          return of(null);
        }),
        finalize(() => {
          this.isLoading = false;
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((res) => {
        if (!res) {
          this.alertService.error(this.translate.instant('NOTIFICATION_PREFS.ERROR.LOAD_FAILED'));
          return;
        }

        // Seed from exactly what the server returned — never force a default.
        const preferences = res.data?.preferences ?? [];
        this.rows = preferences;
        this.pristineRows = preferences.map((row) => ({ ...row }));
        this.isDirty = false;
        this.criticalWarningType = null;
      });
  }

  onRetry(): void {
    this.load();
  }

  onRowChange(change: NotificationPreferenceRowChange): void {
    const row = this.rows.find((r) => r.type === change.type);
    if (!row) {
      return;
    }

    const otherChannelEnabled = change.channel === 'email' ? row.smsEnabled : row.emailEnabled;
    const wouldLeaveBothOff = !change.enabled && !otherChannelEnabled;

    if (row.critical && wouldLeaveBothOff) {
      // Veto: don't touch `rows`. The child row imperatively re-syncs the
      // PrimeNG switch's visual state back to `row.<channel>Enabled` on a
      // macrotask after every change (see NotificationPreferenceRowComponent
      // doc), so leaving `rows` untouched here is what reverts the slider.
      this.criticalWarningType = row.type;
      this.alertService.toast(
        this.translate.instant('NOTIFICATION_PREFS.ERROR.CRITICAL_LAST_CHANNEL'),
        'warning'
      );
      return;
    }

    this.criticalWarningType = null;
    this.rows = this.rows.map((r) => {
      if (r.type !== change.type) {
        return r;
      }
      return change.channel === 'email'
        ? { ...r, emailEnabled: change.enabled }
        : { ...r, smsEnabled: change.enabled };
    });
    this.recomputeDirty();
  }

  save(): void {
    if (!this.isDirty || this.isSaving) {
      return;
    }

    this.isSaving = true;
    const payload: UpdateNotificationPreferenceItem[] = this.rows.map((row) => ({
      type: row.type,
      emailEnabled: row.emailEnabled,
      smsEnabled: row.smsEnabled,
    }));

    this.notificationPreferencesService
      .updatePreferences(payload)
      .pipe(
        finalize(() => {
          this.isSaving = false;
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res) => {
          const preferences = res.data?.preferences ?? [];
          this.rows = preferences;
          this.pristineRows = preferences.map((row) => ({ ...row }));
          this.isDirty = false;
          this.criticalWarningType = null;
          this.alertService.success(this.translate.instant('NOTIFICATION_PREFS.SAVE_SUCCESS'));
        },
        error: (err: HttpErrorResponse) => {
          // Keep the user's unsaved edits on failure — don't touch rows/pristineRows.
          const errorCode = (err.error as ApiErrorResponse | undefined)?.errorCode;

          if (errorCode === CRITICAL_CHANNEL_ERROR_CODE) {
            this.alertService.error(
              this.translate.instant('NOTIFICATION_PREFS.ERROR.CRITICAL_LAST_CHANNEL')
            );
          } else {
            this.alertService.error(this.translate.instant('NOTIFICATION_PREFS.ERROR.GENERIC'));
          }
        },
      });
  }

  private recomputeDirty(): void {
    this.isDirty = JSON.stringify(this.rows) !== JSON.stringify(this.pristineRows);
  }
}
