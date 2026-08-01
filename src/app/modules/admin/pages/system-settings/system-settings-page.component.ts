import { Component } from '@angular/core';
import { AuthService } from '../../../../auth/auth.service';
import { SYSTEM_SETTINGS_TABS, SystemSettingsTab } from './system-settings-tabs';

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
  protected readonly tabs: readonly SystemSettingsTab[];

  constructor(authService: AuthService) {
    this.tabs = SYSTEM_SETTINGS_TABS.filter((tab) =>
      authService.hasAnyRole([...tab.requiredRoles])
    );
  }
}
