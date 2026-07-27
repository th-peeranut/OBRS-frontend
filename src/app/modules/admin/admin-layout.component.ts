import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd } from '@angular/router';
import { EMPTY, catchError, filter, merge, switchMap, takeUntil, timer } from 'rxjs';
import { SidebarLayoutBaseComponent } from '../../shared/sidebar-layout/sidebar-layout-base.component';
import { AdminApiService } from '../../services/admin/admin-api.service';
import { UsabilityReportBadgeRefreshService } from '../../shared/services/usability-report-badge-refresh.service';
import { BadgeSocketService } from '../../services/admin/badge-socket.service';
import { NotificationInboxService } from '../../shared/services/notification-inbox.service';
import { UsabilityReportStatus } from '../../shared/interfaces/usability-report.interface';

interface AdminNavItem {
  path: string;
  labelKey: string;
  icon: string;
  showBadge?: boolean;
  // OBRS-290: i18n key of the menu's description (reuses each route's existing
  // subtitleKey) so the sidebar search can match on what a menu *does*, not
  // just its name — the user often recalls the function but not the label.
  descriptionKey?: string;
  // OBRS-289: which nav section this item belongs to (see SECTION_ORDER).
  section: NavSectionKey;
}

// OBRS-289: group the (long) admin nav into labelled sections so it scans
// faster. Purely presentational — grouping never changes which items are
// shown or their access (admin stays a full superset). Order here IS the
// render order top-to-bottom.
type NavSectionKey = 'overview' | 'master' | 'operations' | 'reports' | 'system';

interface AdminNavSection {
  key: NavSectionKey;
  titleKey: string;
  items: AdminNavItem[];
}

