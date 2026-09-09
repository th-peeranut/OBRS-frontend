import { Type } from '@angular/core';
import { Route } from '@angular/router';
import { BookingPolicyConfigPageComponent } from '../booking-policy-config/booking-policy-config-page.component';
import { ConfigChangeHistoryPageComponent } from '../config-change-history/config-change-history-page.component';
import { JumpSeatConfigPageComponent } from '../jump-seat-config/jump-seat-config-page.component';
import { ReminderConfigPageComponent } from '../reminder-config/reminder-config-page.component';
import { ParcelShareConfigPageComponent } from '../parcel-share-config/parcel-share-config-page.component';
import { DriverCashRatesPageComponent } from '../driver-cash-rates/driver-cash-rates-page.component';
import { CancelReschedulePolicyConfigPageComponent } from '../cancel-reschedule-policy-config/cancel-reschedule-policy-config-page.component';
import { OperationsConfigPageComponent } from '../operations-config/operations-config-page.component';
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
  /**
   * OBRS-1432: i18n key of the topic this tab belongs to. The strip renders one
   * entry per GROUP, not per tab — a group of two or more collapses into a
   * dropdown, so the strip's width stops tracking the tab count.
   *
   * <p>This is the label key itself rather than an opaque id, because the key
   * IS the identity: two tabs are in one group exactly when they name the same
   * translation, and there is then no second table to keep in step.
   */
  readonly groupKey: string;
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
 *
 * <p><b>OBRS-1432: tabs sharing a {@link SystemSettingsTab.groupKey} must stay
 * ADJACENT here.</b> {@link groupSystemSettingsTabs} keys on first appearance,
 * so a group split across the array would render its dropdown once with the
 * strays folded back into it — the strip would be right while THIS array reads
 * as if it were not. The order spec in system-settings-page.component.spec.ts
 * is what catches that: it compares the rendered order to this array's, and a
 * non-adjacent entry is exactly what makes the two disagree.
 */
