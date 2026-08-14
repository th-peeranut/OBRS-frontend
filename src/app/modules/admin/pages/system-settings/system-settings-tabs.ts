import { Type } from '@angular/core';
import { Route } from '@angular/router';
import { BookingPolicyConfigPageComponent } from '../booking-policy-config/booking-policy-config-page.component';
import { ConfigChangeHistoryPageComponent } from '../config-change-history/config-change-history-page.component';
import { JumpSeatConfigPageComponent } from '../jump-seat-config/jump-seat-config-page.component';
import { ReminderConfigPageComponent } from '../reminder-config/reminder-config-page.component';
import { ParcelShareConfigPageComponent } from '../parcel-share-config/parcel-share-config-page.component';
import { DriverCashRatesPageComponent } from '../driver-cash-rates/driver-cash-rates-page.component';
import { NotificationMessagesTabPageComponent } from '../notification-messages/notification-messages-tab-page.component';
import { NotificationMessageListPageComponent } from '../notification-messages/notification-message-list-page.component';
import { NotificationMessageEditPageComponent } from '../notification-messages/notification-message-edit-page.component';
import { NotificationMessageReviewQueuePageComponent } from '../notification-messages/notification-message-review-queue-page.component';
import { NotificationMessageReviewDetailPageComponent } from '../notification-messages/notification-message-review-detail-page.component';

/** One tab of `/admin/settings` — see {@link SYSTEM_SETTINGS_TABS}. */
export interface SystemSettingsTab {
  /** Child path under `/admin/settings`. */
  readonly path: string;
  /**
   * The standalone `/admin/<path>` this tab used to be. Kept as a redirect
   * (never deleted) — the old URLs are quoted in code comments across both
   * portals and may be bookmarked.
   */
  readonly legacyPath: string;
  /** Tab label. Reuses the standalone page's own nav label, already translated. */
  readonly labelKey: string;
  /** Page subtitle while this tab is open. Reuses the standalone page's. */
  readonly subtitleKey: string;
  /**
   * EXACTLY the `requiredRoles` the standalone route carried — consolidating
   * pages must change access in NEITHER direction (OBRS-702 AC).
   *
   * <p><b>`['admin']` is not admin-only on this frontend, and reading it that
   * way is a trap this card fell into and had to back out of.</b>
   * `AuthService.ROLE_GRANTS` is symmetric at the top: `owner` grants `admin`
   * AND `admin` grants `owner` (auth.service.ts:60-62). So
   * `hasAnyRole(['admin'])`, `hasAnyRole(['owner'])` and
   * `hasAnyRole(['admin','owner'])` are ONE predicate today — all four of
   * these pages were already reachable by both roles before this card, and
   * their sidebar entries were all shown to both. The difference between the
   * two values is recorded INTENT, inert until owner-scoping lands; the same
   * standing the OBRS-446 comment gives settlements' `['owner']`.
   *
   * <p>They are copied verbatim rather than flattened, because the day
   * owner-scoping makes the distinction real these routes must already say
   * which side they meant. system-settings-page.component.spec.ts pins them
   * against a frozen copy of what shipped and asks the REAL AuthService —
   * never a re-implementation — which roles each one admits. A hand-written
   * `hasAnyRole` stub is exactly what hid the grant direction here.
   */
  readonly requiredRoles: readonly string[];
  readonly component: Type<unknown>;
  /**
   * OBRS-1308: optional deep-linkable sub-routes under this tab's own path.
   * `undefined` for every tab but `notification-messages` — the first tab
   * that needs a real child route reachable from a SECOND surface (the
   * notification-bell inbox navigating straight into a review detail), not
   * just internal `*ngSwitch` state a query param could express.
   *
   * <p>The generator in `admin.module.ts` spreads
   * `...(tab.children ? { children: … } : {})` so every tab without this
   * field produces a byte-identical route to before — no hand-added
   * route/redirect/tab-strip entry (AC9) — and it INJECTS this tab's own
   * `data` (titleKey/subtitleKey/requiredRoles) into each child's `data`
   * rather than leaving the child to declare its own. Without that
   * injection, `SidebarLayoutBaseComponent.getDeepestRoute()` descends into
   * a child with no `data` and falls back to the generic
   * `ADMIN.PAGES.DEFAULT` header — invisible to
   * `system-settings-page.component.spec.ts`, which never activates a child.
   * See `system-settings-notification-messages-routes.spec.ts`, which
   * deep-links a child and asserts the resolved header.
   */
  readonly children?: Route[];
}

/**
 * OBRS-702: the single source for the `/admin/settings` tabs. The child routes,
 * the legacy redirects and the rendered tab strip are ALL derived from this one
 * array (admin.module.ts / system-settings-page.component.ts), so a new tab
 * cannot ship routed-but-not-rendered, rendered-but-unguarded, or with an
 * access level that drifts from its route guard.
 *
 * <p>Order is the rendered order. `booking-policy` must stay FIRST: the parent
 * route redirects its empty path there, so the first tab's `requiredRoles` have
 * to admit everyone the parent admits. {@link SYSTEM_SETTINGS_ROLES} is that
 * parent set, and system-settings-page.component.spec.ts asserts the invariant.
 */