const SECTION_ORDER: { key: NavSectionKey; titleKey: string }[] = [
  { key: 'overview', titleKey: 'ADMIN.NAV.SECTION.OVERVIEW' },
  { key: 'master', titleKey: 'ADMIN.NAV.SECTION.MASTER_DATA' },
  { key: 'operations', titleKey: 'ADMIN.NAV.SECTION.OPERATIONS' },
  { key: 'reports', titleKey: 'ADMIN.NAV.SECTION.REPORTS' },
  { key: 'system', titleKey: 'ADMIN.NAV.SECTION.SYSTEM' },
];

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
  // OBRS-289: the rendered structure — filteredNavItems grouped into ordered
  // sections (empty sections dropped). Stable field, recomputed alongside
  // filteredNavItems; NOT a getter (same CD-safety rule as navItems above).
  protected filteredNavSections: AdminNavSection[] = [];

  // OBRS-196: Settlements is gated to owner/admin (route `requiredRoles:
  // ['owner']`; ROLE_GRANTS['admin'] includes 'owner', so admin is admitted
  // too). hasAnyRole(['owner']) alone is sufficient to cover both, mirroring
  // the route guard's own check.
  private buildNavItems(): AdminNavItem[] {
    // OBRS-290: each item's descriptionKey reuses the matching route's
    // subtitleKey (admin.module.ts) so search can match a menu by what it does.
    const items: AdminNavItem[] = [
      { path: 'dashboard', labelKey: 'ADMIN.PAGES.DASHBOARD', icon: 'dashboard', descriptionKey: 'ADMIN.DASHBOARD.SUBTITLE', section: 'overview' },
      { path: 'lookups', labelKey: 'ADMIN.PAGES.LOOKUP_SETTINGS', icon: 'settings_input_component', descriptionKey: 'ADMIN.LOOKUP.SUBTITLE', section: 'master' },
      { path: 'roles', labelKey: 'ADMIN.PAGES.ROLE_MANAGEMENT', icon: 'admin_panel_settings', descriptionKey: 'ADMIN.ROLES.SUBTITLE', section: 'master' },
      { path: 'users', labelKey: 'ADMIN.PAGES.USER_MANAGEMENT', icon: 'group', descriptionKey: 'ADMIN.USERS.SUBTITLE', section: 'master' },
      { path: 'vehicles', labelKey: 'ADMIN.PAGES.VEHICLE_MANAGEMENT', icon: 'directions_bus', descriptionKey: 'ADMIN.VEHICLES.SUBTITLE', section: 'master' },
      { path: 'routes', labelKey: 'ADMIN.PAGES.ROUTE_MANAGEMENT', icon: 'route', descriptionKey: 'ADMIN.ROUTES.SUBTITLE', section: 'master' },
      { path: 'schedules', labelKey: 'ADMIN.PAGES.SCHEDULES', icon: 'calendar_month', descriptionKey: 'ADMIN.SCHEDULES.SUBTITLE', section: 'master' },
      // OBRS-508: pushed conditionally below (owner-only), same gating shape
      // as settlements/reminder-config/jump-seat-config — kept out of this
      // always-shown array.
      { path: 'bookings', labelKey: 'ADMIN.PAGES.BOOKINGS_MANAGEMENT', icon: 'confirmation_number', descriptionKey: 'ADMIN.BOOKINGS.SUBTITLE', section: 'operations' },
      { path: 'promotions', labelKey: 'ADMIN.PAGES.PROMOTIONS', icon: 'sell', descriptionKey: 'ADMIN.PROMOTIONS.SUBTITLE', section: 'operations' },
      { path: 'usability-reports', labelKey: 'ADMIN.PAGES.USABILITY_REPORTS', icon: 'bug_report', showBadge: true, descriptionKey: 'ADMIN.USABILITY_REPORTS.SUBTITLE', section: 'reports' },
      { path: 'reports', labelKey: 'ADMIN.PAGES.REPORTS', icon: 'bar_chart', descriptionKey: 'ADMIN.REPORTS.SUBTITLE', section: 'reports' },
      { path: 'revenue-analytics', labelKey: 'ADMIN.PAGES.REVENUE_ANALYTICS', icon: 'monitoring', descriptionKey: 'ADMIN.REVENUE_ANALYTICS.SUBTITLE', section: 'reports' },
      { path: 'booking-trend', labelKey: 'ADMIN.PAGES.BOOKING_TREND', icon: 'insights', descriptionKey: 'ADMIN.BOOKING_TREND.SUBTITLE', section: 'reports' },
      { path: 'route-performance', labelKey: 'ADMIN.PAGES.ROUTE_PERFORMANCE', icon: 'alt_route', descriptionKey: 'ADMIN.ROUTE_PERFORMANCE.SUBTITLE', section: 'reports' },
      { path: 'customer-behavior', labelKey: 'ADMIN.PAGES.CUSTOMER_BEHAVIOR', icon: 'groups', descriptionKey: 'ADMIN.CUSTOMER_BEHAVIOR.SUBTITLE', section: 'reports' },
      // OBRS-231: EOD sales report — admin+owner (route `requiredRoles:
      // ['admin','owner']`), same audience as the base admin nav, so it lives
      // in the always-shown list (not role-gated further like settlements).
      { path: 'eod-sales-report', labelKey: 'ADMIN.PAGES.EOD_SALES_REPORT', icon: 'point_of_sale', descriptionKey: 'ADMIN.EOD_REPORT.SUBTITLE', section: 'reports' },
      // OBRS-98: refund/void summary report — same admin+owner audience (route
      // `requiredRoles: ['admin','owner']`) as eod-sales-report above.
      { path: 'refund-void-report', labelKey: 'ADMIN.PAGES.REFUND_VOID_REPORT', icon: 'currency_exchange', descriptionKey: 'ADMIN.REFUND_VOID_REPORT.SUBTITLE', section: 'reports' },
      // OBRS-99: cash/online reconciliation report — same admin+owner audience
      // (route `requiredRoles: ['admin','owner']`) as refund-void-report above.
      { path: 'cash-online-reconciliation-report', labelKey: 'ADMIN.PAGES.CASH_ONLINE_RECONCILIATION', icon: 'account_balance_wallet', descriptionKey: 'ADMIN.CASH_ONLINE_RECONCILIATION.SUBTITLE', section: 'reports' },
      // OBRS-685: vehicle/central expense log — admin+owner (route
      // `requiredRoles: ['admin','owner']`), same always-shown audience as
      // eod-sales-report above — operational record-keeping, not a report.
      { path: 'expenses', labelKey: 'ADMIN.PAGES.EXPENSES', icon: 'receipt_long', descriptionKey: 'ADMIN.EXPENSES.SUBTITLE', section: 'operations' },
    ];

    if (this.authService.hasAnyRole(['owner'])) {
      items.push({ path: 'settlements', labelKey: 'ADMIN.PAGES.SETTLEMENTS', icon: 'point_of_sale', descriptionKey: 'ADMIN.SETTLEMENTS.SUBTITLE', section: 'operations' });
    }

    // OBRS-508: cargo-capacity settings is OWNER-only (route `requiredRoles:
    // ['owner']` — the backend PUT it saves through requires OWNER), gated
    // the same way Settlements is gated directly above. Lives in 'master'
    // (fleet/vehicle-type data), next to Vehicles.
    if (this.authService.hasAnyRole(['owner'])) {
      items.push({
        path: 'cargo-capacity',
        labelKey: 'ADMIN.PAGES.CARGO_CAPACITY',
        icon: 'local_shipping',
        descriptionKey: 'ADMIN.CARGO_CAPACITY.SUBTITLE',
        section: 'master',
      });
    }

    // OBRS-509: vehicle-inspection checklist master list is OWNER-only (route
    // `requiredRoles: ['owner']` — every backend endpoint it saves through
    // requires OWNER), gated the same way as cargo-capacity above. Lives in
    // 'master' (fleet/vehicle data), next to Vehicles/Cargo Capacity.
    if (this.authService.hasAnyRole(['owner'])) {
      items.push({
        path: 'inspection-items',
        labelKey: 'ADMIN.PAGES.INSPECTION_ITEMS',
        icon: 'checklist',
        descriptionKey: 'ADMIN.INSPECTION_ITEMS.SUBTITLE',
        section: 'master',
      });
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
        section: 'system',
      });
    }

    // OBRS-358: jump-seat (walk-in-only seat channel) toggle is ADMIN-only
    // (route `requiredRoles: ['admin']`), gated the same way as
    // reminder-config directly above.
    if (this.authService.hasAnyRole(['admin'])) {
      items.push({
        path: 'jump-seat-config',
        labelKey: 'ADMIN.PAGES.JUMP_SEAT_CONFIG',
        icon: 'event_seat',
        descriptionKey: 'ADMIN.JUMP_SEAT_CONFIG.SUBTITLE',
        section: 'system',
      });
    }

    // OBRS-564: booking-policy config — route `requiredRoles: ['admin',
    // 'owner']` (the backend PUT guard is hasRole('OWNER'); ROLE_GRANTS
    // admits ADMIN automatically), so the nav gate mirrors the route gate
    // with the same hasAnyRole(['admin', 'owner']) check.
    if (this.authService.hasAnyRole(['admin', 'owner'])) {
      items.push({
        path: 'booking-policy-config',
        labelKey: 'ADMIN.PAGES.BOOKING_POLICY_CONFIG',
        icon: 'event_available',
        descriptionKey: 'ADMIN.BOOKING_POLICY_CONFIG.SUBTITLE',
        section: 'system',
      });
    }

    // OBRS-576: config change history — one general page over EVERY config
    // key (not a per-page panel), gated the same as booking-policy-config
    // directly above (route `requiredRoles: ['admin', 'owner']`) since
    // reading the history is granted to the same roles that can write it.
    // Placed last in 'system' — it is the "meta" view over everything else
    // in that section.
    if (this.authService.hasAnyRole(['admin', 'owner'])) {
      items.push({
        path: 'config-change-history',
        labelKey: 'ADMIN.PAGES.CONFIG_CHANGE_HISTORY',
        icon: 'history',
        descriptionKey: 'ADMIN.CONFIG_CHANGE_HISTORY.SUBTITLE',
        section: 'system',
      });
    }

    return items;
  }

  // OBRS-378: the sidebar badge is now role-split — owner defaults to
  // watching 'new' (awaiting screening), admin watches 'owner_accepted'
  // (OBRS-527: owner-screened, awaiting platform adoption — 'accepted' is
  // nobody's badge any more, see UsabilityReportCountBroadcastService). RAW
  // held role (authService.getRoles().includes('admin')), NEVER
  // hasAnyRole(['admin']) — under this FE's area-based access model an owner
  // satisfies hasAnyRole(['admin']) too (ROLE_GRANTS superset), which would
  // make the badge (and everything gated on it) behave as admin for an
  // owner. Mirrors the same raw-role precedent as
  // UsabilityReportsPageComponent.isAdmin (usability-reports-page.component.ts:92)
  // and ADR-0011's addendum.
  protected readonly badgeStatus: UsabilityReportStatus = this.authService
    .getRoles()
    .includes('admin')
    ? 'owner_accepted'
    : 'new';

  // Count of usability reports with status `badgeStatus`. Plain field (not a
  // getter) so it doesn't churn change detection like navItems above —
  // assigned once per fetch/poll tick. RENAMED from newReportCount (OBRS-378)
  // now that the badge no longer always tracks 'new'.
  protected badgeCount = 0;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly badgeRefreshService: UsabilityReportBadgeRefreshService,
    private readonly badgeSocketService: BadgeSocketService,
    private readonly notificationInboxService: NotificationInboxService
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
    this.filteredNavSections = this.buildSections(this.navItems);
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
    // OBRS-317: stop the notification-bell unread-count poll — the service
    // also self-tears-down on authStatus$ going false, but this mirrors the
    // explicit BadgeSocketService.disconnect() teardown above for the same
    // "leaving the shell" lifecycle moment.
    this.notificationInboxService.stopPolling();
    super.ngOnDestroy();
  }

  // Mirrors SidebarLayoutBaseComponent.onLogout() (success toast + navigate
  // to /login) but additionally tears down the WebSocket connection — a
  // logged-out session must not keep pushing badge-count frames.
  protected override onLogout(): void {
    this.badgeSocketService.disconnect();
    this.notificationInboxService.stopPolling();
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
    this.filteredNavSections = this.buildSections(this.filteredNavItems);
  }

  // OBRS-289: group a flat item list into the ordered sections of SECTION_ORDER,
  // dropping any section that has no items (so a role that lacks every item in a
  // section — or a search that filters one out entirely — hides its header too).
  private buildSections(items: AdminNavItem[]): AdminNavSection[] {
    return SECTION_ORDER.map(({ key, titleKey }) => ({
      key,
      titleKey,
      items: items.filter((item) => item.section === key),
    })).filter((section) => section.items.length > 0);
  }

  // OBRS-290: clear button / Escape resets the search to the full list.
  protected clearNavSearch(): void {
    this.applyNavSearch('');
  }

  // Fetches the usability-report badge count (status = badgeStatus) on
  // entering the admin area, then re-fetches every 60s, on every in-admin
  // NavigationEnd, and whenever UsabilityReportBadgeRefreshService.trigger()
  // fires (the detail page's silent auto-promote-on-open and decision-save
  // both call it, so the badge updates immediately instead of waiting for the
  // next poll/navigation). A failed tick is swallowed via catchError so the
  // outer subscription (and therefore the 60s interval) survives; the last
  // known count is kept on error. ADR-0011's single-fetch-path decision
  // holds: all three writers below still feed this one merge/switchMap.
  private watchNewReportCount(): void {
    merge(
      timer(0, NEW_REPORT_COUNT_POLL_MS),
      this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)),
      this.badgeRefreshService.refreshRequested$
    )
      .pipe(
        switchMap(() =>
          this.adminApiService
            .getUsabilityReportCountByStatus(this.badgeStatus)
            .pipe(catchError(() => EMPTY))
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((count) => {
        this.badgeCount = count;
      });

    // Optimistic same-tick badge adjustment (OBRS-174; status-gated OBRS-378):
    // the detail page's silent auto-promote knows it just moved one report out
    // of a status, so it nudges the count by a delta here instantly rather
    // than waiting on the authoritative GET above (a second live round-trip
    // after the promote PUT). A delta for a status this layout ISN'T
    // displaying is ignored — e.g. an admin's badge (badgeStatus='accepted')
    // must not react to a 'new'-tab adjustBy('new', -1) fired by another
    // admin's page interaction. Clamped at 0; the poll/navigation refetch
    // reconciles any drift.
    this.badgeRefreshService.countAdjustments$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ status, delta }) => {
        if (status !== this.badgeStatus) {
          return;
        }
        this.badgeCount = Math.max(0, this.badgeCount + delta);
      });

    // OBRS-147: real-time push over the STOMP WebSocket. A SEPARATE
    // subscription (not folded into the switchMap above) because the pushed
    // payload already carries the authoritative counts — no GET round-trip
    // needed, unlike the poll/NavigationEnd/refreshRequested$ signal above.
    // This is purely additive: if the socket never connects/reconnects, the
    // 60s poll and the other signals above keep the badge correct on their
    // own. OBRS-378/OBRS-527: the message carries BOTH counts; select the one
    // this layout's badgeStatus is watching. `?? 0` (not `|| 0`) guards a
    // version-skewed backend that hasn't deployed the OBRS-527 field rename
    // yet — a real zero count must still render as 0, only a missing/undefined
    // key should fall back.
    this.badgeSocketService.counts$
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => {
        this.badgeCount =
          this.badgeStatus === 'owner_accepted'
            ? message.ownerAcceptedReportCount ?? 0
            : message.newReportCount ?? 0;
      });
  }
}
