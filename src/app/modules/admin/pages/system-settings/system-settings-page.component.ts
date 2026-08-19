import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../../auth/auth.service';
import {
  groupSystemSettingsTabs,
  SYSTEM_SETTINGS_TABS,
  SystemSettingsTabGroup,
} from './system-settings-tabs';

/**
 * `/admin/settings` — OBRS-702. One "System settings" page whose tabs are the
 * config pages that used to be four separate sidebar entries over ONE table
 * (`system_configs`). The owner should not have to remember which menu holds
 * the number they want to change, and the queue held at least three more groups
 * (OBRS-699/703/705) that would each have added another entry.
 *
 * <p>Holds no config logic of its own: every tab is the existing page component,
 * moved under a child route and otherwise untouched. Each keeps its own store,
 * its own form and its own save call, so nothing can leak across tabs — the tab
 * being left is destroyed before the next one is created.
 *
 * <p><b>Access is asked per tab, not per page.</b> The shell route admits the
 * UNION of the tabs' roles ({@link SYSTEM_SETTINGS_ROLES}); each child route
 * keeps its original guard verbatim; and this strip renders only the tabs the
 * visitor's own route guard would admit, so no tab is shown that would bounce
 * on click and none is hidden that would have opened.
 *
 * <p><b>OBRS-1432: the strip renders one entry per TOPIC, not per tab.</b> The
 * `.nav-tabs` primitive is `flex-wrap: wrap` with no cap, so the row count grew
 * with the tab count — measured on live SIT: 8 tabs are 2 rows on a 1,366px
 * laptop, and 4 rows at 400px, with two more tabs already queued (OBRS-703/705).
 * Grouping is what breaks that link: a group of two or more collapses into one
 * dropdown, so a new tab that joins an existing topic adds NOTHING to the strip.
 * A group of one stays the plain link it was — a dropdown onto a single item is
 * a click for nothing. Owner chose this over a vertical sub-nav (which would sit
 * beside a sidebar already 227px wide) and over a scrolling single row (which
 * would not have helped the 400px case at all).
 *
 * <p>Today that filter removes nothing for anyone who gets through the shell
 * guard: `AuthService.ROLE_GRANTS` makes `['admin']` and `['admin','owner']`
 * one predicate (owner grants admin and admin grants owner), so admin and
 * owner both see all four tabs — exactly the four sidebar entries both roles
 * saw before this card. The per-tab filter is here because the routes record
 * DIFFERENT intent, and the day owner-scoping makes that intent real the strip
 * must follow the guards rather than have to be found and taught to.
 * See the note on {@link SystemSettingsTab.requiredRoles}.
 */
@Component({
    selector: 'app-system-settings-page',
    templateUrl: './system-settings-page.component.html',
    styleUrl: './system-settings-page.component.scss',
    standalone: false
})
export class SystemSettingsPageComponent {
  /**
   * Stable field, computed once — NOT a getter. A getter returning a new array
   * each cycle breaks `*ngFor` + `routerLinkActive` and change detection never
   * stabilises (same rule as AdminLayoutComponent.navItems).
   */
  protected readonly groups: readonly SystemSettingsTabGroup[];

  constructor(authService: AuthService, private readonly router: Router) {
    this.groups = groupSystemSettingsTabs(
      SYSTEM_SETTINGS_TABS.filter((tab) => authService.hasAnyRole([...tab.requiredRoles]))
    );
  }

  /**
   * OBRS-1432: whether the open tab is inside this group, so a collapsed group
   * still shows which one you are on.
   *
   * <p>`routerLinkActive` cannot answer this — the trigger is not a link, and
   * the directive on the items inside is not reachable from the trigger's
   * template scope. Matching whole URL SEGMENTS rather than a substring, so a
   * tab path is never found inside a longer one; `notification-messages`'s own
   * children (`.../reviews/:id`) keep their group lit because the tab's segment
   * is still in the URL.
   */
  /** `…GROUPS.SALES_POLICY` → `sales-policy`, so the strip's test ids read like its paths do. */
  protected groupTestId(group: SystemSettingsTabGroup): string {
    return group.labelKey.split('.').pop()!.toLowerCase().replace(/_/g, '-');
  }

  protected isGroupActive(group: SystemSettingsTabGroup): boolean {
    const segments = this.router.url.split(/[?#]/)[0].split('/');
    return group.tabs.some((tab) => segments.includes(tab.path));
  }
}
