import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  NotificationMessageLocale,
  OverridableMessageKeyDto,
} from '../../../../../shared/interfaces/notification-message-override.interface';
import {
  notificationMessageStatusChipClass,
  notificationMessageStatusLabelKey,
} from '../../../../../shared/lib/notification-message-status';

/** Rendered locale column order — matches the UX spec's COL_LOCALE_TH/EN/ZH order. */
const LOCALE_COLUMNS: NotificationMessageLocale[] = ['th', 'en', 'zh'];

/**
 * OBRS-1308 — dumb table for the owner message-key list. One row per
 * `messageCode`, one status chip + edit icon-button per locale column.
 */
@Component({
    selector: 'app-notification-message-list-table',
    templateUrl: './notification-message-list-table.component.html',
    styleUrl: './notification-message-list-table.component.scss',
    standalone: false
})
export class NotificationMessageListTableComponent {
  @Input() keys: OverridableMessageKeyDto[] = [];
  @Input() loading = false;
  @Input() error = false;

  @Output() editKey = new EventEmitter<{ code: string; locale: NotificationMessageLocale }>();

  protected readonly localeColumns = LOCALE_COLUMNS;
  protected readonly skeletonRows = Array.from({ length: 3 });

  protected statusChipClass(status: string): string {
    return notificationMessageStatusChipClass(status);
  }

  protected statusLabelKey(status: string): string {
    return notificationMessageStatusLabelKey(status);
  }

  protected onEdit(code: string, locale: NotificationMessageLocale): void {
    this.editKey.emit({ code, locale });
  }

  protected trackByCode(_index: number, row: OverridableMessageKeyDto): string {
    return row.messageCode;
  }
}
