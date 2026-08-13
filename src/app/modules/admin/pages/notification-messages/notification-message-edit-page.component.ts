import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom, Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  NotificationMessageLocale,
  NotificationMessageLocaleStatusDto,
  OverridableMessageKeyDto,
  PlaceholderErrorDto,
  SmsCreditEstimateDto,
} from '../../../../shared/interfaces/notification-message-override.interface';
import { extractPlaceholderError } from '../../../../shared/lib/notification-message-errors';
import { NotificationMessagesStore } from './notification-messages.store';

const VALID_LOCALES: readonly NotificationMessageLocale[] = ['th', 'en', 'zh'];

function isNotificationMessageLocale(value: string | null): value is NotificationMessageLocale {
  return value !== null && (VALID_LOCALES as readonly string[]).includes(value);
}

/**
 * OBRS-1308 — `/admin/settings/notification-messages/edit/:messageCode/:locale`.
 * One-off `GET .../{messageCode}` on init (no store — a cached SWR value would
 * be actively wrong here: the owner must never see a stale status after their
 * own submit). Opens OPTIMISTICALLY from the `NotificationMessagesStore`'s
 * cached list, if the owner arrived from the list tab (design-system §6) —
 * the one-off GET then patches in the authoritative detail when it lands.
 */
@Component({
    selector: 'app-notification-message-edit-page',
    templateUrl: './notification-message-edit-page.component.html',
    styleUrl: './notification-message-edit-page.component.scss',
    standalone: false
})
export class NotificationMessageEditPageComponent implements OnInit, OnDestroy {
  protected messageCode = '';
  protected locale: NotificationMessageLocale = 'th';
  protected key: OverridableMessageKeyDto | null = null;
  protected detail: NotificationMessageLocaleStatusDto | null = null;
  protected creditEstimate: SmsCreditEstimateDto | null = null;
  protected submitting = false;
  protected validationError: PlaceholderErrorDto | null = null;
  protected loadFailed = false;

  private readonly creditPreviewBody$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly adminApiService: AdminApiService,
    private readonly notificationMessagesStore: NotificationMessagesStore,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const code = params.get('messageCode');
      const locale = params.get('locale');
      if (!code || !isNotificationMessageLocale(locale)) {
        return;
      }
      this.messageCode = code;
      this.locale = locale;
      this.validationError = null;
      this.load();
    });

    // AC12: cancels a stale in-flight preview request if a newer debounced
    // body arrives before the previous one resolves.
    this.creditPreviewBody$
      .pipe(
        switchMap((body) =>
          this.adminApiService.previewNotificationMessageCredit(this.messageCode, this.locale, body)
        ),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          if (response?.data) {
            this.creditEstimate = response.data;
          }
        },
        // Best-effort display only — a failed preview keeps showing the last
        // known estimate rather than surfacing an error over a non-blocking hint.
        error: () => undefined,
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get showCreditPanel(): boolean {
    return this.key?.channels.includes('SMS') ?? false;
  }

  protected onBodyChange(body: string): void {
    if (this.showCreditPanel) {
      this.creditPreviewBody$.next(body);
    }
  }

  protected async onSave(body: string): Promise<void> {
    this.submitting = true;
    this.validationError = null;
    try {
      await firstValueFrom(
        this.adminApiService.submitNotificationMessage({
          messageCode: this.messageCode,
          locale: this.locale,
          body,
        })
      );
      this.alertService.success(
        this.translate.instant('ADMIN.NOTIFICATION_MESSAGES.EDIT.SUBMIT_SUCCESS_TOAST')
      );
      // The status area swaps to the PENDING banner; the textarea is NOT
      // cleared or disabled (design-system precedent: an owner may resubmit
      // immediately, which supersedes).
      if (this.detail) {
        this.detail = { ...this.detail, status: 'PENDING', rejectReason: null };
      }
      void this.notificationMessagesStore.refresh();
    } catch (error) {
      const placeholderError = extractPlaceholderError(error);
      if (placeholderError) {
        this.validationError = placeholderError;
      } else {
        this.alertService.error(this.translate.instant('ADMIN.NOTIFICATION_MESSAGES.ERROR.SAVE_FAILED'));
      }
    } finally {
      this.submitting = false;
    }
  }

  protected onCancel(): void {
    void this.router.navigate(['/admin/settings/notification-messages']);
  }

  private load(): void {
    this.loadFailed = false;

    // Optimistic open (design-system §6): seed from the cached list store
    // when available, so the page never gates on the network.
    const cachedKey = this.notificationMessagesStore.value?.find(
      (candidate) => candidate.messageCode === this.messageCode
    );
    if (cachedKey) {
      this.key = cachedKey;
      this.detail = cachedKey.locales[this.locale] ?? null;
    }

    this.adminApiService
      .getNotificationMessageByCode(this.messageCode)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const data = response?.data;
          if (data) {
            this.key = data;
            this.detail = data.locales[this.locale] ?? null;
            this.creditEstimate = this.detail?.creditEstimate ?? null;
          }
        },
        error: () => {
          // Optimistic content (if any, from the cache-hit above) stays on
          // screen; only flag the failure when there was nothing to show at all.
          this.loadFailed = this.key === null;
        },
      });
  }
}
