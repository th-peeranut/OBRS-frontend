import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../auth/auth.service';

/**
 * Minimal customer identity-settings page (OBRS-84). Guard/route shape is
 * copied from `/my-bookings` (AuthGuard, `customerArea: true, requireAuth:
 * true`); the shell is `<app-navbar>` + a header + a single card, modeled on
 * `my-bookings.component.html`. The current login email is read from
 * `AuthService.getUsername()` — the username IS the login email in this app,
 * already cached in localStorage from login, so no new GET is needed just to
 * render this page. See docs/adr/0014-account-identity-settings-page.md.
 */
@Component({
  selector: 'app-account-page',
  templateUrl: './account-page.component.html',
  styleUrl: './account-page.component.scss',
})
export class AccountPageComponent implements OnInit {
  currentEmail: string | null = null;
  isChangeEmailDialogOpen = false;

  constructor(private readonly authService: AuthService) {}

  ngOnInit(): void {
    this.currentEmail = this.authService.getUsername();
  }

  openChangeEmailDialog(): void {
    this.isChangeEmailDialogOpen = true;
  }

  closeChangeEmailDialog(): void {
    this.isChangeEmailDialogOpen = false;
  }
}
