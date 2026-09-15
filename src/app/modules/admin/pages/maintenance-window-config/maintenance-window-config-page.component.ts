import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  MaintenanceWindowConfigDto,
} from '../../../../services/admin/admin-api.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { AlertService } from '../../../../shared/services/alert.service';

/**
 * OBRS-1902 — where the owner schedules a deploy and tells every visitor about it.
 *
 * **No `AdminCollectionStore`, unlike every neighbouring settings tab.** That base treats a
 * response with no body as a failure (`throw new Error(...)` in each store's `fetch`), and here an
 * empty body is not a failure at all — it is the answer on every ordinary day: nothing is
 * scheduled. Wrapping "no announcement" in an error state so that a cache could be shared across
 * navigations would cost more than the cache is worth on a tab that is opened a handful of times
 * a month.
 *
 * **The form writes all five fields or none**, the same all-or-nothing shape the backend's single
 * json row enforces; DELETE is the separate "the deploy was called off" action and is offered only
 * once something is actually scheduled.
 */
@Component({
  selector: 'app-maintenance-window-config-page',
  templateUrl: './maintenance-window-config-page.component.html',
  styleUrl: './maintenance-window-config-page.component.scss',
  standalone: false,
})
export class MaintenanceWindowConfigPageComponent implements OnInit {
  protected scheduled: MaintenanceWindowConfigDto | null = null;
  protected isLoading = false;
  protected isSaving = false;
  protected errorMessage = '';

  protected readonly form: FormGroup;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.form = this.formBuilder.group({
      startAt: [null, Validators.required],
      endAt: [null, Validators.required],
      // 0 is meaningful - "keep selling right up to the second we pull the plug".
      paymentLockMinutesBefore: [10, [Validators.required, Validators.min(0), Validators.max(180)]],
      messageTh: ['', [Validators.required, Validators.maxLength(300)]],
      messageEn: ['', [Validators.required, Validators.maxLength(300)]],
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  /** True when the two instants are the wrong way round - the same rule the backend rejects. */
  protected hasDateRangeError(): boolean {
    const startAt: Date | null = this.form.value.startAt;
    const endAt: Date | null = this.form.value.endAt;
    return !!startAt && !!endAt && endAt.getTime() <= startAt.getTime();
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.hasDateRangeError() || this.isSaving) {
      return;
    }

    this.isSaving = true;
    try {
      const value = this.form.value;
      const response = await firstValueFrom(
        this.adminApiService.updateMaintenanceWindow({
          startAt: (value.startAt as Date).toISOString(),
          endAt: (value.endAt as Date).toISOString(),
          paymentLockMinutesBefore: Number(value.paymentLockMinutesBefore),
          messageTh: value.messageTh,
          messageEn: value.messageEn,
        })
      );
      this.apply(response.data ?? null);
      this.alertService.success(this.translate.instant('ADMIN.MAINTENANCE_WINDOW.SAVED'));
    } catch (error) {
      // extractApiErrorMessage returns '' when the failure carried no backend wording -
      // a network drop, or the very outage this page schedules.
      this.alertService.error(
        extractApiErrorMessage(error) ||
          this.translate.instant('ADMIN.MAINTENANCE_WINDOW.SAVE_FAILED')
      );
    } finally {
      this.isSaving = false;
    }
  }

  protected async cancelAnnouncement(): Promise<void> {
    if (this.isSaving) {
      return;
    }

    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.MAINTENANCE_WINDOW.CANCEL_CONFIRM_TITLE'),
      text: this.translate.instant('ADMIN.MAINTENANCE_WINDOW.CANCEL_CONFIRM_TEXT'),
      confirmButtonText: this.translate.instant('ADMIN.MAINTENANCE_WINDOW.CANCEL_CONFIRM_BUTTON'),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
      icon: 'warning',
    });
    if (!confirmed) {
      return;
    }

    this.isSaving = true;
    try {
      const response = await firstValueFrom(this.adminApiService.cancelMaintenanceWindow());
      this.apply(response.data ?? null);
      this.form.reset({ paymentLockMinutesBefore: 10, messageTh: '', messageEn: '' });
      this.alertService.success(this.translate.instant('ADMIN.MAINTENANCE_WINDOW.CANCELLED'));
    } catch (error) {
      // extractApiErrorMessage returns '' when the failure carried no backend wording -
      // a network drop, or the very outage this page schedules.
      this.alertService.error(
        extractApiErrorMessage(error) ||
          this.translate.instant('ADMIN.MAINTENANCE_WINDOW.SAVE_FAILED')
      );
    } finally {
      this.isSaving = false;
    }
  }

  private async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const response = await firstValueFrom(this.adminApiService.getMaintenanceWindow());
      this.apply(response.data ?? null);
    } catch {
      this.errorMessage = this.translate.instant('ADMIN.MAINTENANCE_WINDOW.LOAD_FAILED');
    } finally {
      this.isLoading = false;
    }
  }

  private apply(scheduled: MaintenanceWindowConfigDto | null): void {
    this.scheduled = scheduled;
    if (!scheduled) {
      return;
    }
    this.form.patchValue({
      startAt: new Date(scheduled.startAt),
      endAt: new Date(scheduled.endAt),
      paymentLockMinutesBefore: scheduled.paymentLockMinutesBefore,
      messageTh: scheduled.messageTh,
      messageEn: scheduled.messageEn,
    });
  }
}