export const SYSTEM_SETTINGS_TABS: readonly SystemSettingsTab[] = [
  {
    path: 'booking-policy',
    legacyPath: 'booking-policy-config',
    labelKey: 'ADMIN.PAGES.BOOKING_POLICY_CONFIG',
    subtitleKey: 'ADMIN.BOOKING_POLICY_CONFIG.SUBTITLE',
    requiredRoles: ['admin', 'owner'],
    component: BookingPolicyConfigPageComponent,
  },
  {
    path: 'reminders',
    legacyPath: 'reminder-config',
    labelKey: 'ADMIN.PAGES.REMINDER_CONFIG',
    subtitleKey: 'ADMIN.REMINDER_CONFIG.SUBTITLE',
    // OBRS-1016: was ['admin']. Inert either way (ROLE_GRANTS makes all three
    // spellings one predicate today), but the backend guard on
    // GET/PUT /private/admin/configs/reminders moved from hasRole('ADMIN') to
    // hasRole('OWNER') — an owner who reached this tab used to get a 403 and an
    // empty card. Per the doc above, the literal must say which side it means
    // for the day owner-scoping makes it bite; after ADR-0120 that side is owner.
    requiredRoles: ['admin', 'owner'],
    component: ReminderConfigPageComponent,
  },
  {
    path: 'jump-seat',
    legacyPath: 'jump-seat-config',
    labelKey: 'ADMIN.PAGES.JUMP_SEAT_CONFIG',
    subtitleKey: 'ADMIN.JUMP_SEAT_CONFIG.SUBTITLE',
    // OBRS-1016 / ADR-0120: same move as the reminders tab above — the backend
    // GET/PUT /private/admin/configs/jump-seat is hasRole('OWNER') now.
    requiredRoles: ['admin', 'owner'],
    component: JumpSeatConfigPageComponent,
  },
  {
    // OBRS-960: owner-only, new. Placed after the pre-existing four tabs and
    // before the "meta" history tab (which stays last, per its own comment).
    path: 'parcel-share',
    legacyPath: 'parcel-share-config',
    labelKey: 'ADMIN.PAGES.PARCEL_SHARE_CONFIG',
    subtitleKey: 'ADMIN.PARCEL_SHARE_CONFIG.SUBTITLE',
    requiredRoles: ['owner'],
    component: ParcelShareConfigPageComponent,
  },
  {
    // OBRS-960: owner-only, new.
    path: 'driver-cash-rates',
    legacyPath: 'driver-cash-rates',
    labelKey: 'ADMIN.PAGES.DRIVER_CASH_RATES',
    subtitleKey: 'ADMIN.DRIVER_CASH_RATES.SUBTITLE',
    requiredRoles: ['owner'],
    component: DriverCashRatesPageComponent,
  },
  {
    // OBRS-1308: owner-editable notification message overrides + admin
    // approval queue. Placed after driver-cash-rates and before the "meta"
    // history tab (which stays last, per its own comment). requiredRoles
    // matches the backend owner controller (hasRole('OWNER') admits ADMIN via
    // ROLE_GRANTS) — the SEPARATE admin-only review queue/detail underneath
    // this tab is gated at the component level (getRoles().includes('admin')),
    // never by requiredRoles/hasAnyRole (AC5 — see the doc above and
    // auth.service.ts:287-339: hasAnyRole is ROLE_GRANTS-expanded and
    // symmetric, so it cannot express "admin, not owner").
    path: 'notification-messages',
    legacyPath: 'notification-messages', // no prior standalone page; kept for interface parity
    labelKey: 'ADMIN.PAGES.NOTIFICATION_MESSAGES',
    subtitleKey: 'ADMIN.NOTIFICATION_MESSAGES.SUBTITLE',
    requiredRoles: ['admin', 'owner'],
    component: NotificationMessagesTabPageComponent,
    children: [
      { path: '', component: NotificationMessageListPageComponent },
      { path: 'edit/:messageCode/:locale', component: NotificationMessageEditPageComponent },
      { path: 'reviews', component: NotificationMessageReviewQueuePageComponent },
      { path: 'reviews/:id', component: NotificationMessageReviewDetailPageComponent },
    ],
  },
  {
    // Last: the "meta" view over every other tab, same placement it held as the
    // last entry of the sidebar's System section (OBRS-576).
    path: 'history',
    legacyPath: 'config-change-history',
    labelKey: 'ADMIN.PAGES.CONFIG_CHANGE_HISTORY',
    subtitleKey: 'ADMIN.CONFIG_CHANGE_HISTORY.SUBTITLE',
    requiredRoles: ['admin', 'owner'],
    component: ConfigChangeHistoryPageComponent,
  },
];

/**
 * Roles admitted to `/admin/settings` itself — the UNION of the tabs' roles, so
 * nobody who could reach one of the old standalone pages is locked out of the
 * page that replaced it. Each tab keeps its own guard; the union only opens the
 * shell.
 *
 * <p>Derived, never hand-written: the day a tab is added with a role no other
 * tab carries, the shell has to admit it or that tab is unreachable through the
 * only door there is.
 */
export const SYSTEM_SETTINGS_ROLES: readonly string[] = Array.from(
  new Set(SYSTEM_SETTINGS_TABS.flatMap((tab) => [...tab.requiredRoles]))
);
