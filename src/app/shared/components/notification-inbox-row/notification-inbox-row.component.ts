import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { formatDisplayDateTime } from '../../lib/display-date-time';
import { NotificationItem } from '../../interfaces/notification.interface';

/**
 * OBRS-317: dumb/presentational single-notification row. Native `<button>`
 * (keyboard-focusable) so the row is reachable without a click-only handler.
 * Row click does NOT navigate in Phase 1 — no deep-link target is specified
 * even when `bookingScheduleId` is present; it only marks the item read.
 */
@Component({
  selector: 'app-notification-inbox-row',
  templateUrl: './notification-inbox-row.component.html',
  styleUrl: './notification-inbox-row.component.scss',
})
export class NotificationInboxRowComponent {
  @Input({ required: true }) item!: NotificationItem;
  @Output() open = new EventEmitter<number>();

  constructor(private readonly translate: TranslateService) {}

  protected get formattedTimestamp(): string {
    return formatDisplayDateTime(this.item.sentAt, this.translate.currentLang);
  }

  protected get ariaLabel(): string {
    const statusKey = this.item.read
      ? 'NOTIFICATIONS.ROW_READ_SUFFIX'
      : 'NOTIFICATIONS.ROW_UNREAD_SUFFIX';
    const status = this.translate.instant(statusKey);
    return `${this.item.message}, ${status}, ${this.formattedTimestamp}`;
  }

  protected onClick(): void {
    this.open.emit(this.item.id);
  }
}
