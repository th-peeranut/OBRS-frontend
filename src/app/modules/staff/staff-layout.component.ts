import { Component, OnDestroy, OnInit } from '@angular/core';
import { SidebarLayoutBaseComponent } from '../../shared/sidebar-layout/sidebar-layout-base.component';
import { NotificationInboxService } from '../../shared/services/notification-inbox.service';
import { environment } from '../../../environments/environment';

interface StaffNavItem {
  path: string;
  labelKey: string;
  icon: string;
  // OBRS-573: which nav section this item belongs to (see SECTION_ORDER).
  section: NavSectionKey;
}

// OBRS-573: group the staff nav into labelled sections, the same way the admin
// nav has been grouped since OBRS-289. Purely presentational — grouping never
// changes which items are shown or who may reach them. A section is a heading
// over links that stay ONE click away, deliberately not a submenu to expand:
// the parcel screens are opened several times per trip, so an extra click on
// each is a real daily cost (the trade-off argued on OBRS-543 and settled by
// the owner there). Order here IS the render order, top to bottom.
type NavSectionKey = 'sales' | 'operations' | 'parcels';

interface StaffNavSection {
  key: NavSectionKey;
  titleKey: string;
  items: StaffNavItem[];
}

const SECTION_ORDER: { key: NavSectionKey; titleKey: string }[] = [
  { key: 'sales', titleKey: 'STAFF.NAV.SECTION.SALES' },
  { key: 'operations', titleKey: 'STAFF.NAV.SECTION.OPERATIONS' },
  { key: 'parcels', titleKey: 'STAFF.NAV.SECTION.PARCELS' },
];

