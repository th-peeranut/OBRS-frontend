import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd } from '@angular/router';
import { EMPTY, catchError, filter, merge, switchMap, takeUntil, timer } from 'rxjs';
import { SidebarLayoutBaseComponent } from '../../shared/sidebar-layout/sidebar-layout-base.component';
import { AdminApiService } from '../../services/admin/admin-api.service';
import { UsabilityReportBadgeRefreshService } from '../../shared/services/usability-report-badge-refresh.service';
import { BadgeSocketService } from '../../services/admin/badge-socket.service';

interface AdminNavItem {
  path: string;
  labelKey: string;
  icon: string;
  showBadge?: boolean;
  // OBRS-290: i18n key of the menu's description (reuses each route's existing
  // subtitleKey) so the sidebar search can match on what a menu *does*, not
  // just its name — the user often recalls the function but not the label.
  descriptionKey?: string;
}

// Cadence for the "Usability Reports" nav badge count. Separate from
// ADMIN_POLL_INTERVAL_MS (admin-auto-refresh.ts) — that constant tunes the
// operational list pages (bookings/dashboard); this is a lightweight,
// always-on sidebar indicator with its own, deliberately slower cadence.
const NEW_REPORT_COUNT_POLL_MS = 60_000;

@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent extends SidebarLayoutBaseComponent implements OnInit, OnDestroy {
  // ── Abstract member implementations ─────────────────────────────────────────
  protected readonly logoutSuccessKey = 'ADMIN.LAYOUT.LOGOUT_SUCCESS';
  protected readonly defaultTitleKey = 'ADMIN.PAGES.DEFAULT';
  protected readonly defaultSubtitleKey = 'ADMIN.LAYOUT.SUBTITLE';

  // Computed once in ngOnInit (via buildNavItems(), below) and held in a
  // stable field. Must NOT be a getter — a getter returning a new array each
  // cycle breaks *ngFor + routerLinkActive, causing change detection never to
  // stabilise (hard-locks the browser). Mirrors StaffLayoutComponent's
  // navItems, which is built the same way to role-gate its own entries.
  protected navItems: AdminNavItem[] = [];

  // OBRS-290: sidebar menu search. `filteredNavItems` (what the template
  // renders) is a stable field recomputed only on query/language change — NOT
  // a getter, for the same *ngFor + change-detection reason as navItems above.
  protected navSearchQuery = '';
  protected filteredNavItems: AdminNavItem[] = [];

  // OBRS-196: Settlements is gated to owner/admin (route `requiredRoles:
  // ['owner']`; ROLE_GRANTS['admin'] includes 'owner', so admin is admitted
  // too). hasAnyRole(['owner']) alone is sufficient to cover both, mirroring
  // the route guard's own check.
  private buildNavItems(): AdminNavItem[] {
    // OBRS-290: each item's descriptionKey reuses the matching route's
    // subtitleKey (admin.module.ts) so search can match a menu by what it does.
    const items: AdminNavItem[] = [
      { path: 'dashboard', labelKey: 'ADMIN.PAGES.DASHBOARD', icon: 'dashboard', descriptionKey: 'ADMIN.DASHBOARD.SUBTITLE' },
      { path: 'lookups', labelKey: 'ADMIN.PAGES.LOOKUP_SETTINGS', icon: 'settings_input_component', descriptionKey: 'ADMIN.LOOKUP.SUBTITLE' },
      { path: 'roles', labelKey: 'ADMIN.PAGES.ROLE_MANAGEMENT', icon: 'admin_panel_settings', descriptionKey: 'ADMIN.ROLES.SUBTITLE' },
      { path: 'users', labelKey: 'ADMIN.PAGES.USER_MANAGEMENT', icon: 'group', descriptionKey: 'ADMIN.USERS.SUBTITLE' },
      { path: 'vehicles', labelKey: 'ADMIN.PAGES.VEHICLE_MANAGEMENT', icon: 'directions_bus', descriptionKey: 'ADMIN.VEHICLES.SUBTITLE' },
      { path: 'routes', labelKey: 'ADMIN.PAGES.ROUTE_MANAGEMENT', icon: 'route', descriptionKey: 'ADMIN.ROUTES.SUBTITLE' },
      { path: 'schedules', labelKey: 'ADMIN.PAGES.SCHEDULES', icon: 'calendar_month', descriptionKey: 'ADMIN.SCHEDULES.SUBTITLE' },
      { path: 'bookings', labelKey: 'ADMIN.PAGES.BOOKINGS_MANAGEMENT', icon: 'confirmation_number', descriptionKey: 'ADMIN.BOOKINGS.SUBTITLE' },
      { path: 'promotions', labelKey: 'ADMIN.PAGES.PROMOTIONS', icon: 'sell', descriptionKey: 'ADMIN.PROMOTIONS.SUBTITLE' },
      { path: 'usability-reports', labelKey: 'ADMIN.PAGES.USABILITY_REPORTS', icon: 'bug_report', showBadge: true, descriptionKey: 'ADMIN.USABILITY_REPORTS.SUBTITLE' },
      { path: 'reports', labelKey: 'ADMIN.PAGES.REPORTS', icon: 'bar_chart', descriptionKey: 'ADMIN.REPORTS.SUBTITLE' },
      // OBRS-231: EOD sales report — admin+owner (route `requiredRoles:
      // ['admin','owner']`), same audience as the base admin nav, so it lives
      // in the always-shown list (not role-gated further like settlements).
      { path: 'eod-sales-report', labelKey: 'ADMIN.PAGES.EOD_SALES_REPORT', icon: 'point_of_sale', descriptionKey: 'ADMIN.EOD_REPORT.SUBTITLE' },
      // OBRS-98: refund/void summary report — same admin+owner audience (route
      // `requiredRoles: ['admin','owner']`) as eod-sales-report above.
      { path: 'refund-void-report', labelKey: 'ADMIN.PAGES.REFUND_VOID_REPORT', icon: 'currency_exchange', descriptionKey: 'ADMIN.REFUND_VOID_REPORT.SUBTITLE' },
      // OBRS-99: cash/online reconciliation report — same admin+owner audience
      // (route `requiredRoles: ['admin','owner']`) as refund-void-report above.
      { path: 'cash-online-reconciliation-report', labelKey: 'ADMIN.PAGES.CASH_ONLINE_RECONCILIATION', icon: 'account_balance_wallet', descriptionKey: 'ADMIN.CASH_ONLINE_RECONCILIATION.SUBTITLE' },
    ];

    if (this.authService.hasAnyRole(['owner'])) {
      items.push({ path: 'settlements', labelKey: 'ADMIN.PAGES.SETTLEMENTS', icon: 'point_of_sale', descriptionKey: 'ADMIN.SETTLEMENTS.SUBTITLE' });
    }

    // OBRS-223: reminder-timing config is ADMIN-only (route `requiredRoles:
    // ['admin']`), so it's gated the same way Settlements is gated above,
    // just on the admin role instead of owner.
    if (this.authService.hasAnyRole(['admin'])) {
      items.push({
        path: 'reminder-config',
        labelKey: 'ADMIN.PAGES.REMINDER_CONFIG',
        icon: 'notifications_active',
        descriptionKey: 'ADMIN.REMINDER_CONFIG.SUBTITLE',
      });
    }

    return items;
  }

  // Count of usability reports with status 'new'. Plain field (not a getter)
  // so it doesn't churn change detection like navItems above — assigned once
  // per fetch/poll tick.
  protected newReportCount = 0;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly badgeRefreshService: UsabilityReportBadgeRefreshService,
    private readonly badgeSocketService: BadgeSocketService
  ) {
    super();
  }

  // Gate the Staff Area shortcut in the profile menu on the salesperson/driver
  // grant. Under the area-based access model (see AuthService) both owner and
  // admin hold cross-portal access (OBRS-176), so an admin correctly sees and
  // can use this link, alongside owner and actual staff (salesperson/driver).
  protected get isStaffUser(): boolean {
    return this.authService.hasAnyRole(['salesperson', 'driver']);
  }

  override ngOnInit(): void {
    // Build nav items before calling super so the route subscription (which
    // fires synchronously via startWith) already has navItems in place —
    // mirrors StaffLayoutComponent.ngOnInit's ordering.
    this.navItems = this.buildNavItems();
    this.filteredNavItems = this.navItems;
    super.ngOnInit();
    this.watchNewReportCount();

    // OBRS-147: real-time push for the same badge — additive to the poll /
    // NavigationEnd / countAdjustments$ signals above, not a replacement.
    // See watchNewReportCount()'s comment for why this stays a separate
    // subscription rather than folding into the switchMap there.
    this.badgeSocketService.connect();

    // OBRS-290: re-run the filter when the language changes, so a query typed
    // in one language keeps matching against the freshly-translated labels /
    // descriptions rather than going stale on the previous language's strings.
    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.applyNavSearch(this.navSearchQuery));
  }

  override ngOnDestroy(): void {
    this.badgeSocketService.disconnect();
    super.ngOnDestroy();
  }

  // Mirrors SidebarLayoutBaseComponent.onLogout() (success toast + navigate
  // to /login) but additionally tears down the WebSocket connection — a
  // logged-out session must not keep pushing badge-count frames.
  protected override onLogout(): void {
    this.badgeSocketService.disconnect();
    super.onLogout();
  }

  // OBRS-290: filter nav items by matching the (trimmed, lower-cased) query
  // against each item's translated label AND translated description. An empty
  // query restores the full list. Called from the search input's ngModelChange.
  protected applyNavSearch(query: string): void {
    this.navSearchQuery = query;
    const q = query.trim().toLowerCase();
    if (!q) {
      this.filteredNavItems = this.navItems;
      return;
    }
    this.filteredNavItems = this.navItems.filter((item) => {
      const label = this.translate.instant(item.labelKey).toLowerCase();
      const description = item.descriptionKey
        ? this.translate.instant(item.descriptionKey).toLowerCase()
        : '';
      return label.includes(q) || description.includes(q);
    });
  }

  // OBRS-290: clear button / Escape resets the search to the full list.
  protected clearNavSearch(): void {
    this.applyNavSearch('');
  }

  // Fetches the new-usability-report count on entering the admin area, then
  // re-fetches every 60s, on every in-admin NavigationEnd, and whenever
  // UsabilityReportBadgeRefreshService.trigger() fires (the detail page's
  // silent auto-promote-on-open and decision-save both call it, so the badge
  // updates immediately instead of waiting for the next poll/navigation).
  // A failed tick is swallowed via catchError so the outer subscription (and
  // therefore the 60s interval) survives; the last known count is kept on error.
  private watchNewReportCount(): void {
    merge(
      timer(0, NEW_REPORT_COUNT_POLL_MS),
      this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)),
      this.badgeRefreshService.refreshRequested$
    )
      .pipe(
        switchMap(() =>
          this.adminApiService.getNewUsabilityReportCount().pipe(catchError(() => EMPTY))
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((count) => {
        this.newReportCount = count;
      });

    // Optimistic same-tick badge adjustment (OBRS-174): the detail page's
    // silent auto-promote knows it just moved one report out of 'new', so it
    // nudges the count by -1 here instantly rather than waiting on the
    // authoritative GET above (a second live round-trip after the promote PUT).
    // Clamped at 0; the poll/navigation refetch reconciles any drift.
    this.badgeRefreshService.countAdjustments$
      .pipe(takeUntil(this.destroy$))
      .subscribe((delta) => {
        this.newReportCount = Math.max(0, this.newReportCount + delta);
      });

    // OBRS-147: real-time push over the STOMP WebSocket. A SEPARATE
    // subscription (not folded into the switchMap above) because the pushed
    // payload already carries the authoritative count — no GET round-trip
    // needed, unlike the poll/NavigationEnd/refreshRequested$ signal above.
    // This is purely additive: if the socket never connects/reconnects, the
    // 60s poll and the other signals above keep the badge correct on their own.
    this.badgeSocketService.count$
      .pipe(takeUntil(this.destroy$))
      .subscribe((count) => {
        this.newReportCount = count;
      });
  }
}
