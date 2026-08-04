import { Component, OnDestroy, OnInit } from '@angular/core';
import { IsActiveMatchOptions, NavigationEnd } from '@angular/router';
import { EMPTY, catchError, filter, merge, switchMap, takeUntil, timer } from 'rxjs';
import { SidebarLayoutBaseComponent } from '../../shared/sidebar-layout/sidebar-layout-base.component';
import { AdminApiService } from '../../services/admin/admin-api.service';
import { UsabilityReportBadgeRefreshService } from '../../shared/services/usability-report-badge-refresh.service';
import { BadgeSocketService } from '../../services/admin/badge-socket.service';
import { NotificationInboxService } from '../../shared/services/notification-inbox.service';
import { UsabilityReportStatus } from '../../shared/interfaces/usability-report.interface';
import { SYSTEM_SETTINGS_ROLES } from './pages/system-settings/system-settings-tabs';
import { NavSearchHighlightSegment, buildHighlightSegments } from '../../shared/lib/nav-search-highlight';

interface AdminNavItem {
  path: string;
  labelKey: string;
  icon: string;
  showBadge?: boolean;
  // OBRS-290: i18n key of the menu's description (reuses each route's existing
  // subtitleKey) so the sidebar search can match on what a menu *does*, not
  // just its name — the user often recalls the function but not the label.
  descriptionKey?: string;
  // OBRS-900: precomputed highlight segments for the CURRENT query, built once
  // per applyNavSearch() call (query or language change) — never recomputed in
  // the template, per the same stable-field/no-getter change-detection rule
  // this file already documents for navItems/filteredNavItems/
  // filteredNavSections. `undefined` whenever no query is active (or, for
  // descriptionSegments, whenever the item has no descriptionKey) — the
  // template treats presence/absence as the single switch between the
  // plain "today" rendering and the highlighted one, rather than re-checking
  // navSearchQuery a second time.
  labelSegments?: NavSearchHighlightSegment[];
  descriptionSegments?: NavSearchHighlightSegment[];
  // OBRS-289: which nav section this item belongs to (see SECTION_ORDER).
  section: NavSectionKey;
  // OBRS-702: highlight this entry for its whole subtree, not just its exact
  // URL. Only 'settings' needs it — it is the one entry whose page lives at a
  // CHILD route (/admin/settings/<tab>), so under the default exact match the
  // sidebar would un-highlight the moment the tab redirect fired and the user
  // would be on a page the menu says they are not on. Left off everywhere else
  // deliberately: exact matching is what keeps sibling paths from lighting up
  // each other, and this is an opt-in, not a new default.
  matchSubtree?: boolean;
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

// OBRS-939: the two `routerLinkActiveOptions` values, as module-level frozen
// singletons. Identity is the point, not the values: `RouterLinkActive` reads
// this as an @Input, so a fresh object per change-detection cycle makes its
// ngOnChanges fire forever (see navLinkActiveMatch below). There are exactly two
// shapes because `matchSubtree` is the only thing that varies, so two constants
// cover every nav item. `Object.freeze` so a future caller cannot mutate the
// instance every link is sharing.
const NAV_MATCH_EXACT: IsActiveMatchOptions = Object.freeze({
  paths: 'exact',
  queryParams: 'ignored',
  matrixParams: 'ignored',
  fragment: 'ignored',
});

const NAV_MATCH_SUBTREE: IsActiveMatchOptions = Object.freeze({
  paths: 'subset',
  queryParams: 'ignored',
  matrixParams: 'ignored',
  fragment: 'ignored',
});

// Cadence for the "Usability Reports" nav badge count. Separate from
// ADMIN_POLL_INTERVAL_MS (admin-auto-refresh.ts) — that constant tunes the
// operational list pages (bookings/dashboard); this is a lightweight,
// always-on sidebar indicator with its own, deliberately slower cadence.
const NEW_REPORT_COUNT_POLL_MS = 60_000;

@Component({
    selector: 'app-admin-layout',
    templateUrl: './admin-layout.component.html',
    styleUrl: './admin-layout.component.scss',
    standalone: false
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
  //
  // OBRS-939 widened this rule, because the browser was hard-locked again by
  // something this wording did not cover: the rule is not about GETTERS, it is
  // about ALLOCATION. Any template expression that builds a new object or array
  // per change-detection cycle — a getter, a method call, an inline `{...}`
  // Angular cannot memoise — and feeds it to a directive @Input is the same
  // defect, because directive inputs are compared by identity. `[routerLink]`,
  // `[routerLinkActiveOptions]` and `*ngFor` on these nav links are all such
  // inputs. Enforced now, not just written down: the unit tripwire below
  // navLinkActiveMatch and e2e/tests/obrs-939-admin-shell-responsive.spec.ts.
  protected navItems: AdminNavItem[] = [];

  // OBRS-586: sidebar active-state. The nav links previously used the boolean
  // `[routerLinkActiveOptions]="{ exact: ... }"` form, which expands to
  // `queryParams: 'exact'` — so the active highlight was LOST the instant the URL
  // carried any query param, matrix param, or fragment (e.g. an admin page
  // reflecting a filter/page into the URL). This returns an explicit
  // IsActiveMatchOptions that still honours each item's `matchSubtree` for PATH
  // matching (exact for a leaf, subset for a parent that should stay lit on its
  // children), while ignoring query params / matrix params / fragment so the
  // highlight tracks the page you are on rather than the exact query string.
  //
  // OBRS-939: it must return one of the two SHARED constants above rather than
  // building the object here. Constructing it per call gave RouterLinkActive a
  // new object identity on every change-detection cycle, so its ngOnChanges
  // fired every cycle and its update() scheduled a microtask every cycle;
  // zone.js therefore never saw an empty microtask queue for long,
  // onMicrotaskEmpty kept re-running ApplicationRef.tick(), and the loop never
  // terminated. The whole admin shell stopped answering clicks, timers and
  // page.evaluate a few seconds after every page load, whether its API calls
  // succeeded or failed — measured on /admin/dashboard and all five analytics
  // pages, permanent (no recovery inside 60 s), while /staff/sell stayed at a
  // 231 ms worst-case gap because StaffLayoutComponent still binds the inline
  // literal `{ exact: false }`, which Angular memoises into a stable instance.
  //
  // The comment on `navItems` above already warned that a GETTER returning a new
  // array each cycle "hard-locks the browser". This was the same defect wearing
  // a method call, on the same element, and that warning did not cover it —
  // hence obrs-939-admin-shell-responsive.spec.ts, which measures the property
  // this reasoning is about instead of restating it.
  protected navLinkActiveMatch(item: AdminNavItem): IsActiveMatchOptions {
    return item.matchSubtree ? NAV_MATCH_SUBTREE : NAV_MATCH_EXACT;
  }

  // OBRS-290: sidebar menu search. `filteredNavItems` is a stable field
  // recomputed only on query/language change — NOT a getter, for the same
  // *ngFor + change-detection reason as navItems above.
  // OBRS-794: this comment used to claim filteredNavItems was "what the
  // template renders". It has not been since OBRS-289 moved rendering onto
  // filteredNavSections below; filteredNavItems is now only the intermediate
  // that buildSections() groups. Believing the stale comment is how the
  // empty-query path shipped without rebuilding the sections.
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
      // OBRS-1022. Master data, next to `routes` — a route is composed of stops, and until
      // this card a stop could only be edited by hand-crafting a PUT.
      { path: 'stops', labelKey: 'ADMIN.PAGES.STOPS', icon: 'place', descriptionKey: 'ADMIN.STOPS.SUBTITLE', section: 'master' },
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
      { path: 'ops-efficiency', labelKey: 'ADMIN.PAGES.OPS_EFFICIENCY', icon: 'speed', descriptionKey: 'ADMIN.OPS_EFFICIENCY.SUBTITLE', section: 'reports' },
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

    // OBRS-286: manual refund worklist — OWNER-only (route `requiredRoles:
    // ['owner']` — the backend GET it reads requires OWNER, K9), same gating
    // shape as Settlements directly above.
    if (this.authService.hasAnyRole(['owner'])) {
      items.push({
        path: 'manual-refunds',
        labelKey: 'ADMIN.PAGES.MANUAL_REFUNDS',
        icon: 'account_balance',
        descriptionKey: 'ADMIN.MANUAL_REFUNDS.SUBTITLE',
        section: 'operations',
      });
    }

    // OBRS-844: cash-refund approvals — OWNER-only, same gating shape as the
    // manual-refund worklist directly above (both backend doors are
    // hasRole('OWNER')). Sits beside it in 'operations' on purpose: both are
    // money the owner personally signs off, and this is the one an owner opens
    // when a salesperson calls to say a customer is waiting at the counter.
    if (this.authService.hasAnyRole(['owner'])) {
      items.push({
        path: 'cash-refund-approvals',
        labelKey: 'ADMIN.PAGES.CASH_REFUND_APPROVALS',
        icon: 'how_to_reg',
        descriptionKey: 'ADMIN.CASH_REFUND_APPROVALS.SUBTITLE',
        section: 'operations',
      });
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

    // OBRS-702: ONE entry for every config page. This used to be four —
    // reminder timing (OBRS-223), jump seat (OBRS-358), booking policy
    // (OBRS-564) and config change history (OBRS-576) — all editing rows of
    // the SAME `system_configs` table, so the owner had to remember which
    // menu held the number they wanted. They are tabs of /admin/settings now
    // (system-settings-tabs.ts), and the queue holds at least three more
    // groups (OBRS-699/703/705) that would each have added another entry.
    //
    // Gated on the union of the tabs' roles, mirroring the shell route's own
    // `requiredRoles`. The four entries this replaces were gated on ['admin'],
    // ['admin'], ['admin','owner'] and ['admin','owner'] — which under
    // ROLE_GRANTS is ONE predicate (owner grants admin and admin grants owner,
    // auth.service.ts:60-62), so both roles saw all four and both see this one.
    // Access is unchanged in both directions. The tabs stay individually gated
    // inside the page so they follow their own guards the day owner-scoping
    // makes those values differ.
    if (this.authService.hasAnyRole([...SYSTEM_SETTINGS_ROLES])) {
      items.push({
        path: 'settings',
        labelKey: 'ADMIN.PAGES.SYSTEM_SETTINGS',
        icon: 'settings',
        descriptionKey: 'ADMIN.SYSTEM_SETTINGS.SUBTITLE',
        section: 'system',
        matchSubtree: true,
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
  //
  // OBRS-794: single exit, one assignment site per derived field. The empty
  // query used to take an early `return` that set filteredNavItems and never
  // touched filteredNavSections — so on every path that empties the query
  // (backspacing to blank, the × button, Escape, clicking a result) the
  // sidebar stayed frozen on the last non-empty query's sections, which is the
  // ONLY thing the template renders. Keeping the branch inside the expression
  // means a future third derived field cannot be forgotten on one path.
  protected applyNavSearch(query: string): void {
    this.navSearchQuery = query;
    const q = query.trim().toLowerCase();
    this.filteredNavItems = q
      ? this.navItems.filter((item) => {
          const label = this.translate.instant(item.labelKey).toLowerCase();
          const description = item.descriptionKey
            ? this.translate.instant(item.descriptionKey).toLowerCase()
            : '';
          return label.includes(q) || description.includes(q);
        })
      : this.navItems;

    // OBRS-900: precompute highlight segments for EVERY item here (query or
    // language change), never in the template — same CD-safety rule as the
    // fields above. Segments live on the item objects themselves, which
    // navItems and filteredNavItems already share by reference, so this is
    // one assignment site regardless of which list a given item currently
    // sits in. Cleared to `undefined` when the (trimmed) query is blank —
    // deliberately the SAME trim this method already applies to `q` above, so
    // a whitespace-only query behaves identically for highlighting as it
    // already does for filtering (matches nothing extra, shows everything).
    const rawQuery = query.trim();
    this.navItems.forEach((item) => {
      if (!rawQuery) {
        item.labelSegments = undefined;
        item.descriptionSegments = undefined;
        return;
      }
      item.labelSegments = buildHighlightSegments(this.translate.instant(item.labelKey), rawQuery);
      item.descriptionSegments = item.descriptionKey
        ? buildHighlightSegments(this.translate.instant(item.descriptionKey), rawQuery)
        : undefined;
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
