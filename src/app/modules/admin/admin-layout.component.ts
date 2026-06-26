import { Component, OnInit } from '@angular/core';
import { SidebarLayoutBaseComponent } from '../../shared/sidebar-layout/sidebar-layout-base.component';

interface AdminNavItem {
  path: string;
  labelKey: string;
  icon: string;
}

@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent extends SidebarLayoutBaseComponent implements OnInit {
  // ── Abstract member implementations ─────────────────────────────────────────
  protected readonly logoutSuccessKey = 'ADMIN.LAYOUT.LOGOUT_SUCCESS';
  protected readonly defaultTitleKey = 'ADMIN.PAGES.DEFAULT';
  protected readonly defaultSubtitleKey = 'ADMIN.LAYOUT.SUBTITLE';

  // Computed once at class-definition time. Must NOT be a getter — a getter
  // returning a new array each cycle breaks *ngFor + routerLinkActive, causing
  // change detection never to stabilise (hard-locks the browser).
  protected readonly navItems: AdminNavItem[] = [
    { path: 'dashboard', labelKey: 'ADMIN.PAGES.DASHBOARD', icon: 'dashboard' },
    { path: 'lookups', labelKey: 'ADMIN.PAGES.LOOKUP_SETTINGS', icon: 'settings_input_component' },
    { path: 'roles', labelKey: 'ADMIN.PAGES.ROLE_MANAGEMENT', icon: 'admin_panel_settings' },
    { path: 'users', labelKey: 'ADMIN.PAGES.USER_MANAGEMENT', icon: 'group' },
    { path: 'vehicles', labelKey: 'ADMIN.PAGES.VEHICLE_MANAGEMENT', icon: 'directions_bus' },
    { path: 'routes', labelKey: 'ADMIN.PAGES.ROUTE_MANAGEMENT', icon: 'route' },
    { path: 'schedules', labelKey: 'ADMIN.PAGES.SCHEDULES', icon: 'calendar_month' },
    { path: 'bookings', labelKey: 'ADMIN.PAGES.BOOKINGS_MANAGEMENT', icon: 'confirmation_number' },
  ];

  // Gate the Staff Area shortcut in the profile menu on the salesperson/driver
  // roles so admins who are not also staff don't see a link they cannot use.
  protected get isStaffUser(): boolean {
    return this.authService.hasAnyRole(['salesperson', 'driver']);
  }

  override ngOnInit(): void {
    super.ngOnInit();
  }
}
