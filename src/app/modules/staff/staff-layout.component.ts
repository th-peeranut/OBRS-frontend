import { Component, OnDestroy, OnInit } from '@angular/core';
import { SidebarLayoutBaseComponent } from '../../shared/sidebar-layout/sidebar-layout-base.component';
import { NotificationInboxService } from '../../shared/services/notification-inbox.service';

interface StaffNavItem {
  path: string;
  labelKey: string;
  icon: string;
}

@Component({
  selector: 'app-staff-layout',
  templateUrl: './staff-layout.component.html',
  styleUrl: './staff-layout.component.scss',
})
export class StaffLayoutComponent extends SidebarLayoutBaseComponent implements OnInit, OnDestroy {
  // ── Abstract member implementations ─────────────────────────────────────────
  protected readonly logoutSuccessKey = 'STAFF.LAYOUT.LOGOUT_SUCCESS';
  protected readonly defaultTitleKey = 'STAFF.PAGES.SELL';
  protected readonly defaultSubtitleKey = 'STAFF.LAYOUT.SUBTITLE';

  // Whether to surface the Admin Dashboard shortcut in the profile menu.
  // Under the area-based access model (see AuthService) both owner and admin
  // hold cross-portal access (OBRS-176), so this is an "owner/admin is here"
  // check: gate the shortcut on the admin grant so plain salespersons/drivers
  // — who cannot enter /admin — don't see a dead link.
  protected isAdmin = false;

  // Computed once in ngOnInit and held in a stable field. Must NOT be a getter:
  // a getter returning a fresh array each change-detection cycle, bound to an
  // *ngFor containing routerLinkActive, recreates those directives on every cycle
  // and never lets change detection stabilise — hard-locking the browser.
  protected navItems: StaffNavItem[] = [];

  private buildNavItems(): StaffNavItem[] {
    const isSalesperson = this.authService.hasAnyRole(['salesperson']);
    const isDriver = this.authService.hasAnyRole(['driver']);
    const items: StaffNavItem[] = [];

    if (isSalesperson) {
      items.push({ path: 'sell', labelKey: 'STAFF.NAV.SELL', icon: 'sell' });
      items.push({ path: 'schedules', labelKey: 'STAFF.NAV.SCHEDULES', icon: 'calendar_month' });
    }

    if (isDriver) {
      items.push({ path: 'driver', labelKey: 'STAFF.NAV.MY_SCHEDULES', icon: 'directions_bus' });
    }

    if (isSalesperson || isDriver) {
      items.push({ path: 'boarding', labelKey: 'STAFF.NAV.BOARDING', icon: 'how_to_reg' });
    }

    return items;
  }

  protected trackNavItem(_index: number, item: StaffNavItem): string {
    return item.path;
  }

  constructor(private readonly notificationInboxService: NotificationInboxService) {
    super();
  }

  override ngOnInit(): void {
    // Build nav items and check admin role before calling super so that the
    // route subscription (which fires synchronously via startWith) already has
    // navItems in place.
    this.navItems = this.buildNavItems();
    this.isAdmin = this.authService.hasAnyRole(['admin']);
    super.ngOnInit();
  }

  // OBRS-317: stop the notification-bell unread-count poll on leaving the
  // staff shell / logging out — the service also self-tears-down on
  // authStatus$ going false, this is the explicit per-layout teardown
  // mirroring AdminLayoutComponent's BadgeSocketService.disconnect() pattern.
  override ngOnDestroy(): void {
    this.notificationInboxService.stopPolling();
    super.ngOnDestroy();
  }

  protected override onLogout(): void {
    this.notificationInboxService.stopPolling();
    super.onLogout();
  }
}
