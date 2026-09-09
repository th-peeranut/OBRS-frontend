import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';

/**
 * OBRS-1721 — the persistent strip shown while "ดูในมุมมองของ…" is active.
 *
 * Rendered from app.component.html, ABOVE the router outlet, for the same two
 * reasons `app-booking-closed-notice` sits there (OBRS-1302): in normal flow it
 * can never cover a control and needs no z-index, and being first in the DOM it
 * is the first thing a screen reader announces on the page.
 *
 * It has to be app-level rather than per-shell: the previewed role is a global
 * mode, and the viewer can walk out of the admin/staff shells into the customer
 * area while it is on. A banner that disappeared there would be a banner that
 * disappears exactly where the layout stops explaining itself.
 *
 * The second sentence is the load-bearing one. The backend scopes data by
 * identity, not by role, so the preview shows another role's LAYOUT over the
 * viewer's OWN records — someone who read this strip as "I am now looking at
 * that person's data" would draw the wrong conclusion from every number on the
 * screen.
 */
@Component({
  selector: 'app-role-preview-banner',
  templateUrl: './role-preview-banner.component.html',
  styleUrl: './role-preview-banner.component.scss',
  standalone: false,
})
export class RolePreviewBannerComponent {
  protected readonly previewRole$: Observable<string | null>;

  constructor(private readonly authService: AuthService) {
    this.previewRole$ = this.authService.previewRole$;
  }

  /** Roles are a closed set (AuthService.PREVIEWABLE_ROLES), so this maps
   *  straight onto a key rather than needing a lookup table. */
  protected roleLabelKey(role: string): string {
    return `ROLE_PREVIEW.ROLES.${role.toUpperCase()}`;
  }

  protected onExit(): void {
    this.authService.exitRolePreview();
  }
}
