import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../../auth/auth.service';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorCode, mapApiErrorCode } from '../../../../shared/lib/api-error-code';
import { NotificationMessageReviewDetailDto } from '../../../../shared/interfaces/notification-message-override.interface';
import { NotificationMessageReviewQueueStore } from './notification-messages.store';

const ACTION_ERROR_KEYS: Record<string, string> = {};

/**
 * OBRS-1308 — `/admin/settings/notification-messages/reviews/:id`, the
 * admin's approve/reject screen. The bell's `NOTIF_MSG_OVERRIDE_PENDING`
 * click-through lands here directly.
 *
 * <p><b>AC5, verified in the worktree (Scrutinize) — see the same note on
 * `NotificationMessageReviewQueuePageComponent`.</b> This is the more
 * important half of the two: a deep-link straight into `reviews/:id` is
 * exactly the path the notification bell uses, so the gate here MUST be the
 * first line of `ngOnInit`, checked with the raw `authService.getRoles()`
 * read (never `hasAnyRole`/this tab's `requiredRoles`, both `ROLE_GRANTS`-
 * expanded and therefore symmetric), returning BEFORE the one-off
 * `GET .../reviews/{id}` fires — an owner who reaches this URL, from the
 * address bar or (impossible in practice, since business rule 8 only inserts
 * this notification type for `ROLE_ADMIN` users, but defended anyway) a
 * leaked link, sees only the access-denied block and no approve/reject
 * control ever mounts.
 */
@Component({
    selector: 'app-notification-message-review-detail-page',
    templateUrl: './notification-message-review-detail-page.component.html',
    styleUrl: './notification-message-review-detail-page.component.scss',
    standalone: false
})
export class NotificationMessageReviewDetailPageComponent implements OnInit, OnDestroy {
  protected accessDenied = false;
  protected id: number | null = null;
  protected detail: NotificationMessageReviewDetailDto | null = null;
  protected loadFailed = false;
  protected alreadyHandled = false;
  protected approving = false;
  protected rejectDialogVisible = false;
  protected rejecting = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly adminApiService: AdminApiService,
    private readonly reviewQueueStore: NotificationMessageReviewQueueStore,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    // AC5 — first line, before any store/API call. See class doc.
    if (!this.authService.getRoles().includes('admin')) {
      this.accessDenied = true;
      return;
    }

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const idParam = params.get('id');
      const id = idParam ? Number(idParam) : NaN;
      if (Number.isNaN(id)) {
        return;
      }
      this.id = id;
      // A genuinely NEW id — reset alreadyHandled here, not inside load().
      // load() is also called to RE-fetch after a 409 (see handleActionError),
      // and that reload must not wipe the very flag it was called to react to.
      this.alreadyHandled = false;
      this.load(id);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get showActions(): boolean {
    return this.detail?.status === 'PENDING' && !this.alreadyHandled;
  }

  protected async onApprove(): Promise<void> {
    if (this.id === null || this.approving) {
      return;
    }
    this.approving = true;
    try {
      await firstValueFrom(this.adminApiService.approveNotificationMessageReview(this.id));
      this.alertService.success(
        this.translate.instant('ADMIN.NOTIFICATION_MESSAGES.REVIEW_DETAIL.APPROVE_SUCCESS_TOAST')
      );
      if (this.detail) {
        this.detail = { ...this.detail, status: 'APPROVED' };
      }
    } catch (error) {
      this.handleActionError(error);
      if (this.id !== null) {
        this.load(this.id);
      }
    } finally {
      this.approving = false;
    }
  }

  protected onOpenRejectDialog(): void {
    this.rejectDialogVisible = true;
  }

  protected onCancelReject(): void {
    this.rejectDialogVisible = false;
  }

  protected async onConfirmReject(reason: string): Promise<void> {
    if (this.id === null || this.rejecting) {
      return;
    }
    this.rejecting = true;
    try {
      await firstValueFrom(this.adminApiService.rejectNotificationMessageReview(this.id, reason));
      this.rejectDialogVisible = false;
      this.alertService.success(
        this.translate.instant('ADMIN.NOTIFICATION_MESSAGES.REVIEW_DETAIL.REJECT_SUCCESS_TOAST')
      );
      if (this.detail) {
        this.detail = { ...this.detail, status: 'REJECTED' };
      }
    } catch (error) {
      this.handleActionError(error);
      if (this.id !== null) {
        this.load(this.id);
      }
    } finally {
      this.rejecting = false;
    }
  }

  protected onBack(): void {
    void this.reviewQueueStore.refresh();
    void this.router.navigate(['/admin/settings/notification-messages/reviews']);
  }

  private load(id: number): void {
    this.loadFailed = false;
    this.adminApiService
      .getNotificationMessageReviewById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.detail = response?.data ?? null;
        },
        error: () => {
          // Detail GET failures render inline, never via AlertService —
          // there's nothing to dismiss, the page simply failed to open.
          this.loadFailed = true;
        },
      });
  }

  private handleActionError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      // Someone else already handled it, or the partial unique index fired.
      this.alreadyHandled = true;
      this.alertService.error(
        this.translate.instant('ADMIN.NOTIFICATION_MESSAGES.REVIEW_DETAIL.ALREADY_HANDLED')
      );
      return;
    }
    const code = extractApiErrorCode(error, null);
    this.alertService.error(
      this.translate.instant(
        mapApiErrorCode(code, ACTION_ERROR_KEYS, 'ADMIN.NOTIFICATION_MESSAGES.ERROR.SAVE_FAILED')
      )
    );
  }
}