export const SYSTEM_SETTINGS_TABS: readonly SystemSettingsTab[] = [
  {
    path: 'booking-policy',
    legacyPath: 'booking-policy-config',
    labelKey: 'ADMIN.PAGES.BOOKING_POLICY_CONFIG',
    groupKey: 'ADMIN.SYSTEM_SETTINGS.GROUPS.SALES_POLICY',
    subtitleKey: 'ADMIN.BOOKING_POLICY_CONFIG.SUBTITLE',
    requiredRoles: ['admin', 'owner'],
    component: BookingPolicyConfigPageComponent,
  },
  {
    // OBRS-699: new. OBRS-1432 moved it up here, next to booking-policy: both
    // answer "what may a customer do to a ticket", and a group only collapses
    // into one dropdown entry if its members are adjacent. Nothing but the
    // rendered order changes — the path, the legacy redirect and the guard
    // are the ones it shipped with.
    // OBRS-1719: was ['owner'] — OwnerCancelReschedulePolicyConfigController
    // now resolves ADMIN to the platform's sole owner instead of rejecting it.
    path: 'cancel-reschedule-policy',
    legacyPath: 'cancel-reschedule-policy-config', // no prior standalone page; kept for interface parity
    labelKey: 'ADMIN.PAGES.CANCEL_RESCHEDULE_POLICY_CONFIG',
    groupKey: 'ADMIN.SYSTEM_SETTINGS.GROUPS.SALES_POLICY',
    subtitleKey: 'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.SUBTITLE',
    requiredRoles: ['admin', 'owner'],
    component: CancelReschedulePolicyConfigPageComponent,
  },
  {
    // OBRS-960: new. The OBRS-960 pair keeps the adjacency it shipped with,
    // and OBRS-1432 made that adjacency the group.
    // OBRS-1719: was ['owner'] — same backend reversal as
    // cancel-reschedule-policy above (ParcelShareConfigController).
    path: 'parcel-share',
    legacyPath: 'parcel-share-config',
    labelKey: 'ADMIN.PAGES.PARCEL_SHARE_CONFIG',
    groupKey: 'ADMIN.SYSTEM_SETTINGS.GROUPS.REVENUE_SHARE',
    subtitleKey: 'ADMIN.PARCEL_SHARE_CONFIG.SUBTITLE',
    requiredRoles: ['admin', 'owner'],
    component: ParcelShareConfigPageComponent,
  },
  {
    // OBRS-960: new.
    // OBRS-1719: was ['owner'] — same backend reversal as
    // cancel-reschedule-policy above (DriverPerHeadRateService).
    path: 'driver-cash-rates',
    legacyPath: 'driver-cash-rates',
    labelKey: 'ADMIN.PAGES.DRIVER_CASH_RATES',
    groupKey: 'ADMIN.SYSTEM_SETTINGS.GROUPS.REVENUE_SHARE',
    subtitleKey: 'ADMIN.DRIVER_CASH_RATES.SUBTITLE',
    requiredRoles: ['admin', 'owner'],
    component: DriverCashRatesPageComponent,
  },
  {
    path: 'reminders',
    legacyPath: 'reminder-config',
    labelKey: 'ADMIN.PAGES.REMINDER_CONFIG',
    groupKey: 'ADMIN.SYSTEM_SETTINGS.GROUPS.NOTIFICATIONS',
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
    // OBRS-1308: owner-editable notification message overrides + admin
    // approval queue. OBRS-1432 moved it up beside `reminders`, which is the
    // other half of "what the system says to people, and when". requiredRoles
    // matches the backend owner controller (hasRole('OWNER') admits ADMIN via
    // ROLE_GRANTS) — the SEPARATE admin-only review queue/detail underneath
    // this tab is gated at the component level (getRoles().includes('admin')),
    // never by requiredRoles/hasAnyRole (AC5 — see the doc above and
    // auth.service.ts:287-339: hasAnyRole is ROLE_GRANTS-expanded and
    // symmetric, so it cannot express "admin, not owner").
    path: 'notification-messages',
    legacyPath: 'notification-messages', // no prior standalone page; kept for interface parity
    labelKey: 'ADMIN.PAGES.NOTIFICATION_MESSAGES',
    groupKey: 'ADMIN.SYSTEM_SETTINGS.GROUPS.NOTIFICATIONS',
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
    // Sole member of its group today, so OBRS-1432 renders it as the plain link
    // it has always been — a dropdown that opens onto one item is a click for
    // nothing. It becomes a dropdown by itself the day a second tab names this
    // same groupKey; the template asks the group's size, not this tab.
    path: 'jump-seat',
    legacyPath: 'jump-seat-config',
    labelKey: 'ADMIN.PAGES.JUMP_SEAT_CONFIG',
    groupKey: 'ADMIN.SYSTEM_SETTINGS.GROUPS.SEATING',
    subtitleKey: 'ADMIN.JUMP_SEAT_CONFIG.SUBTITLE',
    // OBRS-1016 / ADR-0120: same move as the reminders tab above — the backend
    // GET/PUT /private/admin/configs/jump-seat is hasRole('OWNER') now.
    requiredRoles: ['admin', 'owner'],
    component: JumpSeatConfigPageComponent,
  },
  {
    // OBRS-703: new — sixth group. None of the five existing groups fit:
    // SALES_POLICY is about a customer's rights over a ticket already booked
    // (this is about the operational clock the platform runs on), and
    // NOTIFICATIONS only ever admitted the one near-full alert, not the other
    // three values PUT writes as a unit (BR-7 all-or-nothing), so splitting
    // them across three existing groups isn't possible without breaking that
    // atomicity's meaning on screen. Placed after jump-seat/SEATING and before
    // the meta "history" tab below, which must stay last.
    path: 'operations',
    legacyPath: 'operations-config', // no prior standalone page; kept for interface parity
    labelKey: 'ADMIN.PAGES.OPERATIONS_CONFIG',
    groupKey: 'ADMIN.SYSTEM_SETTINGS.GROUPS.OPERATIONS',
    subtitleKey: 'ADMIN.OPERATIONS_CONFIG.SUBTITLE',
    // Owner-scoped endpoint (GET/PUT/DELETE /private/owner/configs/operations).
    // OBRS-1719: was ['owner'] — the endpoint's 403 for ADMIN is gone
    // (getCurrentOwnerId() now resolves ADMIN to the sole owner), so this is
    // ['admin','owner'] like the other tabs above, not the exception it used
    // to document.
    requiredRoles: ['admin', 'owner'],
    component: OperationsConfigPageComponent,
  },
  {
    // Last: the "meta" view over every other tab, same placement it held as the
    // last entry of the sidebar's System section (OBRS-576). Also a one-tab
    // group, so it stays a plain link too.
    path: 'history',
    legacyPath: 'config-change-history',
    labelKey: 'ADMIN.PAGES.CONFIG_CHANGE_HISTORY',
    groupKey: 'ADMIN.SYSTEM_SETTINGS.GROUPS.SYSTEM',
    subtitleKey: 'ADMIN.CONFIG_CHANGE_HISTORY.SUBTITLE',
    requiredRoles: ['admin', 'owner'],
    component: ConfigChangeHistoryPageComponent,
  },
];

/** One rendered entry of the `/admin/settings` strip — see {@link groupSystemSettingsTabs}. */
export interface SystemSettingsTabGroup {
  /** i18n key shown on the dropdown trigger. Unused when `tabs` holds one tab. */
  readonly labelKey: string;
  readonly tabs: readonly SystemSettingsTab[];
}

/**
 * OBRS-1432: the tabs a visitor may see, folded into the entries the strip
 * actually renders. Keyed on first appearance, so the group order is the order
 * each group's first tab appears in {@link SYSTEM_SETTINGS_TABS}.
 *
 * <p>Runs on the ALREADY role-filtered list, never on the full table: a group
 * whose every tab is hidden must not render an empty dropdown, and one with a
 * single visible tab must render that tab as a link rather than bury it.
 */
export function groupSystemSettingsTabs(
  tabs: readonly SystemSettingsTab[]
): readonly SystemSettingsTabGroup[] {
  const byKey = new Map<string, SystemSettingsTab[]>();
  for (const tab of tabs) {
    const members = byKey.get(tab.groupKey);
    if (members) members.push(tab);
    else byKey.set(tab.groupKey, [tab]);
  }
  return Array.from(byKey, ([labelKey, groupTabs]) => ({ labelKey, tabs: groupTabs }));
}

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
