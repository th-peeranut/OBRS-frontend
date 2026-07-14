import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NotificationItem } from '../../interfaces/notification.interface';

/**
 * OBRS-317: dumb/presentational inbox panel hosted inside the notification
 * bell's `p-overlayPanel`. Renders the list of the current user's most
 * recent notifications, empty/loading/error states, "Mark all read", and a
 * "showing latest N of M" footer when the fetched page doesn't cover the
 * full unread+read total (Phase 1 has no full-inbox route).
 */
@Component({
  selector: 'app-notification-inbox-panel',
  templateUrl: './notification-inbox-panel.component.html',
  styleUrl: './notification-inbox-panel.component.scss',
})
export class NotificationInboxPanelComponent {
  @Input() items: NotificationItem[] = [];
  @Input() total = 0;
  @Input() loading = false;
  @Input() error = false;
  @Input() unreadCount = 0;

  @Output() markOne = new EventEmitter<number>();
  @Output() markAllRead = new EventEmitter<void>();
  @Output() retry = new EventEmitter<void>();

  // First-load spinner only — a background refresh with cached items must
  // NOT re-show it (stale-while-revalidate).
  protected get showInitialLoading(): boolean {
    return this.loading && this.items.length === 0;
  }

  protected get showError(): boolean {
    return this.error && this.items.length === 0;
  }

  protected get showEmpty(): boolean {
    return !this.showInitialLoading && !this.showError && this.items.length === 0;
  }

  protected get showFooter(): boolean {
    return this.total > this.items.length;
  }

  protected onRowOpen(id: number): void {
    this.markOne.emit(id);
  }
}
