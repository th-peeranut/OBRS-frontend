import { Component, OnInit, ViewChild } from '@angular/core';
import { OverlayPanel } from 'primeng/overlaypanel';
import { Observable } from 'rxjs';
import { NotificationInboxService } from '../../services/notification-inbox.service';
import { NotificationItem } from '../../interfaces/notification.interface';

/**
 * OBRS-317: notification bell + unread badge, mounted in the admin/staff
 * topbar (`.admin-topbar-actions`) next to `app-lang-switcher`. Opens a
 * `p-overlayPanel` hosting `AppNotificationInboxPanelComponent`. Both
 * `/admin` and `/staff` shells are route-guarded (`requiredRoles`), so a
 * customer session never renders this component — no component-level role
 * check needed here.
 */
@Component({
  selector: 'app-notification-bell',
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent implements OnInit {
  @ViewChild('overlayPanel') overlayPanel?: OverlayPanel;

  protected readonly unreadCount$: Observable<number>;
  protected readonly items$: Observable<NotificationItem[]>;
  protected readonly totalElements$: Observable<number>;
  protected readonly loading$: Observable<boolean>;
  protected readonly error$: Observable<boolean>;

  constructor(private readonly notificationInboxService: NotificationInboxService) {
    this.unreadCount$ = notificationInboxService.unreadCount$;
    this.items$ = notificationInboxService.items$;
    this.totalElements$ = notificationInboxService.totalElements$;
    this.loading$ = notificationInboxService.loading$;
    this.error$ = notificationInboxService.error$;
  }

  ngOnInit(): void {
    this.notificationInboxService.startPolling();
  }

  protected togglePanel(event: Event): void {
    this.overlayPanel?.toggle(event);
  }

  protected onPanelShow(): void {
    this.notificationInboxService.refreshOnOpen();
  }

  protected onMarkOne(id: number): void {
    this.notificationInboxService.markOne(id);
  }

  protected onMarkAllRead(): void {
    this.notificationInboxService.markAllRead();
  }

  protected onRetry(): void {
    this.notificationInboxService.refreshOnOpen();
  }
}
