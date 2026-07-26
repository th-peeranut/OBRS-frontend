import { Type } from '@angular/core';
import { BookingPolicyConfigPageComponent } from '../booking-policy-config/booking-policy-config-page.component';
import { ConfigChangeHistoryPageComponent } from '../config-change-history/config-change-history-page.component';
import { JumpSeatConfigPageComponent } from '../jump-seat-config/jump-seat-config-page.component';
import { ReminderConfigPageComponent } from '../reminder-config/reminder-config-page.component';

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
   * EXACTLY the `requiredRoles` the standalone route carried. Consolidating
   * pages must not widen access (OBRS-702 AC), and these are genuinely two
   * different audiences: `['admin']` is admin-only, whereas `['admin','owner']`
   * also admits a plain owner (AuthService.ROLE_GRANTS grants owner to admin,
   * not the reverse — OBRS-446).
   */
  readonly requiredRoles: readonly string[];
  readonly component: Type<unknown>;
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
    requiredRoles: ['admin'],
    component: ReminderConfigPageComponent,
  },
  {
    path: 'jump-seat',
    legacyPath: 'jump-seat-config',
    labelKey: 'ADMIN.PAGES.JUMP_SEAT_CONFIG',
    subtitleKey: 'ADMIN.JUMP_SEAT_CONFIG.SUBTITLE',
    requiredRoles: ['admin'],
    component: JumpSeatConfigPageComponent,
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
 * page that replaced it. Each tab keeps its own, narrower guard; the union only
 * opens the shell.
 */
export const SYSTEM_SETTINGS_ROLES: readonly string[] = Array.from(
  new Set(SYSTEM_SETTINGS_TABS.flatMap((tab) => [...tab.requiredRoles]))
);
