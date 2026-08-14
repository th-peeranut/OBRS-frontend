import { Component } from '@angular/core';
import { AuthService } from '../../../../auth/auth.service';

/**
 * OBRS-1308 — `/admin/settings/notification-messages` shell. Reuses the
 * URL-driven `nav nav-tabs` + `<router-outlet>` shape `SystemSettingsPageComponent`
 * already uses one level up (OBRS-574), for an internal 2-item sub-nav:
 * "Messages" (the owner list, `routerLink="."`) and "Pending review" (the admin
 * queue, `routerLink="reviews"`).
 *
 * <p><b>AC5:</b> the "Pending review" link is rendered only when
 * `authService.getRoles().includes('admin')` — never `hasAnyRole(['admin'])`
 * and never this tab's own `requiredRoles`. `ROLE_GRANTS` is symmetric
 * (`auth.service.ts:84-…`), so `hasAnyRole(['admin'])` also admits a plain
 * owner and would show the link to someone who'd 403 on click. `getRoles()`
 * reads the raw stored roles, un-expanded — see `auth.service.ts:287-305`.
 * Hidden entirely, never shown-then-403'd; the review queue/detail pages
 * repeat this same raw-role check as their OWN first line of defense (a
 * direct deep-link bypasses this nav entirely), so this hide is UX only, not
 * the security boundary.
 */
@Component({
    selector: 'app-notification-messages-tab-page',
    templateUrl: './notification-messages-tab-page.component.html',
    styleUrl: './notification-messages-tab-page.component.scss',
    standalone: false
})
export class NotificationMessagesTabPageComponent {
  protected readonly showReviewsTab: boolean;

  constructor(authService: AuthService) {
    this.showReviewsTab = authService.getRoles().includes('admin');
  }
}
