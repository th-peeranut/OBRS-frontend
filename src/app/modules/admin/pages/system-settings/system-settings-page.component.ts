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
 * <p><b>Access is per tab, not per page.</b> The four pages did NOT share an
 * audience — reminders and jump-seat are `['admin']` while booking-policy and
 * history are `['admin','owner']`, and under ROLE_GRANTS (OBRS-446) a plain
 * owner satisfies the second but not the first. So the shell route admits the
 * UNION ({@link SYSTEM_SETTINGS_ROLES}) and each child route keeps its original
 * guard verbatim; this strip renders only the tabs the visitor's own route
 * guard would admit, so no tab is shown that would bounce on click.
 */
@Component({
  selector: 'app-system-settings-page',
  templateUrl: './system-settings-page.component.html',
  styleUrl: './system-settings-page.component.scss',
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