@Component({
    selector: 'app-staff-layout',
    templateUrl: './staff-layout.component.html',
    styleUrl: './staff-layout.component.scss',
    standalone: false
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

  // OBRS-573: what the template actually renders — navItems grouped into the
  // ordered, non-empty sections. Stable field for the same change-detection
  // reason as navItems above; NEVER a getter. navItems is kept alongside it
  // because nav-reachability.spec.ts reads it as the flat nav model.
  protected navSections: StaffNavSection[] = [];

  private buildNavItems(): StaffNavItem[] {
    const isSalesperson = this.authService.hasAnyRole(['salesperson']);
    const isDriver = this.authService.hasAnyRole(['driver']);
    const items: StaffNavItem[] = [];

    if (isSalesperson) {
      items.push({ path: 'sell', labelKey: 'STAFF.NAV.SELL', icon: 'sell', section: 'sales' });
      items.push({ path: 'schedules', labelKey: 'STAFF.NAV.SCHEDULES', icon: 'calendar_month', section: 'sales' });
      // OBRS-766: counter act-on-behalf cancel — salesperson-only, sibling of
      // sell/schedules (no new section header). Both this push and the
      // route's requiredRoles (staff.module.ts) live inside isSalesperson, so
      // a driver gets neither the link nor route access.
      items.push({ path: 'cancel-booking', labelKey: 'STAFF.NAV.CANCEL_BOOKING', icon: 'cancel', section: 'sales' });
      // OBRS-424: fleet-map is salesperson-only (route data.requiredRoles),
      // so the nav link lives ONLY in this branch — a driver, who would 403
      // on the route itself, never sees a link to it (UX-OBRS-424 §1).
      // OBRS-622: also gated behind environment.features.fleetMap (go-live
      // scope cut) — flip that one value to restore the link for every
      // salesperson without touching this branch.
      if (environment.features.fleetMap) {
        items.push({ path: 'fleet-map', labelKey: 'STAFF.NAV.FLEET_MAP', icon: 'map', section: 'operations' });
      }
    }

    if (isDriver) {
      items.push({ path: 'driver', labelKey: 'STAFF.NAV.MY_SCHEDULES', icon: 'directions_bus', section: 'operations' });
    }

    if (isSalesperson || isDriver) {
      items.push({ path: 'boarding', labelKey: 'STAFF.NAV.BOARDING', icon: 'how_to_reg', section: 'operations' });
      // OBRS-1147: the holder's own ค่าหัว. Both roles, matching the route's own
      // requiredRoles exactly — nav-reachability.spec.ts enforces that pairing,
      // and AC-4 is the reason the driver is included (a driver simply has no
      // PER_HEAD lines today and sees zero, which is the truthful answer).
      // Filed under 'operations' rather than a new one-item section: it is the
      // only nav entry both roles share besides boarding.
      items.push({ path: 'my-earnings', labelKey: 'STAFF.NAV.MY_EARNINGS', icon: 'payments', section: 'operations' });
    }

    // OBRS-312: weekly vehicle inspection checklist — driver-only.
    if (isDriver) {
      items.push({ path: 'inspection', labelKey: 'STAFF.NAV.INSPECTION', icon: 'checklist', section: 'operations' });
    }

    // ── Parcels ───────────────────────────────────────────────────────────────
    // OBRS-543 closes the gap OBRS-416's comment documented but only half-fixed:
    // 'parcels/verify' got a nav entry, 'parcels/consign' and 'parcels/deliveries'
    // (both shipped under OBRS-305) stayed direct-URL-only, so the work in that
    // card was in practice unshipped. Two more pages were orphaned transitively —
    // 'parcels/:id/waybill' is reachable only from consign, and
    // 'parcels/deliveries/:scheduleId' only from the deliveries entry page — so
    // these two entries restore four pages, not two.
    //
    // Grouped at the end rather than left where 'parcels/verify' sat, so all
    // three parcel screens render contiguously for both roles instead of being
    // split by 'boarding'. Each push sits in the block matching its route's own
    // requiredRoles (staff.module.ts): consign is salesperson-only, the other two
    // admit drivers too. modules/nav-reachability.spec.ts enforces both halves —
    // that no page is orphaned, and that no link is shown to a role the guard
    // would bounce.
    //
    // OBRS-573: contiguity is no longer load-bearing here — `section: 'parcels'`
    // is what puts these three together under one heading, wherever they are
    // pushed from. They stay at the end so the flat array still reads in render
    // order.
    if (isSalesperson) {
      items.push({ path: 'parcels/consign', labelKey: 'STAFF.NAV.PARCEL_CONSIGN', icon: 'inventory_2', section: 'parcels' });
    }

    // OBRS-574: one entry, not two. 'parcels/deliveries' and 'parcels/verify'
    // were two doors onto the same trip — the driver now picks the trip once
    // and the two jobs are tabs on 'parcels/schedule'. The old paths still
    // resolve (redirects in staff.module.ts) but are no longer offered here:
    // leaving them would keep on screen exactly the choice this removed.
    if (isSalesperson || isDriver) {
      items.push({ path: 'parcels/schedule', labelKey: 'STAFF.NAV.PARCEL_SCHEDULE', icon: 'local_shipping', section: 'parcels' });
    }

    return items;
  }

  // OBRS-573: group a flat item list into the ordered sections of SECTION_ORDER,
  // DROPPING any section left with no items. That drop is the whole reason this
  // is computed rather than hard-coded in the template: salesperson and driver
  // see different item sets, so 'sales' is genuinely empty for a driver, and a
  // heading floating over nothing reads as a menu that failed to load.
  private buildSections(items: StaffNavItem[]): StaffNavSection[] {
    return SECTION_ORDER.map(({ key, titleKey }) => ({
      key,
      titleKey,
      items: items.filter((item) => item.section === key),
    })).filter((section) => section.items.length > 0);
  }

  protected trackNavItem(_index: number, item: StaffNavItem): string {
    return item.path;
  }

  protected trackNavSection(_index: number, section: StaffNavSection): string {
    return section.key;
  }

  constructor(private readonly notificationInboxService: NotificationInboxService) {
    super();
  }

  override ngOnInit(): void {
    // Build nav items and check admin role before calling super so that the
    // route subscription (which fires synchronously via startWith) already has
    // navItems in place.
    this.navItems = this.buildNavItems();
    this.navSections = this.buildSections(this.navItems);
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
