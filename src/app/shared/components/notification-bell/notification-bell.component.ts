import { Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Popover } from 'primeng/popover';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationInboxService } from '../../services/notification-inbox.service';
import { NotificationItem } from '../../interfaces/notification.interface';
import { ThemeService } from '../../services/theme.service';

/**
 * OBRS-317: notification bell + unread badge, mounted in the admin/staff
 * topbar (`.admin-topbar-actions`) next to `app-lang-switcher`. Opens a
 * `p-popover` hosting `AppNotificationInboxPanelComponent`. Both
 * `/admin` and `/staff` shells are route-guarded (`requiredRoles`), so a
 * customer session never renders this component — no component-level role
 * check needed here.
 *
 * Scrutinize fix (2026-07-14): `p-popover`'s `appendTo="body"` detaches
 * the panel from `.admin-shell`'s DOM subtree, so the `--admin-*`/`--accent-*`
 * CSS custom properties declared only on `.admin-shell`/`.admin-shell.is-dark`/
 * `.admin-shell.theme-*` (admin-theme.scss) never inherit down to it — mirrors
 * the same relocation issue already solved for `my-bookings-action-menu`
 * (`my-bookings.component.scss` + `dark-theme.scss` §"My-bookings action-menu").
 * The panel now carries a `styleClass` combining a shell-agnostic base class
 * with the caller-supplied `[shellVariant]` and the live dark-mode state, and
 * `admin-theme.scss` re-declares the handful of tokens the panel/row need,
 * scoped to that class (see `.notification-inbox-overlay*` rules there).
 */
@Component({
    selector: 'app-notification-bell',
    templateUrl: './notification-bell.component.html',
    styleUrl: './notification-bell.component.scss',
    standalone: false
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  // Which shell mounted this bell — drives the accent-variant class applied
  // to the body-appended overlay panel (`theme-admin` / `theme-staff`), since
  // the panel itself has no other way to know which `.admin-shell` variant is
  // active. Defaults to 'admin'; both current call sites (admin-layout,
  // staff-layout) pass their own value explicitly.
  @Input() shellVariant: 'admin' | 'staff' = 'admin';

  @ViewChild('overlayPanel') overlayPanel?: Popover;

  protected readonly unreadCount$: Observable<number>;
  protected readonly items$: Observable<NotificationItem[]>;
  protected readonly totalElements$: Observable<number>;
  protected readonly loading$: Observable<boolean>;
  protected readonly error$: Observable<boolean>;

  protected isDarkMode = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly notificationInboxService: NotificationInboxService,
    private readonly themeService: ThemeService
  ) {
    this.unreadCount$ = notificationInboxService.unreadCount$;
    this.items$ = notificationInboxService.items$;
    this.totalElements$ = notificationInboxService.totalElements$;
    this.loading$ = notificationInboxService.loading$;
    this.error$ = notificationInboxService.error$;
  }

  // The class applied (via `[styleClass]`) to the `p-popover`'s
  // `appendTo="body"` root — carries the accent-variant + dark-mode context
  // that `.admin-shell`'s own class list would otherwise supply, since the
  // panel is no longer a DOM descendant of `.admin-shell`.
  protected get overlayStyleClass(): string {
    const variantClass = this.shellVariant === 'staff' ? 'theme-staff' : 'theme-admin';
    return `notification-inbox-overlay ${variantClass}${this.isDarkMode ? ' is-dark' : ''}`;
  }

  ngOnInit(): void {
    this.notificationInboxService.startPolling();
    this.themeService.mode$.pipe(takeUntil(this.destroy$)).subscribe((mode) => {
      this.isDarkMode = mode === 'dark';
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
